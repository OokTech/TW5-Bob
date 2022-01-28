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

exports.startup = function() {
  $tw.settings = $tw.settings || {};

  if($tw.node && $tw.settings.disableFileWatchers !== 'yes') {
    // require the fs module if we are running node
    const fs = require("fs");
    const path = require("path");

    // Initialise objects
    $tw.Bob = $tw.Bob || {};
    $tw.Bob.Files = $tw.Bob.Files || {};

    /*
      This watches for changes to a folder and updates the wiki prefix when anything changes in the folder.

      File or Folder
      Exists or Doesn't Exist

      Folder - Exists -> Watch folder
      Folder - Doesn't Exist -> remove tiddlers in the folder and stop the watcher

      File - Exists -> Update of some sort
      File - Doesn't Exist -> Remove the tiddler
    */
    $tw.Bob.WatchFolder = function (folder, prefix) {
      // If there is no prefix set it to an empty string
      prefix = prefix || '';
      $tw.Bob.Wikis[prefix].watchers = $tw.Bob.Wikis[prefix].watchers || {};
      try {
        $tw.Bob.Wikis[prefix].watchers[folder] = fs.watch(folder, function (eventType, filename) {
          filename = filename || "";
          // The full path to the current item
          const itemPath = path.join(folder, filename);
          fs.stat(itemPath, function(err, fileStats) {
            // The file extension, if no file extension than an empty string
            const fileExtension = path.extname(filename);
            if(err) {
              // The item doesn't exist
              if(err.code === 'ENOENT') {
                // The item doesn't exist, so it was removed
                // If the file doesn't exist anymore remove it from the wiki
                if(['.tid', '.meta'].indexOf(fileExtension) !== -1) {
                  $tw.Bob.DeleteTiddler(folder, filename, prefix);
                } else {
                  $tw.Bob.logger.log('non-tiddler file deleted:', filename, {level: 3})
                }
              } else if(err.code === 'EACCES') {
                // Permissions error
              } else {
                // Some other error
              }
            } else {
              // Item exists
              if(fileStats.isDirectory()) {
                // If it is a new folder than watch that folder too
                $tw.Bob.WatchFolder(itemPath, prefix)
              } else if(fileStats.isFile()) {
                // if it is a file
                // Find the tiddler that matches the filepath
                const tiddlerName = Object.keys($tw.Bob.Files[prefix]).filter(function (item) {
                  // This is to handle some edge cases I ran into while making
                  // it.
                  if(typeof item === 'string') {
                    return ($tw.Bob.Files[prefix][item].filepath === itemPath)
                  } else {
                    return false;
                  }
                })[0];
                if(['.tid', '.meta'].indexOf(fileExtension) !== -1) {
                  let tiddlerObject = {tiddlers:[{}]}
                  // This try block catches an annoying race condition problem
                  // when the filesystem adaptor deletes a file the file watcher
                  // starts acting before the deleting is completely finished.
                  // This means that it sees the file as still existing and tries // to open it, but it is deleted so there is an error.
                  try {
                    // Load tiddler data from the file
                    tiddlerObject = $tw.loadTiddlersFromFile(itemPath);
                  } catch (e) {
                    if(e.code !== 'ENOENT') {
                      $tw.Bob.logger.error(e, {level: 3})
                    }
                    // If we reach here the file doesn't exist for other reasons and we don't need to do anything
                    return
                  }
                  // Make sure that it at least has a title
                  if(tiddlerObject.tiddlers[0]['title']) {
                    // Test to see if the filename matches what the wiki says it
                    // should be. If not rename the file to match the rules set by
                    // the wiki.
                    // This is the title based on the current .tid file
                    let newTitle = $tw.syncadaptor.generateTiddlerBaseFilepath(tiddlerObject.tiddlers[0].title, prefix);
                    const existingTiddler = $tw.Bob.Wikis[prefix].wiki.getTiddler(tiddlerObject.tiddlers[0].title);
                    // Load the tiddler from the wiki, check if they are different (non-existent is changed)
                    if($tw.Bob.Shared.TiddlerHasChanged(existingTiddler, {fields: tiddlerObject.tiddlers[0]})) {
                      // Rename the file
                      // If $:/config/FileSystemPaths is used than the folder and
                      // newTitle may overlap.
                      // This determines if any of the title has an overlap in the path
                      if(newTitle.replace('\\','/').indexOf('/') !== -1) {
                        const pieces = newTitle.replace('\\','/').split('/')
                        let pathBits = pieces.slice(0,-1);
                        while (pathBits.length > 0) {
                          if(folder.endsWith(pathBits.join(path.sep))) {
                            break;
                          }
                          pathBits = pathBits.slice(0,-1);
                        }
                        if(pathBits.length > 0) {
                          newTitle = pieces.slice(pathBits.length).join(path.sep);
                        }
                      }
                      // translate tiddler title into filepath
                      const theFilepath = path.join(folder, newTitle + fileExtension);
                      if(typeof tiddlerName === 'string' && tiddlerName !== tiddlerObject.tiddlers[0].title) {
                        $tw.Bob.logger.log('Rename Tiddler ', tiddlerName, ' to ', newTitle, {level:2});
                        // Remove the old tiddler
                        $tw.Bob.DeleteTiddler(folder, tiddlerName + fileExtension, prefix);
                      }

                      fs.unlink(itemPath, (err)=>{
                        if(err) {
                          // nothing, error if the tiddler doesn't exist just means the monitor is most likely fighting with another syncer like git.
                        }
                        // Create the new tiddler
                        const newTiddler = $tw.Bob.Shared.normalizeTiddler({fields: tiddlerObject.tiddlers[0]});
                        // Save the new file
                        $tw.syncadaptor.saveTiddler(newTiddler, prefix);
                      });
                    }
                  }
                }
              }
            }
          })
        }).on('error', error => {
          // Ignore EPERM errors in windows, which happen if you delete watched folders...
          if(error.code === 'EPERM' && require('os').platform() === 'win32') {
            $tw.Bob.logger.log('[Info] Failed to watch deleted folder.', {level:3});
            return;
          }
        });
      } catch (e) {
        $tw.Bob.logger.error('Failed to watch folder!', e, {level:1});
      }
    }

    // TODO make this handle deleting .meta files
    $tw.Bob.DeleteTiddler = function (folder, filename, prefix) {
      const itemPath = path.join(folder, filename);
      // Get the file name because it isn't always the same as the tiddler
      // title.

      // At this point the tiddlerName is the internal name so we need to switch
      // to the non-prefixed name for the message to the browsers
      Object.keys($tw.Bob.Files[prefix]).forEach(function(tiddlerName) {
        if($tw.Bob.Files[prefix][tiddlerName].filepath === itemPath) {
          // Remove the tiddler info from $tw.Bob.Files
          delete $tw.Bob.Files[prefix][tiddlerName];
          // Remove the tiddler on the server
          $tw.Bob.Wikis[prefix].wiki.deleteTiddler(tiddlerName);
          // Create a message saying to remove the tiddler from the browser
          const message = {
            type: 'deleteTiddler',
            tiddler: {
              fields:{
                title: tiddlerName
              }
            },
            wiki: prefix
          };
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
      if(typeof folderTree.path === 'string') {
        if(fs.existsSync(folderTree.path)) {
          $tw.Bob.WatchFolder(folderTree.path, prefix);
        }
      }
      // Use this same function on each sub-folder listed
      Object.keys(folderTree.folders).forEach(function(folder) {
        $tw.Bob.WatchAllFolders(folderTree.folders[folder], prefix);
      });
    }
  }
}
})();
