/*\
title: $:/plugins/OokTech/Bob/FileSystemMonitor.js
type: application/javascript
module-type: startup

This module watches the file system in the tiddlers folder and any changes to
the files in the folder that don't come from the browser are reported to the
browser. So if you make a new .tid file in the tiddlers folder it will appear
in the wiki in the browser without needing to restart the server. You can also
delete files to remove the tiddlers from the browser.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = 'FileSystemMonitor';
exports.after = ["load-modules"];
exports.platforms = ["node"];
exports.synchronous = true;

if ($tw.node) {
  // require the fs module if we are running node
  var fs = require("fs");
  var path = require("path");

  // Initialise objects
  $tw.Bob = $tw.Bob || {};
  $tw.connections = $tw.connections || [];

  /*
    TODO Create a message that lets us set excluded tiddlers from inside the wikis
    A per-wiki exclude list would be best but that is going to have annoying
    logic so it will come later.
  */
  $tw.Bob.ExcludeList = $tw.Bob.ExcludeList || ['$:/StoryList', '$:/HistoryList', '$:/status/UserName', '$:/Import'];

  /*
    Determine which sub-folders are in the current folder
  */
  var getDirectories = function(source) {
    return fs.readdirSync(source).map(function(name) {
      return path.join(source,name)
    }).filter(function (source) {
      return fs.lstatSync(source).isDirectory();
    });
  }

  /*
    This recursively builds a tree of all of the subfolders in the tiddlers
    folder.
    This can be used to selectively watch folders of tiddlers.
  */
  var buildTree = function(location, parent) {
    var folders = getDirectories(path.join(parent,location));
    var parentTree = {'path': path.join(parent,location), folders: {}};
    if (folders.length > 0) {
      folders.forEach(function(folder) {
        var apex = folder.split(path.sep).pop();
        parentTree.folders[apex] = {};
        parentTree.folders[apex] = buildTree(apex, path.join(parent,location));
      })
    }
    return parentTree;
  }

  /*
    This watches for changes to a folder and updates the wiki prefix when anything changes in the folder.
  */
  $tw.Bob.WatchFolder = function (folder, prefix) {
    // If there is no prefix set it to an empty string
    prefix = prefix || '';
    fs.watch(folder, function (eventType, filename) {
      //console.log('Monitor:',eventType,'on',filename)
      var isFile = false;
      var isFolder = false;
      // The full path to the current item
      var itemPath = path.join(folder, filename);
      // Determine if it exists and if it is a file or folder
      var exists = fs.existsSync(itemPath);
      if (exists) {
        isFile = fs.lstatSync(itemPath).isFile();
        if (!isFile) {
          isFolder = fs.lstatSync(itemPath).isDirectory();
        }
      }
      // The file extension, if no file extension than an empty string
      var fileExtension = path.extname(filename);
      // The file name without the extension
      var baseName = path.basename(filename, fileExtension);

      var fullTiddlerName = Object.keys($tw.boot.files).filter(function (item) {
        // A lot of this is to handle some weird edge cases I ran into
        // while making it.
        // TODO figure out why this happens.
        if (typeof item === 'string') {
          if (item === 'undefined') {
            delete $tw.boot.files[item];
            return false;
          }
          return ($tw.boot.files[item].filepath === itemPath)
        } else {
          return false;
        }
      })[0];

      // If it is a new file or a change an existing file and it is a .tid or
      // .meta file
      if (isFile && exists && ['.tid', '.meta'].indexOf(fileExtension) !== -1) {
        // Load tiddler data from the file
        var tiddlerObject = $tw.loadTiddlersFromFile(itemPath);
        // Make sure that it at least has a title
        if (Object.keys(tiddlerObject.tiddlers[0]).indexOf('title') !== -1) {
          // Test to see if the filename matches what the wiki says it
          // should be. If not rename the file to match the rules set by
          // the wiki.
          // This is the title based on the current .tid file
          var newTitle = $tw.syncadaptor.generateTiddlerBaseFilepath(tiddlerObject.tiddlers[0].title, prefix);
          var existingTiddler = $tw.Bob.Wikis[prefix].wiki.getTiddler(tiddlerObject.tiddlers[0].title);
          // Load the tiddler from the wiki, check if they are different (non-existent is changed)
          var tiddlerFileTitle = filename.slice(0, -1*fileExtension.length);
          if ($tw.Bob.Shared.TiddlerHasChanged(existingTiddler, {fields: tiddlerObject.tiddlers[0]})) {
            // Rename the file
            // If $:/config/FileSystemPaths is used than the folder and
            // newTitle may overlap.
            // This determines if any of the title has an overlap in the path
            if (newTitle.replace('\\','/').indexOf('/') !== -1) {
              var pieces = newTitle.replace('\\','/').split('/')
              var pathBits = pieces.slice(0,-1);
              while (pathBits.length > 0) {
                if (folder.endsWith(pathBits.join(path.sep))) {
                  break;
                }
                pathBits = pathBits.slice(0,-1);
              }
              if (pathBits.length > 0) {
                newTitle = pieces.slice(pathBits.length).join(path.sep);
              }
            }
            // translate tiddler title into filepath
            var theFilepath = path.join(folder, newTitle + fileExtension);
            if (typeof fullTiddlerName === 'string') {
              // create the new tiddler and delete the old one.
              // Make the new file path
              var tiddlerName = fullTiddlerName.replace(new RegExp('^\{' + prefix + '\}'),'');
            }
            if (typeof tiddlerName === 'string' && tiddlerName !== tiddlerObject.tiddlers[0].title) {
              console.log('Rename Tiddler ', tiddlerName, ' to ', newTitle);
              // Remove the old tiddler
              $tw.Bob.DeleteTiddler(folder, tiddlerName + fileExtension, prefix);
            }
            if (itemPath !== theFilepath) {
              // Delete the old file, the normal delete action takes care
              // of the rest.
              fs.unlinkSync(itemPath);
            }
            // Thing
            // Create the new tiddler
            $tw.Bob.MakeTiddlerInfo(folder, newTitle + fileExtension, tiddlerObject, prefix);
            // Put the tiddler object in the correct form
            // This gets saved to the file sysetm so non-prefixed title
            var newTiddler = {fields: tiddlerObject.tiddlers[0]};
            // Save the new file
            $tw.syncadaptor.saveTiddler(newTiddler, prefix);
          }
        }
      }
      // If the file doesn't exist anymore remove it from the wiki
      if (!exists && ['.tid', '.meta'].indexOf(fileExtension) !== -1) {
        $tw.Bob.DeleteTiddler(folder, filename, prefix);
      }
      // If it is a new folder than watch that folder too
      if (exists && isFolder) {
        $tw.Bob.WatchFolder(itemPath, prefix)
      }
    });
  }

  $tw.Bob.MakeTiddlerInfo = function (folder, filename, tiddlerObject, prefix) {
    var title = tiddlerObject.tiddlers[0].title;
    var itemPath = path.join(folder, filename);

    // Create the file info also
    var fileInfo = {};
    var tiddlerType = tiddlerObject.tiddlers[0].type || "text/vnd.tiddlywiki";
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

    // Set the final fileInfo
    fileInfo.filepath = itemPath;
    var internalName = "{" + prefix + "}" + title;
    $tw.boot.files[internalName] = fileInfo;

    // Add the newly cretaed tiddler.
    $tw.Bob.Wikis[prefix].wiki.addTiddler(new $tw.Tiddler(tiddlerObject.tiddlers[0]));
    $tw.Bob.Wikis[prefix].tiddlers.push(title);
  }

  // TODO make this handle deleting .meta files
  $tw.Bob.DeleteTiddler = function (folder, filename, prefix) {
    var itemPath = path.join(folder, filename);
    // Get the file name because it isn't always the same as the tiddler
    // title.

    // At this point the tiddlerName is the internal name so we need to switch
    // to the non-prefixed name for the message to the browsers
    Object.keys($tw.boot.files).forEach(function(prefixTiddlerName) {
      if ($tw.boot.files[prefixTiddlerName].filepath === itemPath) {
        // Remove the tiddler info from $tw.boot.files
        delete $tw.boot.files[prefixTiddlerName];
        // Get the non-prefixed name
        var tiddlerName = prefixTiddlerName.replace('{'+prefix+'}','');
        // Remove the tiddler on the server
        $tw.Bob.Wikis[prefix].wiki.deleteTiddler(tiddlerName);
        // Create a message saying to remove the tiddler from the browser
        var message = {type: 'deleteTiddler', tiddler: {fields:{title: tiddlerName}}, wiki: prefix};
        // Send the message to each connected browser
        $tw.Bob.SendToBrowsers(message);
      }
    });
  }

  /*
    This function walks through all the folders listed in the folder tree and
    creates a watcher for each one.

    Each property in the $tw.Bob.FolderTree object has this structure:

    {
      path: '/path/to/folder'
      folders: {
        folderName {
          // folder object for folderName
        },
        // Other folders with their folder objects
      }
    }

    TODO: CReate what is necessary so that we can have wikis only sync to
    specific folders
    This is sort of implemented but I want more control.
  */
  $tw.Bob.WatchAllFolders = function (folderTree, prefix) {
    // Watch the current folder after making sure that the path exists
    if (typeof folderTree.path === 'string') {
      if (fs.existsSync(folderTree.path)) {
        $tw.Bob.WatchFolder(folderTree.path, prefix);
      }
    }
    // Use this same function on each sub-folder listed
    Object.keys(folderTree.folders).forEach(function(folder) {
      $tw.Bob.WatchAllFolders(folderTree.folders[folder], prefix);
    });
  }
}

})();
