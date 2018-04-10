/*\
title: $:/plugins/OokTech/MultiUser/FileSystemMonitor.js
type: application/javascript
module-type: startup

This module watches the file system in the tiddlers folder and any changes to
the files in the folder that don't come from the browser are reported to the
browser. So if you make a new .tid file in the tiddlers folder it will appear
in the wiki in the browser without needing to restart the server. You can also
delete files to remove the tiddlers from the browser.

Note: For now this only watches the tiddlers folder that is in the same place
as the tiddlywiki.info file and doesn't watch for changes in any subfolders
inside that folder.
This is due to differences in how different operating systems handle watching
for changes to files.

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
  $tw.MultiUser = $tw.MultiUser || {};
  $tw.MultiUser.WaitingList = $tw.MultiUser.WaitingList || {};
  $tw.MultiUser.EditingTiddlers = $tw.MultiUser.EditingTiddlers || {};
  $tw.MultiUser.FolderTree = $tw.MultiUser.FolderTree || {};

  /*
    TODO Create a message that lets us set excluded tiddlers from inside the wikis
    A per-wiki exclude list would be best but that is going to have annoying
    logic so it will come later.
  */
  $tw.MultiUser.ExcludeList = $tw.MultiUser.ExcludeList || ['$:/StoryList', '$:/HistoryList', '$:/status/UserName', '$:/Import'];

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
    This updates the list of tiddlers being edited in each wiki. Any tiddler on
    this list has the edit button disabled to prevent two people from
    simultaneously editing the same tiddler.
    If run without an input it just re-sends the lists to each browser, with a
    tiddler title as input it appends that tiddler to the list and sends the
    updated list to all connected browsers.
  */
  $tw.MultiUser.UpdateEditingTiddlers = function (tiddler) {
    // Check if a tiddler title was passed as input and that the tiddler isn't
    // already listed as being edited.
    // If there is a title and it isn't being edited add it to the list.
    if (tiddler && !$tw.MultiUser.EditingTiddlers[tiddler]) {
      $tw.MultiUser.EditingTiddlers[tiddler] = true;
    }
    // Create a json object representing the tiddler that lists which tiddlers
    // are currently being edited.
    var message = JSON.stringify({type: 'updateEditingTiddlers', list: Object.keys($tw.MultiUser.EditingTiddlers)});
    // Send the tiddler info to each connected browser
    $tw.MultiUser.SendToBrowsers(message);
  }

  /*
    This is a wrapper function that takes a message that is meant to be sent to
    all connected browsers and handles the details.

    It iterates though all connections, checkis if each one is active, tries to
    send the message, if the sending fails than it sets the connection as
    inactive.

    Note: This checks if the message is a string despite SendToBrowser also
    checking because if it needs to be changed and sent to multiple browsers
    changing it once here instead of once per browser should be better.
  */
  $tw.MultiUser.SendToBrowsers = function (message) {
    // If the message isn't a string try and coerce it into a string
    if (typeof message !== 'string') {
      message = JSON.stringify(message);
    }
    // Send message to all connections.
    $tw.connections.forEach(function (connection) {
      $tw.MultiUser.SendToBrowser(connection, message);
    })
  }

  /*
    This function sends a message to a single connected browser. It takes the
    browser connection object and the stringifyed message as input.
    If any attempt fails mark the connection as inacive.
  */
  $tw.MultiUser.SendToBrowser = function (connection, message) {
    // If the message isn't a string try and coerce it into a string
    if (typeof message !== 'string') {
      message = JSON.stringify(message);
    }
    // If the connection is open, send the message
    if (connection.socket.readyState === 1) {
      connection.socket.send(message, function (err) {
        // Send callback function, only used for error handling at the moment.
        if (err) {
          console.log('Websocket sending error:',err);
        }
      });
    }
  }

  /*
    This watches for changes to a folder and updates the wiki prefix when anything changes in the folder.
  */
  $tw.MultiUser.WatchFolder = function (folder, prefix) {
    // If there is no prefix set it to an empty string
    prefix = prefix || '';
    fs.watch(folder, function (eventType, filename) {
      // Make sure that the file name isn't undefined
      if (filename) {
        var itemPath = path.join(folder, filename);
        // If the event is that the file has been deleted than it won't exist
        // but we still need to act here.
        if(fs.existsSync(itemPath) && (itemPath.endsWith('.tid') || itemPath.endsWith('.meta'))) {
          if (fs.lstatSync(itemPath).isFile()) {
            // Load tiddler data from the file
            var tiddlerObject = $tw.loadTiddlersFromFile(itemPath);

            // Make sure that it at least has a title
            if (Object.keys(tiddlerObject.tiddlers[0]).indexOf('title') !== -1) {

              // Test to see if the filename matches what the wiki says it should
              // be. If not rename the file to match the rules set by the wiki.
              // TODO this assumes that the filename ends with .tid, that may not
              // always be the case. Figure out if we need to fix that for
              // tiddlres with meta files.
              var rename = false;
              if (tiddlerObject.tiddlers[0].title) {
                var tiddlerFileTitle = filename.endsWith('.tid')?filename.slice(0,-4):filename.slice(0,-5);
                if (tiddlerFileTitle !== $tw.syncadaptor.generateTiddlerBaseFilepath(tiddlerObject.tiddlers[0].title)) {
                  rename = true;
                }
              }

              // Don't update tiddlers on the exclude list or draft tiddlers
              if (tiddlerObject.tiddlers[0].title && $tw.MultiUser.ExcludeList.indexOf(tiddlerObject.tiddlers[0].title) === -1 && !tiddlerObject.tiddlers[0]['draft.of']) {
                // Internally tiddlywiki may have a prefix on the tiddler title
                // that we don't want in the file. This is used to define
                // namespaces when serving multiple wikis.
                // So internalTitle is the title used by everything in the $tw
                // object.
                // The normal title is tiddlerObject.tiddlers[0].title
                var internalTitle = (prefix === '' && !tiddlerObject.tiddlers[0].title.startsWith("{" + prefix + "}"))?tiddlerObject.tiddlers[0].title:"{" + prefix + "}" + tiddlerObject.tiddlers[0].title;

                var tiddler = $tw.wiki.getTiddler(internalTitle);

                // We need to check if the title listed in $tw.boot.files thing
                // no longer matches.

                // If the tiddler with that title doesn't exist, check if a
                // tiddler is listed with that file path in $tw.boot.files with a
                // different title. If so than remove the old tiddler and add the
                // new one. Also remove the old file and make the new one.
                var tiddlerName = Object.keys($tw.boot.files).filter(function (item) {
                  // A lot of this is to handle some weird edge cases I ran into
                  // while making it.
                  // TODO figure out why this happens.
                  if (typeof item === 'string') {
                    if (item === 'undefined') {
                      delete $tw.boot.files[item];
                      return false;
                    }
                    return ($tw.boot.files[item].filepath === itemPath) && (internalTitle !== item)
                  } else {
                    return false;
                  }
                })[0];
                if (rename || (!tiddler && tiddlerName)) {
                  if (rename) {
                    // translate tiddler title into filepath
                    // here we want the non-prefixed title to make the filepath.
                    var theFilepath = path.join(folder, $tw.syncadaptor.generateTiddlerBaseFilepath(tiddlerObject.tiddlers[0].title) + '.tid');
                  } else {
                    var theFilepath = $tw.boot.files[tiddlerName].filepath;
                  }
                  // This should be when a tiddler is renamed.
                  // So create the new one and delete the old one.
                  // Make the new file path
                  // Use the non-prefixed title
                  var newTitle = $tw.syncadaptor.generateTiddlerBaseFilepath(tiddlerObject.tiddlers[0].title)
                  console.log('Rename Tiddler ', tiddlerName, ' to ', newTitle);
                  // Create the new tiddler
                  $tw.MultiUser.MakeTiddlerInfo(folder, newTitle, tiddlerObject, prefix);
                  // Put the tiddler object in the correct form
                  // This gets saved to the file sysetm so non-prefixed title
                  var newTiddler = {fields: tiddlerObject.tiddlers[0]};
                  // Save the new file
                  $tw.syncadaptor.saveTiddler(newTiddler, prefix);
                  if (itemPath !== theFilepath) {
                    // Delete the old file, the normal delete action takes care of
                    // the rest.
                    fs.unlinkSync(itemPath);
                  }
                } else if (!tiddler || !$tw.boot.files[internalTitle]) {
                  // This check needs the prefixed title (everything in $tw.boot
                  // uses the internalTitle)
                  // This is a new tiddler, so just save the tiddler info
                  $tw.MultiUser.MakeTiddlerInfo(folder, filename, tiddlerObject, prefix);
                }
                // Make a tiddler object if one doesn't exist. It uses the
                // non-prefixed name because it gets sent to the browsers.
                if (!tiddler) {
                  tiddler = {fields: tiddlerObject.tiddlers[0]};
                }
                // Check if we should send it to each of the connected browsers
                Object.keys($tw.connections).forEach(function(connectionIndex) {
                  // If the waiting list entry for this connection doesn't exist
                  // than create it as an empty object.
                  if (!$tw.MultiUser.WaitingList[connectionIndex]) {
                    $tw.MultiUser.WaitingList[connectionIndex] = {};
                  }
                  // If the current tiddler on the current connection isn't on // the waiting list
                  if (!$tw.MultiUser.WaitingList[connectionIndex][tiddlerObject.tiddlers[0].title]) {
                    // Update the list of tiddlers currently in the browser
                    var message = JSON.stringify({type: 'makeTiddler', fields: tiddlerObject.tiddlers[0], wiki: prefix});
                    // TODO make it consistent so that connection is always the
                    // object instead of sometimes just teh index.
                    $tw.MultiUser.SendToBrowser($tw.connections[connectionIndex], message);
                    // Put this tiddler on this connection on the wait list.
                    $tw.MultiUser.WaitingList[connectionIndex][tiddlerObject.tiddlers[0].title] = true;
                  }
                });
                // Make sure the node process has the current tiddler listed with
                // any new changes.
                var tempTiddlerFields = {};
                Object.keys(tiddlerObject.tiddlers[0]).forEach(function(fieldName) {
                  tempTiddlerFields[fieldName] = tiddlerObject.tiddlers[0][fieldName];
                });
                tempTiddlerFields.title = internalTitle;
                $tw.wiki.addTiddler(new $tw.Tiddler(tempTiddlerFields));
                $tw.MultiUser.Wikis = $tw.MultiUser.Wikis || {};
                if (prefix !== '') {
                  $tw.MultiUser.Wikis[prefix] = $tw.MultiUser.Wikis[prefix] || {};
                  $tw.MultiUser.Wikis[prefix].tiddlers = $tw.MultiUser.Wikis[prefix].tiddlers || [];
                  $tw.MultiUser.Wikis[prefix].tiddlers.push(internalTitle);
                } else {
                  if(!internalTitle.startsWith('{')) {
                    $tw.MultiUser.Wikis.RootWiki = $tw.MultiUser.Wikis.RootWiki || {};
                    $tw.MultiUser.Wikis.RootWiki.tiddlers = $tw.MultiUser.Wikis.RootWiki.tiddlers || [];
                    $tw.MultiUser.Wikis.RootWiki.tiddlers.push(internalTitle);
                  }
                }
              }
            }
          } else if (fs.lstatSync(itemPath).isDirectory()) {
            console.log('Make a folder');
            console.log(itemPath)
            $tw.MultiUser.WatchFolder(folder);

          }
        } else if (itemPath.endsWith('.tid') || itemPath.endsWith('.meta')) {
          filename = filename.endsWith('.meta')?filename.slice(0,-5):filename;
          console.log('Delete Tiddler ', folder, '/', filename)
          $tw.MultiUser.DeleteTiddler(folder, filename, prefix);
        }
      } else {
        console.log('No filename given!');
      }
    });
  }

  $tw.MultiUser.MakeTiddlerInfo = function (folder, filename, tiddlerObject, prefix) {
    var title = tiddlerObject.tiddlers[0].title;
    var tempTidObject = {};
    Object.keys(tiddlerObject.tiddlers[0]).forEach(function(field) {
      tempTidObject[field] = tiddlerObject.tiddlers[0][field];
    })
    // Everything here should use the internal title
    tempTidObject.title = "{" + prefix + "}" === '{}'?title:"{" + prefix + "}" + title;
    var itemPath = path.join(folder, filename);
    // If the tiddler doesn't exits yet, create it.
    var tiddler = new $tw.Tiddler({fields:tempTidObject});


    // Create the file info also
    var fileInfo = {};
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
    // Set the final fileInfo
    fileInfo.filepath = itemPath;
    $tw.boot.files[tiddler.fields.title] = fileInfo;

    // Add the newly cretaed tiddler. Allow multi-tid files (This
    // isn't tested in this context).
    $tw.wiki.addTiddlers(tempTidObject);
    $tw.wiki.addTiddler(tempTidObject);
    if (prefix && prefix !== '') {
      var tidTitle = title.startsWith("{" + prefix + "}")?title:"{" + prefix + "}" + title;
      $tw.MultiUser.Wikis[prefix].tiddlers.push(tidTitle);
    } else {
      if (!title.startsWith('{')) {
        $tw.MultiUser = $tw.MultiUser || {};
        $tw.MultiUser.Wikis = $tw.MultiUser.Wikis || {};
        $tw.MultiUser.Wikis.RootWiki = $tw.MultiUser.Wikis.RootWiki || {};
        $tw.MultiUser.Wikis.RootWiki.tiddlers = $tw.MultiUser.Wikis.RootWiki.tiddlers || [];
        $tw.MultiUser.Wikis.RootWiki.tiddlers.push(title);
      }
    }
  }

  // TODO make this handle deleting .meta files
  $tw.MultiUser.DeleteTiddler = function (folder, filename, prefix) {
    console.log("Deleted tiddler file " + filename);
    var itemPath = path.join(folder, filename);
    // Get the file name because it isn't always the same as the tiddler
    // title.
    // TODO there is a strange error where sometimes $tw.boot.files will have
    // an old entry instead of deleting it it will rename it 'undefined'.
    // This part takes care of that but I don't know why it happens.
    // So sometimes you will get the message 'Deleting Tiddler "undefined"'
    // in addition to the message about deleting the real tiddler.
    // At this point the tiddlerName is the internal name so we need to switch
    // to the non-prefixed name
    Object.keys($tw.boot.files).forEach(function(tiddlerName) {
      if ($tw.boot.files[tiddlerName].filepath === itemPath) {
        // Remove the tiddler info from $tw.boot.files
        console.log('Deleting Tiddler "' + tiddlerName + '"');
        delete $tw.boot.files[tiddlerName]
        $tw.wiki.deleteTiddler(tiddlerName);
        // Create a message saying to remove the tiddler
        // Remove the prefix from the tiddler
        tiddlerName = tiddlerName.replace(new RegExp('^\{' + prefix + '\}'),'');
        var message = JSON.stringify({type: 'removeTiddler', title: tiddlerName, wiki: prefix});
        // Send the message to each connected browser
        $tw.MultiUser.SendToBrowsers(message);
      }
    });
  }

  /*
    This function walks through all the folders listed in the folder tree and
    creates a watcher for each one.

    Each property in the $tw.MultiUser.FolderTree object has this structure:

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
  $tw.MultiUser.WatchAllFolders = function (folderTree, prefix) {
    // Watch the current folder after making sure that the path exists
    if (typeof folderTree.path === 'string') {
      if (fs.existsSync(folderTree.path)) {
        $tw.MultiUser.WatchFolder(folderTree.path, prefix);
      }
    }
    // Use this same function on each sub-folder listed
    Object.keys(folderTree.folders).forEach(function(folder) {
      $tw.MultiUser.WatchAllFolders(folderTree.folders[folder], prefix);
    });
  }

  /*
    Recursively create a directory
    copied from core/modules/utils/filesystem.js because for some reason it
    isn't available at this point in the boot process.
  */
  var isDirectory = function(dirPath) {
  	return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  };
  var createDirectory = function(dirPath) {
  	if(dirPath.substr(dirPath.length-1,1) !== path.sep) {
  		dirPath = dirPath + path.sep;
  	}
  	var pos = 1;
  	pos = dirPath.indexOf(path.sep,pos);
  	while(pos !== -1) {
  		var subDirPath = dirPath.substr(0,pos);
  		if(!isDirectory(subDirPath)) {
  			try {
  				fs.mkdirSync(subDirPath);
  			} catch(e) {
  				return "Error creating directory '" + subDirPath + "'";
  			}
  		}
  		pos = dirPath.indexOf(path.sep,pos + 1);
  	}
  	return null;
  };

}

})();
