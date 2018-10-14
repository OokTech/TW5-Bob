/*\
title: $:/plugins/OokTech/Bob/WebsocketAdaptor.js
type: application/javascript
module-type: syncadaptor

A sync adaptor module for synchronising using Websockets

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.platforms = ["node"];

// Get a reference to the file system
var fs = $tw.node ? require("fs") : null,
  path = $tw.node ? require("path") : null;

if($tw.node) {

  function WebsocketAdaptor(options) {
    var self = this;
    this.wiki = options.wiki;
    this.logger = new $tw.utils.Logger("WebsocketAdaptor",{colour: "blue"});
  }

  WebsocketAdaptor.prototype.name = "WebsocketAdaptor";

  WebsocketAdaptor.prototype.isReady = function() {
    // The file system adaptor is always ready
    return true;
  };

  WebsocketAdaptor.prototype.getTiddlerInfo = function(tiddler) {
    return {};
  };

  /*
  Return a fileInfo object for a tiddler, creating it if necessary:
    filepath: the absolute path to the file containing the tiddler
    type: the type of the tiddler file (NOT the type of the tiddler -- see below)
    hasMetaFile: true if the file also has a companion .meta file

  The boot process populates $tw.boot.files for each of the tiddler files that it loads. The type is found by looking up the extension in $tw.config.fileExtensionInfo (eg "application/x-tiddler" for ".tid" files).

  It is the responsibility of the filesystem adaptor to update $tw.boot.files for new files that are created.
  */
  WebsocketAdaptor.prototype.getTiddlerFileInfo = function(tiddler, prefix, callback) {
    prefix = prefix || '';
    if (!callback) {
      callback = function (err, fileInfo) {
        if (err) {
          console.log(err);
        } else {
          return fileInfo;
        }
      }
    }
    // See if we've already got information about this file
    var self = this,
      title = tiddler.fields.title;
    var internalTitle = '{' + prefix + '}' + title;
    var fileInfo = $tw.boot.files[internalTitle];
    if(fileInfo) {
      // If so, just invoke the callback
      callback(null,fileInfo);
    } else {
      // Otherwise, we'll need to generate it
      fileInfo = {};
      var tiddlerType = tiddler.fields.type || "text/vnd.tiddlywiki";
      // Get the content type info
      var contentTypeInfo = $tw.config.contentTypeInfo[tiddlerType] || {};
      // Get the file type by looking up the extension
      var extension = contentTypeInfo.extension || ".tid";
      fileInfo.type = ($tw.config.fileExtensionInfo[extension] || {type: "application/x-tiddler"}).type;
      // Use a .meta file unless we're saving a .tid file.
      // (We would need more complex logic if we supported other template rendered tiddlers besides .tid)
      fileInfo.hasMetaFile = (fileInfo.type !== "application/x-tiddler") && (fileInfo.type !== "application/json");
      if(!fileInfo.hasMetaFile) {
        extension = ".tid";
      }
      // Generate the base filepath and ensure the directories exist
      $tw.Bob.Wikis = $tw.Bob.Wikis || {};
      $tw.Bob.Wikis[prefix] = $tw.Bob.Wikis[prefix] || {};
      // A cludge to make things work
      if (prefix === 'RootWiki') {
        $tw.Bob.Wikis[prefix].wikiTiddlersPath = $tw.Bob.Wikis[prefix].wikiTiddlersPath || $tw.boot.wikiTiddlersPath;
      }
      var tiddlersPath = $tw.Bob.Wikis[prefix].wikiTiddlersPath;
      var baseFilepath = path.resolve(tiddlersPath, self.generateTiddlerBaseFilepath(title, prefix));
      $tw.utils.createFileDirectories(baseFilepath);
      // Start by getting a list of the existing files in the directory
      fs.readdir(path.dirname(baseFilepath),function(err,files) {
        if(err) {
          return callback(err);
        }
        // Start with the base filename plus the extension
        var filepath = baseFilepath;
        if(filepath.substr(-extension.length).toLocaleLowerCase() !== extension.toLocaleLowerCase()) {
          filepath = filepath + extension;
        }
        var filename = path.basename(filepath),
          count = 1;
        // Add a discriminator if we're clashing with an existing filename while
        // handling case-insensitive filesystems (NTFS, FAT/FAT32, etc.)
        while(files.some(function(value) {return value.toLocaleLowerCase() === filename.toLocaleLowerCase();})) {
          filepath = baseFilepath + " " + (count++) + extension;
          filename = path.basename(filepath);
        }
        // Set the final fileInfo
        fileInfo.filepath = filepath;
  console.log("\x1b[1;35m" + "For " + title + ", type is " + fileInfo.type + " hasMetaFile is " + fileInfo.hasMetaFile + " filepath is " + fileInfo.filepath + "\x1b[0m");
        $tw.boot.files[internalTitle] = fileInfo;
        $tw.Bob.Wikis[prefix].tiddlers = $tw.Bob.Wikis[prefix].tiddlers || [];
        if ($tw.Bob.Wikis[prefix].tiddlers.indexOf(title) !== -1) {
          $tw.Bob.Wikis[prefix].tiddlers.push(title);
        }
        // Pass it to the callback
        callback(null,fileInfo);
      });
    }
  };

  /*
  Given a list of filters, apply every one in turn to source, and return the first result of the first filter with non-empty result.
  */
  WebsocketAdaptor.prototype.findFirstFilter = function(filters,source) {
    for(var i=0; i<filters.length; i++) {
      var result = this.wiki.filterTiddlers(filters[i],null,source);
      if(result.length > 0) {
        return result[0];
      }
    }
    return null;
  };

  /*
  Given a tiddler title and an array of existing filenames, generate a new legal filename for the title, case insensitively avoiding the array of existing filenames
  */
  WebsocketAdaptor.prototype.generateTiddlerBaseFilepath = function(title, wiki) {
    if (title.startsWith('{')) {
      var ending = title.indexOf('}');
      // If ending is -1 than this just returns the title, otherwise it cuts
      // off the prefix.
      title = title.slice(ending+1)
    }
    var baseFilename;
    // Check whether the user has configured a tiddler -> pathname mapping
    var pathNameFilters = $tw.Bob.Wikis[wiki].wiki.getTiddlerText("$:/config/FileSystemPaths");
    if(pathNameFilters) {
      var source = $tw.Bob.Wikis[wiki].wiki.makeTiddlerIterator([title]);
      baseFilename = this.findFirstFilter(pathNameFilters.split("\n"),source);
      if(baseFilename) {
        // Interpret "/" and "\" as path separator
        baseFilename = baseFilename.replace(/\/|\\/g,path.sep);
      }
    }
    if(!baseFilename) {
      // No mappings provided, or failed to match this tiddler so we use title as filename
      baseFilename = title.replace(/\/|\\/g,"_");
    }
    // Remove any of the characters that are illegal in Windows filenames
    var baseFilename = $tw.utils.transliterate(baseFilename.replace(/<|>|\:|\"|\||\?|\*|\^/g,"_"));
    // Truncate the filename if it is too long
    if(baseFilename.length > 200) {
      baseFilename = baseFilename.substr(0,200);
    }
    return baseFilename;
  };

  /*
  Save a tiddler and invoke the callback with (err,adaptorInfo,revision)
  */
  WebsocketAdaptor.prototype.saveTiddler = function(tiddler, prefix, callback) {
    if (typeof prefix === 'function') {
      callback = prefix;
      prefix = null;
    }
    if (typeof callback !== 'function') {
      callback = function () {

      }
    }
    prefix = prefix || 'RootWiki';
    if (tiddler && $tw.Bob.ExcludeList.indexOf(tiddler.fields.title) === -1 && !tiddler.fields.title.startsWith('$:/state/') && !tiddler.fields.title.startsWith('$:/temp/')) {
      var self = this;
      self.getTiddlerFileInfo(tiddler, prefix,
       function(err,fileInfo) {
        if(err) {
          return callback(err);
        }
        var filepath = fileInfo.filepath,
          error = $tw.utils.createDirectory(path.dirname(filepath));
        if(error) {
          return callback(error);
        }
        // Save the tiddler in memory.
        internalSave(tiddler, prefix);
        // Handle saving to the file system
        if(fileInfo.hasMetaFile) {
          var title = tiddler.fields.title
          // Save the tiddler as a separate body and meta file
          var typeInfo = $tw.config.contentTypeInfo[tiddler.fields.type || "text/plain"] || {encoding: "utf8"};
          var content = $tw.Bob.Wikis[prefix].wiki.renderTiddler("text/plain", "$:/core/templates/tiddler-metadata", {variables: {currentTiddler: title}});
          fs.writeFile(fileInfo.filepath + ".meta",content,{encoding: "utf8"},function (err) {
            if(err) {
              return callback(err);
            }
            // TODO figure out why this gets stuck in an infinite saving loop
            // from connected browsers when renaming if this part isn't done
            // always
            // It is because the internalSave keeps waiting for a response about
            // the non-.meta file and it dosen't exist. I don't have a fix for
            // it yet.
            if (tiddler.fields.text && tiddler.fields.text !== '' || true) {
              // TODO figure out why renaming inside the wiki isn't working here
              fs.writeFile(filepath,tiddler.fields.text,{encoding: typeInfo.encoding},function(err) {
                if(err) {
                  return callback(err);
                }
                // Save with metadata
                console.log('saved file with metadata', filepath);
                return callback(null);
              });
            } else {
              console.log('saved file with metadata', filepath)
              return callback(null);
            }
          });
        } else {
          var title = tiddler.fields.title;
          // Save the tiddler as a self contained templated file
          var content = $tw.Bob.Wikis[prefix].wiki.renderTiddler("text/plain", "$:/core/templates/tid-tiddler", {variables: {currentTiddler: title}});
          // If we aren't passed a path
          fs.writeFile(filepath,content,{encoding: "utf8"},function (err) {
            if(err) {
              return callback(err);
            }
            console.log('saved file', filepath)
            return callback(null);
          });
        }
      });
    }
  };

  // After the tiddler file is saved this takes care of the internal part
  function internalSave (tiddler, prefix) {
    $tw.Bob.Wikis[prefix].wiki.addTiddler(new $tw.Tiddler(tiddler.fields));
    var message = {type: 'saveTiddler', wiki: prefix, tiddler: {fields: tiddler.fields}};
    $tw.Bob.SendToBrowsers(message);
    // This may help
    $tw.Bob.Wikis = $tw.Bob.Wikis || {};
    $tw.Bob.Wikis[prefix] = $tw.Bob.Wikis[prefix] || {};
    $tw.Bob.Wikis[prefix].tiddlers = $tw.Bob.Wikis[prefix].tiddlers || [];
    if ($tw.Bob.Wikis[prefix].tiddlers.indexOf(tiddler.fields.title) === -1) {
      $tw.Bob.Wikis[prefix].tiddlers.push(tiddler.fields.title);
    }
  }

  /*
  Load a tiddler and invoke the callback with (err,tiddlerFields)

  We don't need to implement loading for the file system adaptor, because all the tiddler files will have been loaded during the boot process.
  */
  WebsocketAdaptor.prototype.loadTiddler = function(title,callback) {
    if (!callback) {
      callback = function () {

      }
    }
    callback(null,null);
  };

  /*
  Delete a tiddler and invoke the callback with (err)
  */
  WebsocketAdaptor.prototype.deleteTiddler = function(title, callback, options) {
    if (typeof callback === 'object') {
      options = callback;
      callback = null;
    }
    if (!callback || typeof callback === 'object') {
      callback = function () {
        // Just a blank function to prevent errors
      }
    }
    if (typeof options !== 'object') {
      options = {}
    }
    if (options.wiki) {
      var prefix = options.wiki;
      var prefixName = '{' + prefix + '}' + title;
    }
    var self = this,
      fileInfo = $tw.boot.files[prefixName];
    // Only delete the tiddler if we have writable information for the file
    if(fileInfo) {
      //console.log('Delete tiddler file ', fileInfo.filepath);
      // Delete the file
      fs.unlink(fileInfo.filepath,function(err) {
        if(err) {
          return callback(err);
        }
        // Delete the tiddler from the internal tiddlywiki side of things
        delete $tw.boot.files[prefixName];
        $tw.Bob.Wikis[prefix].wiki.deleteTiddler(title);
        // Create a message saying to remove the tiddler

        // Remove the prefix from the tiddler
        var tiddlerName = title;
        var message = {type: 'deleteTiddler', tiddler: {fields:{title: tiddlerName}}, wiki: prefix};
        // Send the message to each connected browser
        $tw.Bob.SendToBrowsers(message);
        //self.logger.log("Deleted file",fileInfo.filepath);
        // Delete the metafile if present
        if(fileInfo.hasMetaFile) {
          fs.unlink(fileInfo.filepath + ".meta",function(err) {
            if(err) {
              return callback(err);
            }
            return $tw.utils.deleteEmptyDirs(path.dirname(fileInfo.filepath),callback);
          });
        } else {
          return $tw.utils.deleteEmptyDirs(path.dirname(fileInfo.filepath),callback);
        }
      });
    } else {
      callback(null);
    }
  };

  exports.adaptorClass = WebsocketAdaptor;
}

})();
