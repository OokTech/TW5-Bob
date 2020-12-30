/*\
title: $:/plugins/OokTech/Bob/MultiWikiAdaptor.js
type: application/javascript
module-type: syncadaptor

A sync adaptor module for synchronising multiple wikis

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.platforms = ["node"];

if($tw.node) {

  // Get a reference to the file system
  const fs = require("fs"),
    path = require("path");

  $tw.Bob = $tw.Bob || {};
  $tw.Bob.Files = $tw.Bob.Files || {};

  /*
    TODO Create a message that lets us set excluded tiddlers from inside the wikis
    A per-wiki exclude list would be best but that is going to have annoying
    logic so it will come later.
  */
  $tw.Bob.ExcludeFilter = $tw.Bob.ExcludeFilter || "[prefix[$:/state/]][prefix[$:/temp/]][prefix[$:/HistoryList]][prefix[$:/StoryList]][prefix[$:/WikiSettings]][[$:/status/UserName]][[$:/Import]][[$:/plugins/OokTech/Bob/Server Warning]]";

  $tw.hooks.addHook("th-make-tiddler-path", function(thePath, originalPath) {
    return originalPath;
  })

  function MultiWikiAdaptor(options) {
    //$tw.Bob.Wikis[prefix] = options.wiki;
  }

  MultiWikiAdaptor.prototype.name = "MultiWikiAdaptor";

  MultiWikiAdaptor.prototype.isReady = function() {
    // The file system adaptor is always ready
    return true;
  };

  MultiWikiAdaptor.prototype.getTiddlerInfo = function(tiddler, prefix) {
    //Returns the existing fileInfo for the tiddler. To regenerate, call getTiddlerFileInfo().
    prefix = prefix || '';
    $tw.Bob.Files[prefix] = $tw.Bob.Files[prefix] || {};
    var title = tiddler.fields.title;
    return $tw.Bob.Files[prefix][title] || {};
  };

  /*
  Return a fileInfo object for a tiddler, creating it if necessary:
    filepath: the absolute path to the file containing the tiddler
    type: the type of the tiddler file (NOT the type of the tiddler -- see below)
    hasMetaFile: true if the file also has a companion .meta file

  The boot process populates $tw.Bob.Files[prefix][title] for each of the tiddler files that it loads.
  The type is found by looking up the extension in $tw.config.fileExtensionInfo (eg "application/x-tiddler" for ".tid" files).

  It is the responsibility of the filesystem adaptor to update $tw.Bob.Files[prefix][title] for new files that are created.
  */
  MultiWikiAdaptor.prototype.getTiddlerFileInfo = function(tiddler, prefix, callback) {
    const self = this;
    prefix = prefix || '';
    if(!callback) {
      callback = function (err, fileInfo) {
        if(err) {
          $tw.Bob.logger.error(err, {level:2});
        } else {
          return fileInfo;
        }
      }
    }
    // Generate the base filepath and ensure the directories exist
    $tw.Bob.Wikis = $tw.Bob.Wikis || {};
    if(!$tw.Bob.Wikis[prefix] || $tw.Bob.Wikis[prefix].State !== 'loaded') {
      $tw.ServerSide.loadWiki(prefix, finish);
    } else {
      finish();
    }
    function finish() {
      const tiddlersPath = $tw.Bob.Wikis[prefix].wikiTiddlersPath;
      // Always generate a fileInfo object when this fuction is called
      var title = tiddler.fields.title, newInfo, pathFilters, extFilters;
      if($tw.Bob.Wikis[prefix].wiki.tiddlerExists("$:/config/FileSystemPaths")){
        pathFilters = $tw.Bob.Wikis[prefix].wiki.getTiddlerText("$:/config/FileSystemPaths","").split("\n");
      }
      if($tw.Bob.Wikis[prefix].wiki.tiddlerExists("$:/config/FileSystemExtensions")){
        extFilters = $tw.Bob.Wikis[prefix].wiki.getTiddlerText("$:/config/FileSystemExtensions","").split("\n");
      }
      newInfo = $tw.utils.generateTiddlerFileInfo(tiddler,{
        directory: tiddlersPath,
        pathFilters: pathFilters,
        extFilters: extFilters,
        wiki: $tw.Bob.Wikis[prefix].wiki,
        fileInfo: $tw.Bob.Files[prefix][title],
        originalpath: $tw.Bob.Wikis[prefix].wiki.extractTiddlerDataItem("$:/config/OriginalTiddlerPaths",title, "")
      });
      $tw.Bob.Files[prefix][title] = newInfo;
      callback(null,newInfo);
    };
  };

  /*
  Given a tiddler title and a options object, generate a fileInfo object but do not save it 
  */
  MultiWikiAdaptor.prototype.generateCustomFileInfo = function(title, options) {
    options = options || {};
    const prefix = options.prefix || '';
    $tw.Bob.Wikis = $tw.Bob.Wikis || {};
    if(!$tw.Bob.Wikis[prefix] || $tw.Bob.Wikis[prefix].State !== 'loaded') {
      $tw.ServerSide.loadWiki(prefix, finish);
    } else {
      finish();
    }
    function finish() {
      // Always generate a fileInfo object when this fuction is called
      var tiddler = $tw.Bob.Wikis[prefix].wiki.getTiddler(title) || $tw.newTiddler({title: title}), newInfo, pathFilters, extFilters;
      if($tw.Bob.Wikis[prefix].wiki.tiddlerExists("$:/config/FileSystemPaths")){
        pathFilters = options.pathFilters || $tw.Bob.Wikis[prefix].wiki.getTiddlerText("$:/config/FileSystemPaths","").split("\n");
      }
      if($tw.Bob.Wikis[prefix].wiki.tiddlerExists("$:/config/FileSystemExtensions")){
        extFilters = options.extFilters || $tw.Bob.Wikis[prefix].wiki.getTiddlerText("$:/config/FileSystemExtensions","").split("\n");
      }
      newInfo = $tw.utils.generateTiddlerFileInfo(tiddler,{
        directory: options.directory,
        pathFilters: pathFilters,
        extFilters: extFilters,
        wiki: $tw.Bob.Wikis[prefix].wiki,
        fileInfo: $tw.Bob.Files[prefix][title],
        originalpath: $tw.Bob.Wikis[prefix].wiki.extractTiddlerDataItem("$:/config/OriginalTiddlerPaths",title, "")
      });
      return newInfo;
    }
  };

  /*
  Save a tiddler and invoke the callback with (err,adaptorInfo,revision)
  */
  MultiWikiAdaptor.prototype.saveTiddler = function(tiddler, prefix, connectionInd, callback) {
    const self = this;
    if(typeof prefix === 'function') {
      callback = prefix;
      prefix = null;
      connectionInd = null;
    }
    if(typeof connectionInd === 'function') {
      connectionInd = null;
      callback = connectionInd
    }
    if(typeof callback !== 'function') {
      callback = function () {

      }
    }
    prefix = prefix || 'RootWiki';
    self.adaptorInfo = self.adaptorInfo || {};
    self.adaptorInfo[prefix] = self.adaptorInfo[prefix] || {};
    $tw.Bob.Wikis = $tw.Bob.Wikis || {};
    if(!$tw.Bob.Wikis[prefix] || $tw.Bob.Wikis[prefix].State !== 'loaded') {
      $tw.ServerSide.loadWiki(prefix, function(){
        finish(tiddler);
      }.bind(self));
    } else {
      (function(){
        finish(tiddler);
      }.bind(self))();
    }
    function finish(tiddler) {
      debugger;
      if(typeof(tiddler) == "undefined" || !tiddler || !tiddler.fields) return callback("Node Save Error - no tiddler fields given.");
      if($tw.Bob.Wikis[prefix].wiki.filterTiddlers($tw.Bob.ExcludeFilter).indexOf(tiddler.fields.title) === -1) {
        var tiddler = new $tw.Tiddler(tiddler);
        self.adaptorInfo[prefix][tiddler.fields.title] = $tw.utils.extend(Object.create(null), self.getTiddlerInfo(tiddler, prefix));
        self.getTiddlerFileInfo(tiddler, prefix,
         function(err,fileInfo) {
          if(err) {
            return callback(err);
          }
          $tw.Bob.logger.log('Save Tiddler ', tiddler.fields.title, {level:2});
          $tw.utils.saveTiddlerToFile(tiddler,fileInfo,function(err) {
            if(err) {
              // If there's an error, exit without changing any internal wiki state
              $tw.Bob.logger.log('Error Saving Tiddler ', tiddler.fields.title, err, {level:1});
              if ((err.code == "EPERM" || err.code == "EACCES") && err.syscall == "open") {
                var bootInfo = $tw.Bob.Files[prefix][tiddler.fields.title];
                bootInfo.writeError = true;
                $tw.Bob.Files[prefix][tiddler.fields.title] = bootInfo;
                tw.Bob.logger.log("Sync for tiddler [["+tiddler.fields.title+"]] will be retried with encoded filepath", encodeURIComponent(bootInfo.filepath), {level:1});
                return callback(err);
              } else {
                $tw.Bob.Files[prefix][tiddler.fields.title] = self.adaptorInfo[prefix][tiddler.fields.title]
                return callback(err);
              }
            }
            // After the tiddler file is saved this takes care of the internal part
            internalSave(tiddler, prefix, connectionInd);
            // Cleanup duplicates if the file moved or changed extensions
            var options = {
              adaptorInfo: self.adaptorInfo[prefix][tiddler.fields.title] || {},
              bootInfo: $tw.Bob.Files[prefix][tiddler.fields.title] || {},
              title: tiddler.fields.title
            };
            $tw.utils.cleanupTiddlerFiles(options, function(err){
              if(err) {
                return callback(err);
              }
              return callback(null, $tw.Bob.Files[prefix][tiddler.fields.title]);
            }.bind(self));
          }.bind(self));
        }.bind(self));
      }
    }
  };

  /*
  Internal save (in case it needs to be re-used). Make sure $tw.Bob.Wikis[prefix].wiki exists first.
  */
  function internalSave(tiddler, prefix, connectionInd){
    $tw.Bob.Wikis[prefix].tiddlers = $tw.Bob.Wikis[prefix].tiddlers || [];
    $tw.Bob.Wikis[prefix].wiki.addTiddler(tiddler.fields);
    if($tw.Bob.Wikis[prefix].tiddlers.indexOf(tiddler.fields.title) === -1) {
      $tw.Bob.Wikis[prefix].tiddlers.push(tiddler.fields.title);
    }
    const message = {
      type: 'saveTiddler',
      wiki: prefix,
      tiddler: {
        fields: tiddler.fields
      }
    };
    $tw.Bob.SendToBrowsers(message, connectionInd);
    //Mark as modified
    $tw.Bob.Wikis[prefix].modified = true;
    $tw.hooks.invokeHook('wiki-modified', prefix);
  }

  /*
  Load a tiddler and invoke the callback with (err,tiddlerFields)

  We don't need to implement loading for the file system adaptor, because all the tiddler files will have been loaded during the boot process.
  */
  MultiWikiAdaptor.prototype.loadTiddler = function(title,callback) {
    const self = this;
    if(!callback) {
      callback = function (err) {
        return err;
      }
    }
    //call internalSave, for FileSystemWatchers on new files?
    callback(null,null);
  };

  /*
  Delete a tiddler and invoke the callback with (err)
  */
  MultiWikiAdaptor.prototype.deleteTiddler = function(title, options, callback) {
    if(typeof callback !== 'function') {
      callback = function (err) {
        return err;
      }
    }
    if(typeof options !== 'object') {
      if(typeof options === 'string') {
        options = {wiki: options}
      } else {
        callback("Delete Tiddler Error. No wiki given.");
      }
    }
    const prefix = options.wiki || "RootWiki";
    if(!$tw.Bob.Files[prefix] || $tw.Bob.Wikis[prefix].State !== 'loaded') {
      $tw.ServerSide.loadWiki(prefix, finish);
    } else {
      finish();
    }
    function finish() {
      if(typeof(title) == "undefined" || !title || typeof title !== 'string') return callback("Delete Tiddler Error. No title given.");
      const fileInfo = self.getTiddlerInfo({fields: {title: title}}, prefix);
      // Only delete the tiddler if we have writable information for the file
      if(fileInfo) {
        // Delete the file
        $tw.utils.deleteTiddlerFile(fileInfo, function(err){
          if(err) {
            if ((err.code == "EPERM" || err.code == "EACCES") && err.syscall == "unlink") {
              // Error deleting the file on disk, should fail gracefully
              $tw.Bob.logger.log('Server desynchronized. Error deleting file ', fileInfo.filepath, {level:1});
              return callback(err);
            } else {
              return callback(err);
            }
          }
          // Delete the tiddler from the internal tiddlywiki side of things
          $tw.Bob.Wikis[prefix].wiki.deleteTiddler(title);
          delete $tw.Bob.Files[prefix][title];
          delete self.adaptorInfo[prefix][title];
          if($tw.Bob.Wikis[prefix].tiddlers.indexOf(title) > -1){
            $tw.Bob.Wikis[prefix].tiddlers.splice($tw.Bob.Wikis[prefix].tiddlers.indexOf(title), 1)
          }
          // Create a message saying to remove the tiddler
          const message = {type: 'deleteTiddler', tiddler: {fields:{title: title}}, wiki: prefix};
          // Send the message to each connected browser
          $tw.Bob.SendToBrowsers(message);
          // I guess unconditionally say the wiki is modified in this case.
          $tw.Bob.Wikis[prefix].modified = true;
          $tw.hooks.invokeHook('wiki-modified', prefix);
          $tw.Bob.logger.log('Deleted file ', fileInfo.filepath, {level:2});
          return callback(null);
        });
      } else {
        callback(null);
      }
    }
  };

  if($tw.node) {
    exports.adaptorClass = MultiWikiAdaptor;
  }
}

})();
