/*\
title: $:/plugins/OokTech/Bob/NodeBasicHandlers.js
type: application/javascript
module-type: startup

These are message handler functions for the web socket servers. Use this file
as a template for extending the web socket funcitons.

This handles messages sent to the node process.
\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.platforms = ["node"];

if($tw.node) {
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
  $tw.Bob.Shared = require('$:/plugins/OokTech/Bob/SharedFunctions.js');
  /*
    This handles when the browser sends the list of all tiddlers that currently
    exist in the browser version of the wiki. This is different than the list of
    all tiddlers in files.
  */
  $tw.nodeMessageHandlers.browserTiddlerList = function(data) {
    // Save the list of tiddlers in the browser as part of the $tw object so it
    // can be used elsewhere.
    $tw.BrowserTiddlerList[data.source_connection] = data.titles;
    $tw.Bob.Shared.sendAck(data);
  }

  /*
    For a lazily loaded wiki this gets the skinny tiddler list.
  */
  $tw.nodeMessageHandlers.getSkinnyTiddlers = function(data) {
    $tw.Bob.Shared.sendAck(data);
    // We need at least the name of the wiki
    if(data.wiki) {
      $tw.ServerSide.loadWiki(data.wiki);
      // Get the skinny tiddlers
      const tiddlers = []
      $tw.Bob.Wikis[data.wiki].wiki.allTitles().forEach(function(title) {
        if(title.slice(0,3) !== '$:/') {
          tiddlers.push($tw.Bob.Wikis[data.wiki].wiki.getTiddler(title).getFieldStrings({exclude:['text']}))
        }
      })
      const message = {
        type: 'skinnyTiddlers',
        tiddlers: tiddlers
      }
      $tw.Bob.Shared.sendMessage(message, data.source_connection)
    }
  }

  /*
    For lazy loading this gets a full tiddler
  */
  $tw.nodeMessageHandlers.getFullTiddler = function(data) {
    $tw.Bob.Shared.sendAck(data);
    $tw.ServerSide.loadWiki(data.wiki);
    const tiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(data.title)
    const message = {
      type: 'loadTiddler',
      tiddler: tiddler || {}
    }
    $tw.Bob.Shared.sendMessage(message, data.source_connection)
  }

  /*
    This responds to a ping from the browser. This is used to check and make sure
    that the browser and server are connected.
    It also echos back any data that was sent. This is used by the heartbeat to
    make sure that the server and browser are still connected.
  */
  $tw.nodeMessageHandlers.ping = function(data) {
    let message = {};
    Object.keys(data).forEach(function (key) {
      message[key] = data[key];
    })
    message.type = 'pong';
    if(data.heartbeat) {
      message.heartbeat = true;
    }
    // When the server receives a ping it sends back a pong.
    const response = JSON.stringify(message);
    $tw.connections[data.source_connection].socket.send(response);
  }

  /*
    This handles saveTiddler messages sent from the browser.

    If we always want to ignore draft tiddlers,
    use `[has[draft.of]]` in $:/plugins/OokTech/Bob/ExcludeSync
  */
  $tw.nodeMessageHandlers.saveTiddler = function(data) {
    // Acknowledge the message.
    $tw.Bob.Shared.sendAck(data);
    // Make sure there is actually a tiddler sent
    if(data.tiddler) {
      // Make sure that the tiddler that is sent has fields
      if(data.tiddler.fields) {
        const prefix = data.wiki || '';
        // Set the saved tiddler as no longer being edited. It isn't always
        // being edited but checking eacd time is more complex than just
        // always setting it this way and doesn't benifit us.
        $tw.nodeMessageHandlers.cancelEditingTiddler({
          tiddler:{
            fields:{
              title:data.tiddler.fields.title
            }
          },
          wiki: prefix
        });
        // If we are not expecting a save tiddler event than save the
        // tiddler normally.
        if(!$tw.Bob.Files[data.wiki][data.tiddler.fields.title]) {
          $tw.syncadaptor.saveTiddler(data.tiddler, prefix, data.source_connection);
        } else {
          // If changed send tiddler
          let changed = true;
          try {
            let tiddlerObject = {}
            if(data.tiddler.fields._canonical_uri) {
              tiddlerObject = $tw.loadTiddlersFromFile($tw.Bob.Files[prefix][data.tiddler.fields.title].filepath+'.meta');
            } else {
              tiddlerObject = $tw.loadTiddlersFromFile($tw.Bob.Files[prefix][data.tiddler.fields.title].filepath);
            }
            // The file has the normal title so use the normal title here.
            changed = $tw.Bob.Shared.TiddlerHasChanged(data.tiddler, tiddlerObject);
          } catch (e) {
            $tw.Bob.logger.log('Save tiddler error: ', e, {level: 3});
          }
          if(changed) {
            $tw.syncadaptor.saveTiddler(data.tiddler, prefix, data.source_connection);
          }
        }
        delete $tw.Bob.EditingTiddlers[data.wiki][data.tiddler.fields.title];
        $tw.Bob.UpdateEditingTiddlers(false, data.wiki);
      }
    }
  }

  /*
    This is the handler for when the browser sends the deleteTiddler message.
  */
  $tw.nodeMessageHandlers.deleteTiddler = function(data) {
    // Acknowledge the message.
    $tw.Bob.Shared.sendAck(data);
    $tw.Bob.logger.log('Node Delete Tiddler', {level: 4});
    data.tiddler = data.tiddler || {};
    data.tiddler.fields = data.tiddler.fields || {};
    const title = data.tiddler.fields.title;
    if(title) {
      // Delete the tiddler file from the file system
      $tw.syncadaptor.deleteTiddler(title, {wiki: data.wiki});
      // Remove the tiddler from the list of tiddlers being edited.
      if($tw.Bob.EditingTiddlers[data.wiki][title]) {
        delete $tw.Bob.EditingTiddlers[data.wiki][title];
        $tw.Bob.UpdateEditingTiddlers(false, data.wiki);
      }
      $tw.Bob.logger.log('Deleted tiddler', data.tiddler.fields.title)
    }
  }

  /*
    This is the handler for when a browser sends the editingTiddler message.
  */
  $tw.nodeMessageHandlers.editingTiddler = function(data) {
    // Acknowledge the message.
    $tw.Bob.Shared.sendAck(data);
    data.tiddler = data.tiddler || {};
    data.tiddler.fields = data.tiddler.fields || {};
    const title = data.tiddler.fields.title;
    if(title) {
      // Add the tiddler to the list of tiddlers being edited to prevent
      // multiple people from editing it at the same time.
      $tw.Bob.UpdateEditingTiddlers(title, data.wiki);
    }
  }

  /*
    This is the handler for when a browser stops editing a tiddler.
  */
  $tw.nodeMessageHandlers.cancelEditingTiddler = function(data) {
    // Acknowledge the message.
    $tw.Bob.Shared.sendAck(data);
    data.tiddler = data.tiddler || {};
    data.tiddler.fields = data.tiddler.fields || {};
    let title = data.tiddler.fields.title;
    if(title) {
      // Make sure that the tiddler title is a string
      if(data.tiddler.fields["draft.of"]) {
        title = data.tiddler.fields["draft.of"]
      }
      // Remove the current tiddler from the list of tiddlers being edited.
      if($tw.Bob.EditingTiddlers[data.wiki][title]) {
        delete $tw.Bob.EditingTiddlers[data.wiki][title];
      }
      $tw.Bob.UpdateEditingTiddlers(false, data.wiki);
    }
  }

  /*
    This updates what wikis are being served and where they are being served
  */
  $tw.nodeMessageHandlers.updateRoutes = function (data) {
    $tw.Bob.Shared.sendAck(data);
    // Then clear all the routes to the non-root wiki
    $tw.httpServer.clearRoutes();
    // The re-add all the routes from the settings
    // This reads the settings so we don't need to give it any arguments
    $tw.httpServer.addOtherRoutes();
  }

  /*
    This sends back a list of all wikis that are viewable using the current access token.
  */
  $tw.nodeMessageHandlers.getViewableWikiList = function (data) {
    data = data || {};
    $tw.Bob.Shared.sendAck(data);
    const viewableWikis = $tw.ServerSide.getViewableWikiList(data);
    // Send viewableWikis back to the browser
    const message = {
      type: 'setViewableWikis',
      list: $tw.utils.stringifyList(viewableWikis),
      wiki: data.wiki
    };
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
  }

  /*
    This looks in the wikis folder set in the configuration
    $tw.setting.wikisPath
    If none is set it uses ./Wikis

    This walks though subfolders too.
  */
  $tw.nodeMessageHandlers.findAvailableWikis = function (data) {
    $tw.Bob.Shared.sendAck(data);
    // This gets the paths of all wikis listed in the settings
    function getWikiPaths(settingsObject) {
      console.log('settingsObject', settingsObject)
      const settingsKeys = Object.keys(settingsObject);
      let outPaths = [];
      settingsKeys.forEach(function(thisKey) {
        if(thisKey === '__path') {
          // its one of the paths we want
          outPaths.push(path.resolve(basePath, $tw.settings.wikisPath, settingsObject[thisKey]));
        } else if(thisKey === '__permissions') {
          // Ignore it
        } else if(typeof settingsObject[thisKey] === 'object') {
          // Recurse
          outPaths.concat(getWikiPaths(settingsObject[thisKey]));
        }
      })
      console.log(outPaths)
      return outPaths
    }
    // This gets a list of all wikis in the wikis folder and subfolders
    function getRealPaths(startPath) {
      // Check each folder in the wikis folder to see if it has a
      // tiddlywiki.info file
      let realFolders = [];
      try {
        const folderContents = fs.readdirSync(startPath);
        folderContents.forEach(function (item) {
          const fullName = path.join(startPath, item);
          if(fs.statSync(fullName).isDirectory()) {
            if($tw.ServerSide.wikiExists(fullName)) {
              realFolders.push(fullName);
            }
            // Check if there are subfolders that contain wikis and recurse
            const nextPath = path.join(startPath,item)
            if(fs.statSync(nextPath).isDirectory()) {
              realFolders = realFolders.concat(getRealPaths(nextPath));
            }
          }
        })
      } catch (e) {
        const message = {
          alert: 'Error getting wiki paths: ' + e,
          connections: [data.source_connection]
        };
        $tw.ServerSide.sendBrowserAlert(message);
        $tw.Bob.logger.log('Error getting wiki paths', e, {level:1});
      }
      return realFolders;
    }
    // This takes the list of wikis in the settings and returns a new object
    // without any of the non-existent wikis listed
    function pruneWikiList(dontExistList, settingsObj) {
      let prunedSettings = {};
      Object.keys(settingsObj).forEach(function(wikiName) {
        if(typeof settingsObj[wikiName] === 'string') {
          // Check if the wikiName resolves to one of the things to remove
          if(dontExistList.indexOf(path.resolve(wikiFolderPath, settingsObj[wikiName])) === -1) {
            // If the wiki isn't listed as not existing add it to the prunedSettings
            prunedSettings[wikiName] = settingsObj[wikiName];
          }
        } else if(typeof settingsObj[wikiName] === 'object') {
          if(Object.keys(settingsObj[wikiName]).length > 0) {
            prunedSettings[wikiName] = pruneWikiList(dontExistList, settingsObj[wikiName])
          }
        }
      })
      return prunedSettings
    }
    const fs = require('fs');
    const path = require('path');
    const basePath = $tw.ServerSide.getBasePath()
    $tw.settings.wikisPath = $tw.settings.wikisPath || './Wikis';
    let wikiFolderPath = path.resolve(basePath, $tw.settings.wikisPath);
    // Make sure that the wikiFolderPath exists
    const error = $tw.utils.createDirectory(path.resolve(basePath, $tw.settings.wikisPath));
    // Check each folder in the wikis folder to see if it has a tiddlywiki.info
    // file.
    // If there is no tiddlywiki.info file it checks sub-folders.
    const realFolders = getRealPaths(wikiFolderPath);
    // If it does check to see if any listed wiki has the same path, if so skip
    // it
    let alreadyListed = [];
    const listedWikis = getWikiPaths($tw.settings.wikis);
    realFolders.forEach(function(folder) {
      // Check is the wiki is listed
      if(listedWikis.indexOf(folder) > -1) {
        alreadyListed.push(folder);
      }
    })
    let wikisToAdd = realFolders.filter(function(folder) {
      return alreadyListed.indexOf(folder) === -1;
    })
    wikisToAdd = wikisToAdd.map(function(thisPath) {
      return path.relative(wikiFolderPath,thisPath);
    })
    const dontExist = listedWikis.filter(function(folder) {
      return !$tw.ServerSide.wikiExists(folder);
    })
    data.update = data.update || ''
    if(typeof data.update !== 'string') {
      data.update = (data.update === true)?'true':''
    }
    if(data.update.toLowerCase() === 'true') {
      wikisToAdd.forEach(function (wikiName) {
        const nameParts = wikiName.split('/');
        let settingsObj = $tw.settings.wikis;
        let i;
        for (i = 0; i < nameParts.length; i++) {
          if(typeof settingsObj[nameParts[i]] === 'object' && i < nameParts.length - 1) {
            settingsObj = settingsObj[nameParts[i]];
          } else if(i < nameParts.length - 1) {
            settingsObj[nameParts[i]] = settingsObj[nameParts[i]] || {};
            settingsObj = settingsObj[nameParts[i]]
          } else {
            settingsObj[nameParts[i]] = settingsObj[nameParts[i]] || {};
            settingsObj[nameParts[i]].__path = nameParts.join('/');
          }
        }
      })
    }
    if(typeof data.remove !== 'string') {
      data.remove = (data.remove === false)?'false':'true'
    }
    if(data.remove.toLowerCase() === 'true') {
      // update the wikis listing in the settings with a version that doesn't
      // have the wikis that don't exist.
      $tw.settings.wikis = pruneWikiList(dontExist, $tw.settings.wikis);
    }
    // Save the new settings, update routes, update settings tiddlers in the
    // browser and update the list of available wikis
    if(data.saveSettings) {
      data.fromServer = true;
      $tw.nodeMessageHandlers.saveSettings(data);
      $tw.nodeMessageHandlers.updateRoutes(data);
      //setTimeout($tw.nodeMessageHandlers.getViewableWikiList,1000,data)
    }
  }

  /*
    This handles ack messages.
  */
  $tw.nodeMessageHandlers.ack = $tw.Bob.Shared.handleAck;

}
})();