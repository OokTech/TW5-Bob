/*\
title: $:/plugins/OokTech/MultiUser/WebsocketAdaptor.js
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
    // Create the <wiki>/tiddlers folder if it doesn't exist
    //$tw.utils.createDirectory($tw.boot.wikiTiddlersPath);
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
    if (title.startsWith('{' + prefix + '}')) {
      title = title.replace('{' + prefix + '}', '');
    }
    var internalTitle = '{' + prefix + '}' ==='{}'?title:'{' + prefix + '}' + title;
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
      var tiddlersPath = prefix === ''? $tw.MultiUser.Wikis.RootWiki.wikiTiddlersPath:$tw.MultiUser.Wikis[prefix].wikiTiddlersPath
      var baseFilepath = path.resolve(tiddlersPath, self.generateTiddlerBaseFilepath(title));
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
        if (prefix !== '') {
          if ($tw.MultiUser.Wikis[prefix].tiddlers.indexOf(internalTitle) !== -1) {
            $tw.MultiUser.Wikis[prefix].tiddlers.push(internalTitle);
          }
        } else {
          $tw.MultiUser.Wikis.RootWiki.tiddlers = $tw.MultiUser.Wikis.RootWiki.tiddlers || [];
          if ($tw.MultiUser.Wikis.RootWiki.tiddlers.indexOf(internalTitle) !== -1 && !internalTitle.startsWith('{')) {
            $tw.MultiUser.Wikis.RootWiki.tiddlers.push(internalTitle);
          }
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
  WebsocketAdaptor.prototype.generateTiddlerBaseFilepath = function(title) {
    var baseFilename;
    // Check whether the user has configured a tiddler -> pathname mapping
    var pathNameFilters = this.wiki.getTiddlerText("$:/config/FileSystemPaths");
    if(pathNameFilters) {
      var source = this.wiki.makeTiddlerIterator([title]);
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
      prefix = '';
    }
    if (typeof callback !== 'function') {
      callback = function () {

      }
    }
    prefix = prefix || '';
    var internalName = (prefix === '' || tiddler.fields.title.startsWith('{' + prefix + '}')) ? tiddler.fields.title:'{' + prefix + '}' + tiddler.fields.title;
    if (tiddler && $tw.MultiUser.ExcludeList.indexOf(tiddler.fields.title) === -1 && !tiddler.fields.title.startsWith('$:/state/') && !tiddler.fields.title.startsWith('$:/temp/')) {
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
        if(fileInfo.hasMetaFile) {
          // Save the tiddler as a separate body and meta file
          var typeInfo = $tw.config.contentTypeInfo[tiddler.fields.type || "text/plain"] || {encoding: "utf8"};
          var content = makeTiddlerFile(tiddler, true);
          fs.writeFile(fileInfo.filepath + ".meta",content,{encoding: "utf8"},function (err) {
            if(err) {
              return callback(err);
            }
            // TODO figure out why renaming inside the wiki isn't working here
            fs.writeFile(filepath,tiddler.fields.text,{encoding: typeInfo.encoding},function(err) {
              if(err) {
                return callback(err);
              }
              // Save with metadata
              console.log('saved file with metadata', filepath)
              internalSave(tiddler, internalName, prefix);
              return callback(null);
            });
          });
        } else {
          // Save the tiddler as a self contained templated file
          var content = makeTiddlerFile(tiddler);
          // If we aren't passed a path
          fs.writeFile(filepath,content,{encoding: "utf8"},function (err) {
            if(err) {
              return callback(err);
            }
            console.log('saved file', filepath)
            internalSave(tiddler, internalName, prefix);
            return callback(null);
          });
        }
      });
    }
  };

  // After the tiddler file is saved this takes care of the internal part
  function internalSave (tiddler, internalName, prefix) {
    // addTiddler needs the prefixed title!!
    var tempTiddlerFields = {};
    Object.keys(tiddler.fields).forEach(function(fieldName) {
      tempTiddlerFields[fieldName] = tiddler.fields[fieldName];
    });
    tempTiddlerFields.title = internalName;
    $tw.wiki.addTiddler(new $tw.Tiddler(tempTiddlerFields));
    var message = JSON.stringify({type: 'makeTiddler', wiki: prefix, fields: tiddler.fields});
    $tw.MultiUser.SendToBrowsers(message);
    // This may help
    if (prefix !== '') {
      if ($tw.MultiUser.Wikis[prefix].tiddlers.indexOf(internalName) === -1) {
        $tw.MultiUser.Wikis[prefix].tiddlers.push(internalName);
      }
    } else {
      $tw.MultiUser.Wikis = $tw.MultiUser.Wikis || {};
      $tw.MultiUser.Wikis.RootWiki = $tw.MultiUser.Wikis.RootWiki || {};
      $tw.MultiUser.Wikis.RootWiki.tiddlers = $tw.MultiUser.Wikis.RootWiki.tiddlers || [];
      if ($tw.MultiUser.Wikis.RootWiki.tiddlers.indexOf(internalName) === -1 && !internalName.startsWith('{')) {
        $tw.MultiUser.Wikis.RootWiki.tiddlers.push(internalName);
      }
    }
  }

  // This transforms a tiddler into the form needed for a .tid file.
  // TODO figure out if we can replace this with the built-in function. We need
  // to look at the isMeta part
  // NOTE the built in version isn't fixing the part where modified and created
  // aren't valid data if the text field is empty. I still have no idea why
  function makeTiddlerFile(tiddler, isMeta) {
    var output = "";
    Object.keys(tiddler.fields).forEach(function(fieldName, index) {
      if (fieldName === 'created' || fieldName === 'modified') {
        output += fieldName+": " + $tw.utils.stringifyDate(new Date(tiddler.fields[fieldName])) + "\n";
      } else if (fieldName === 'list' || fieldName === 'tags'){
        output += fieldName+": " +  $tw.utils.stringifyList(tiddler.fields[fieldName]) + "\n";
      } else if (fieldName !== 'text') {
        output += fieldName+": " + tiddler.fields[fieldName] + "\n";
      }
    })
    if (tiddler.fields.text && !isMeta) {
      output += "\n" + tiddler.fields.text + "\n";
    }
    return output.trim();
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
    if (!callback) {
      callback = function () {
        // Just a blank function to prevent errors
      }
    }
    var self = this,
      fileInfo = $tw.boot.files[title];
    // Only delete the tiddler if we have writable information for the file
    if(fileInfo) {
      console.log('Delete tiddler file ', fileInfo.filepath);
      // Delete the file
      fs.unlink(fileInfo.filepath,function(err) {
        if(err) {
          return callback(err);
        }
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

  /*
    Check if the file version matches the in-browser version of a tiddler
  */
  WebsocketAdaptor.prototype.TiddlerHasChanged = function (tiddler, tiddlerFileObject) {
    if (!tiddlerFileObject) {
      return true;
    }
    if (!tiddler) {
      return true;
    }

    var changed = false;
    // Some cleverness that gives a list of all fields in both tiddlers without
    // duplicates.
    var allFields = Object.keys(tiddler.fields).concat(Object.keys(tiddlerFileObject.tiddlers[0]).filter(function (item) {
      return Object.keys(tiddler.fields).indexOf(item) < 0;
    }));
    // check to see if the field values are the same, ignore modified for now
    allFields.forEach(function(field) {
      if (field !== 'modified' && field !== 'created' && field !== 'list' && field !== 'tags') {
        if (!tiddlerFileObject.tiddlers[0][field] || tiddlerFileObject.tiddlers[0][field] !== tiddler.fields[field]) {
          // There is a difference!
          changed = true;
        }
      } else if (field === 'list' || field === 'tags') {
        if (tiddler.fields[field] && tiddlerFileObject.tiddlers[0][field]) {
          if ($tw.utils.parseStringArray(tiddlerFileObject.tiddlers[0][field]).length !== tiddler.fields[field].length) {
            changed = true;
          } else {
            var arrayList = $tw.utils.parseStringArray(tiddlerFileObject.tiddlers[0][field]);
            arrayList.forEach(function(item) {
              if (tiddler.fields[field].indexOf(item) === -1) {
                changed = true;
              }
            })
          }
        } else {
          changed = true;
        }
      }
    })
    return changed;
  };


  exports.adaptorClass = WebsocketAdaptor;
}

})();
