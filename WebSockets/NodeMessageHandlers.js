/*\
title: $:/plugins/OokTech/Bob/NodeMessageHandlers.js
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

if ($tw.node) {
  let WebSocket = require('$:/plugins/OokTech/Bob/External/WS/ws.js')
  $tw.connections = $tw.connections || [];
  $tw.Bob = $tw.Bob || {};
  $tw.Bob.Files = $tw.Bob.Files || {};
  $tw.Bob.Shared = require('$:/plugins/OokTech/Bob/SharedFunctions.js');
  // This lets you add to the $tw.nodeMessageHandlers object without overwriting
  // existing handler functions
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
  // Ensure that the browser tiddler list object exists without overwriting an
  // existing copy.
  $tw.BrowserTiddlerList = $tw.BrowserTiddlerList || {};

  const sendAck = function (data) {
    if (data.id) {
      if (data.source_connection !== undefined && data.source_connection !== -1) {
        $tw.connections[data.source_connection].socket.send(JSON.stringify({type: 'ack', id: data.id}));
      }
    }
  }

  /*
    This handles when the browser sends the list of all tiddlers that currently
    exist in the browser version of the wiki. This is different than the list of
    all tiddlers in files.
  */
  $tw.nodeMessageHandlers.browserTiddlerList = function(data) {
    // Save the list of tiddlers in the browser as part of the $tw object so it
    // can be used elsewhere.
    $tw.BrowserTiddlerList[data.source_connection] = data.titles;
    sendAck(data);
  }

  /*
    This is just a test function to make sure that everthing is working.
    It displays the contents of the received data in the console.
  */
  $tw.nodeMessageHandlers.test = function(data) {
    console.log(data);
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
    if (data.heartbeat) {
      message.heartbeat = true;
    }
    // When the server receives a ping it sends back a pong.
    const response = JSON.stringify(message);
    $tw.connections[data.source_connection].socket.send(response);
  }

  /*
    This handles saveTiddler messages sent from the browser.

    TODO: Determine if we always want to ignore draft tiddlers.

    Waiting lists are per-connection so use regular titles.
    Editing lists are global so need prefixes
    Saving uses normal titles
    $tw.boot uses prefixed titles
  */
  $tw.nodeMessageHandlers.saveTiddler = function(data) {
    // Make sure there is actually a tiddler sent
    if (data.tiddler) {
      // Make sure that the tiddler that is sent has fields
      if (data.tiddler.fields) {
        // Ignore draft tiddlers
        if (!data.tiddler.fields['draft.of']) {
          const prefix = data.wiki || '';
          //var internalTitle = '{'+data.wiki+'}'+data.tiddler.fields.title;
          // Set the saved tiddler as no longer being edited. It isn't always
          // being edited but checking eacd time is more complex than just
          // always setting it this way and doesn't benifit us.
          $tw.nodeMessageHandlers.cancelEditingTiddler({tiddler:{fields:{title:data.tiddler.fields.title}}, wiki: prefix});
          // If we are not expecting a save tiddler event than save the
          // tiddler normally.
          if (!$tw.Bob.Files[data.wiki][data.tiddler.fields.title]) {
            $tw.syncadaptor.saveTiddler(data.tiddler, prefix);
          } else {
            // If changed send tiddler
            let changed = true;
            try {
              let tiddlerObject = {}
              if (data.tiddler.fields._canonical_uri) {
                tiddlerObject = $tw.loadTiddlersFromFile($tw.Bob.Files[prefix][data.tiddler.fields.title].filepath+'.meta');
              } else {
                tiddlerObject = $tw.loadTiddlersFromFile($tw.Bob.Files[prefix][data.tiddler.fields.title].filepath);
              }
              // The file has the normal title so use the normal title here.
              changed = $tw.Bob.Shared.TiddlerHasChanged(data.tiddler, tiddlerObject);
            } catch (e) {
              //console.log(e);
            }
            if (changed) {
              $tw.syncadaptor.saveTiddler(data.tiddler, prefix);
              // Set the wiki as modified
              $tw.Bob.Wikis[prefix].modified = true;
            }
          }
          delete $tw.Bob.EditingTiddlers[data.wiki][data.tiddler.fields.title];
          $tw.Bob.UpdateEditingTiddlers(false, data.wiki);
        }
      }
    }
    // Acknowledge the message.
    sendAck(data);
  }

  /*
    This is the handler for when the browser sends the deleteTiddler message.
  */
  $tw.nodeMessageHandlers.deleteTiddler = function(data) {
    //console.log('Node Delete Tiddler');
    data.tiddler = data.tiddler || {};
    data.tiddler.fields = data.tiddler.fields || {};
    const title = data.tiddler.fields.title;
    if (title) {
      // Delete the tiddler file from the file system
      $tw.syncadaptor.deleteTiddler(title, {wiki: data.wiki});
      // Set the wiki as modified
      $tw.Bob.Wikis[data.wiki].modified = true;
      // Remove the tiddler from the list of tiddlers being edited.
      if ($tw.Bob.EditingTiddlers[data.wiki][title]) {
        delete $tw.Bob.EditingTiddlers[data.wiki][title];
        $tw.Bob.UpdateEditingTiddlers(false, data.wiki);
      }
    }
    // Acknowledge the message.
    sendAck(data);
  }

  /*
    This is the handler for when a browser sends the editingTiddler message.
  */
  $tw.nodeMessageHandlers.editingTiddler = function(data) {
    data.tiddler = data.tiddler || {};
    data.tiddler.fields = data.tiddler.fields || {};
    const title = data.tiddler.fields.title;
    if (title) {
      // Add the tiddler to the list of tiddlers being edited to prevent
      // multiple people from editing it at the same time.
      $tw.Bob.UpdateEditingTiddlers(title, data.wiki);
    }
    // Acknowledge the message.
    sendAck(data);
  }

  /*
    This is the handler for when a browser stops editing a tiddler.
  */
  $tw.nodeMessageHandlers.cancelEditingTiddler = function(data) {
    data.tiddler = data.tiddler || {};
    data.tiddler.fields = data.tiddler.fields || {};
    let title = data.tiddler.fields.title;
    if (title) {
      // Make sure that the tiddler title is a string
      if (title.startsWith("Draft of '")) {
        title = title.slice(10,-1);
      }
      // Remove the current tiddler from the list of tiddlers being edited.
      if ($tw.Bob.EditingTiddlers[data.wiki][title]) {
        delete $tw.Bob.EditingTiddlers[data.wiki][title];
      }
      $tw.Bob.UpdateEditingTiddlers(false, data.wiki);
    }
    // Acknowledge the message.
    sendAck(data);
  }

  /*
    Sync servers takes a filter and syncs all of the tiddlers returned by the
    filter with a remote server.
    It should use the same process as the syncChanges message, possibly they
    should be combined.

    The data object has:
    {
      type: 'syncServer',
      wiki: wikiName,
      token: token,
      id: messageID,
      source_connection: connectionIndex,
      remoteUrl: remoteUrl,
      remoteWiki: remoteWikiName,
      syncFilter: syncFilter,
      syncType: syncType,
      conflictType: conflictType,
      remoteToken: remoteToken
    }

    this takes the tiddlers returned by the syncFilter in the wiki named in
    wikiName and syncs them with the server at remoteUrl using syncType, any
    conflicts are handled using conflictType. If the remote server requires an
    access token it has to be suppiled in remoteToken. If the remote wiki
    doesn't have the same name as the local wiki than it needs to be given as
    remoteWiki.

    syncType can be:
      - pushOnly: local tiddlers are pushed to the remote server but no changes
      are pulled from the remote server.
      - pullOnly: changes on the remote server are fetched but no local
      tiddlers are sent.
      - bidirectional: local changes are sent and remote changes are pulled

    conflictType can be:
      - localWins: if there are conflicts the local tiddlers are kept even if
      remote tiddlers have been changed, tiddlers that didn't exist previously
      are synced.
      - remoteWins: in the case of conflicts, remote tiddlers overwrite local
      tiddlers, only tiddlers that don't exist on the remote server are sent,
      if applicable.
      - newestWins: in case of conflicts, the tiddlers with the most recent
      changes are kept regardless of which server it is from.
      - oldestWins: least recently modified tiddlers are kept in case of
      conflicts.
  */
  $tw.nodeMessageHandlers.syncServer = function(data) {
    // We need at least the remote url or we can't act.
    if (data.remoteUrl) {
      // Try to connect to the remote server
      $tw.Bob.RemoteServers[data.remoteUrl] = $tw.Bob.RemoteServers[data.remoteUrl] || {}

      data.syncFilter = data.syncFilter || '[!is[system]]'
      data.syncType = data.syncType || 'bidirectional'
      data.conflictType = data.conflictType || 'newestWins'
      data.remoteWiki = data.remoteWiki || data.wiki

      $tw.Bob.RemoteServers[data.remoteUrl].socket = $tw.Bob.RemoteServers[data.remoteUrl].socket || {}

      if($tw.Bob.RemoteServers[data.remoteUrl].socket.readyState !== 1) {
        // Get the url for the remote websocket
        const URL = require('url')
        const remoteUrl = new URL(data.remoteUrl)
        const websocketProtocol = (remoteUrl.protocol.startsWith('https'))?'wss://':'ws://'
        // connect web socket
        const socket = new WebSocket(websocketProtocol + remoteUrl.host + remoteUrl.pathname)
        // Save the socket for future use
        $tw.Bob.RemoteServers[data.remoteUrl].socket = socket
        socket.on('open', function() {
          startRemoteSync($tw.Bob.RemoteServers[data.remoteUrl])
        })
      } else {
        startRemoteSync($tw.Bob.RemoteServers[data.remoteUrl], data)
      }
    }
    sendAck(data)
  }
  function startRemoteSync(remoteServerObject, data) {
    // Get a list of tiddlers from the local wiki that should be synced if
    // syncType is bidirectional or pushOnly
    let pushList = []
    if (['bidirectional','pushOnly'].indexOf(data.syncType) !== -1) {
      pushList = $tw.Bob.Wikis[data.wiki].filterTiddlers(data.syncFilter)
    }
    let tiddlerHashes = {}
    pushList.forEach(function(tidName) {
      tiddlerHashes[tidName] = $tw.Bob.Shared.getTiddlerHash(tidName)
    })
    // send a sync message with the filter and accompanying tiddler hashes.
    let message = {
      syncType: data.syncType,
      syncFilter: data.syncFilter,
      conflictType: data.conflictType
    }
    remoteServerObject.send(JSON.stringify(message))

    // The remote server should reply with a list/lists depending on the
    // syncType.
    //    - The names of tiddlers that the remote is missing
    //    - the names of tiddlers that the local server is missing
    //    - hashes of any tiddlers that don't mach

    // Depending on the sync type than the two servers send the changed
    // tiddlers to the others.
  }

  /*
    This is for resyncing with a wiki that was disconnected and has reconnected
    The data object should have the form:
    {
      type: 'syncChanges',
      since: startTime,
      changes: messageQueue,
      wiki: wikiName,
      token: token,
      id: messageID,
      source_connection: connectionIndex
    }

    This misses any changes that happened to the server since it was started
    this time. So if there are changes to the server after it is disconnected
    and then the server is reset none of those changes are synced.

    How do we do a test to figure out if anything has changed on the server?
    Comparing hashes of tiddlers may work.
    We could send an object that has the tiddler names as keys and a hash of
    the contets that can be checked against the server version.
    This may give different results for windows and linux because of the NLCR
    thing.
    We would need a computationally inexpensive hashing algorithm, I think that
    there are plenty of them.

    For now we can send a list of tiddlers in the browser and any on the server
    that aren't listed need to be sent.
  */
  $tw.nodeMessageHandlers.syncChanges = function(data) {
    // Make sure that the wiki that the syncing is for is actually loaded
    // TODO make sure that this works for wikis that are under multiple levels
    $tw.ServerSide.loadWiki(data.wiki);
    // Make sure that the server history exists
    $tw.Bob.ServerHistory = $tw.Bob.ServerHistory || {};
    $tw.Bob.ServerHistory[data.wiki] = $tw.Bob.ServerHistory[data.wiki] || [];
    // Get the received message queue
    let queue = [];
    try {
      queue = JSON.parse(data.changes);
    } catch (e) {
      console.log("Can't parse server changes!!");
    }
    // Only look at changes more recent than when the browser disconnected
    const recentServer = $tw.Bob.ServerHistory[data.wiki].filter(function(entry) {
      return entry.timestamp > data.since;
    })
    let conflicts = [];
    // Iterate through the received queue
    queue.forEach(function(messageData) {
      // Find the serverEntry for the tiddler the current message is for, if
      // any.
      const serverEntry = recentServer.find(function(entry) {
        return entry.title === messageData.title
      })
      // If the tiddler has an entry check if it is a conflict.
      // Both deleting the tiddler is not a conflict, both saving the same
      // changes is not a conflict, otherwise it is.
      if (serverEntry) {
        if (messageData.type !== serverEntry.type) {
          // Different message types between server and browser => conflict
          conflicts.push(messageData.title);
        } else if (messageData.type === 'saveTiddler' && serverEntry.type === 'saveTiddler') {
          // Server and browser are both save => conflict if the two tiddlers
          // aren't the same.
          let tempTid = JSON.parse(JSON.stringify(messageData.message.tiddler));
          tempTid.fields.title = messageData.title;
          const serverTiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(tempTid.fields.title);
          if ($tw.Bob.Shared.TiddlerHasChanged(serverTiddler, tempTid)) {
            conflicts.push(messageData.title);
          }
        }
      }
    });
    // Take care of all the messages that aren't conflicting
    // First from the received queue
    queue.forEach(function(messageData){
      if (conflicts.indexOf(messageData.title) === -1) {
        // Send the message to the handler with the appropriate setup
        $tw.Bob.handleMessage.call($tw.connections[data.source_connection].socket, JSON.stringify(messageData.message));
      }
    });
    // Then from the server side
    recentServer.forEach(function(messageData) {
      if (conflicts.indexOf(messageData.title) === -1) {
        let message = {type: messageData.type, wiki: data.wiki}
        let tiddler
        if (messageData.type === 'saveTiddler') {
          const longTitle = messageData.title;
          const tempTid = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(longTitle);
          if (typeof tempTid === 'object') {
            tiddler = JSON.parse(JSON.stringify(tempTid));
            tiddler.fields.title = messageData.title;
            // Making the copy above does something that breaks the date fields
            if (tempTid.fields.created) {
              tiddler.fields.created = $tw.utils.stringifyDate(tempTid.fields.created);
            }
            if (tempTid.fields.modified) {
              tiddler.fields.modified = $tw.utils.stringifyDate(tempTid.fields.modified);
            }
          }
        } else {
          tiddler = {fields:{title:messageData.title}}
        }
        message.tiddler = tiddler;
        if (typeof tiddler === 'object') {
          $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
        }
      }
    });
    // Then do something with the conflicts
    // I think that we need a new message, something like 'conflictingEdits'
    // that sends the tiddler info from the server to the browser and the
    // browser takes care of the rest.
    conflicts.forEach(function(title) {
      const serverEntry = recentServer.find(function(entry) {
        return entry.title === title;
      });
      if (serverEntry) {
        let message = {};
        if (serverEntry.type === 'saveTiddler') {
          const longTitle = serverEntry.title;
          const tiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(longTitle);
          message = {type: 'conflict', message: 'saveTiddler', tiddler: tiddler, wiki: data.wiki};
        } else if (serverEntry.type === 'deleteTiddler') {
          message = {type: 'conflict', message: 'deleteTiddler', tiddler: {fields:{title:serverEntry.title}}, wiki: data.wiki};
        }
        if (message) {
          $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
        }
      }
    })
    // There aren't any changes in the browser that aren't synced at this
    // point, so find any changes on the server that aren't in the browser and
    // send them to the browser.
    const serverTiddlerList = $tw.Bob.Wikis[data.wiki].wiki.allTitles();
    const browserChangedTitles = queue.filter(function(messageData) {
      return messageData.type === 'saveTiddler'
    }).map(function(messageData) {
      return messageData.title
    })
    const excludeFilter = $tw.Bob.Wikis[data.wiki].wiki.getTiddler('$:/plugins/OokTech/Bob/ExcludeSync')
    const excludeList = $tw.Bob.Wikis[data.wiki].wiki.filterTiddlers(excludeFilter.fields.text)
    const updateTiddlersList = serverTiddlerList.filter(function(tidTitle) {
      return (browserChangedTitles.indexOf(tidTitle) === -1 && recentServer.indexOf(tidTitle) === -1 && excludeList.indexOf(tidTitle) === -1 && $tw.Bob.Wikis[data.wiki].plugins.indexOf(tidTitle) === -1 && $tw.Bob.Wikis[data.wiki].themes.indexOf(tidTitle) === -1)
    })
    updateTiddlersList.forEach(function(tidTitle) {
      const tid = JSON.parse(JSON.stringify($tw.Bob.Wikis[data.wiki].wiki.getTiddler(tidTitle)));
      let message = {
        wiki: data.wiki,
        tiddler: tid
      };
      if (tid) {
        if (data.hashes[tidTitle] !== $tw.Bob.Shared.getTiddlerHash(tid)) {
          // Send the updated tiddler
          message.type = 'saveTiddler'
        }
      } else {
        // Tiddler has been removed on the server, so send a conflict delete
        // message
        message.type = 'conflict'
        message.message = 'deleteTiddler'
      }
      if (message.type) {
        $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
      }
    })
    // Acknowledge the message.
    sendAck(data);
  }

  /*
    This lets us restart the tiddlywiki server without having to use the command
    line.
  */
  $tw.nodeMessageHandlers.restartServer = function(data) {
    if ($tw.node) {
      console.log('Restarting Server!');
      // Close web socket server.
      $tw.wss.close(function () {
        console.log('Closed WSS');
      });
      // This bit of magic restarts whatever node process is running. In this
      // case the tiddlywiki server.
      require('child_process').spawn(process.argv.shift(), process.argv, {
        cwd: process.cwd(),
        detached: false,
        stdio: "inherit"
      });
    }
    sendAck(data);
  }

  /*
    This lets us shutdown the server from within the wiki.
  */
  $tw.nodeMessageHandlers.shutdownServer = function(data) {
    console.log('Shutting down server.');
    // TODO figure out if there are any cleanup tasks we should do here.
    // Sennd message to parent saying server is shutting down
    sendAck(data);
    process.exit();
  }

  /*
    This updates the settings.json file based on the changes that have been made
    in the browser.
    TODO update this to work with child wikis
  */
  $tw.nodeMessageHandlers.saveSettings = function(data) {
    const path = require('path');
    const fs = require('fs');
    let settings = JSON.stringify($tw.settings, "", 2);
    if (data.fromServer !== true && data.settingsString) {
      //var prefix = data.wiki;
      // Get first tiddler to start out
      settings = data.settingsString;

      // Update the $tw.settings object
      // First clear the settings
      $tw.settings = {};
      // Put the updated version in.
      $tw.updateSettings($tw.settings, JSON.parse(settings));
    }
    // Update the settings tiddler in the wiki.
    const tiddlerFields = {
      title: '$:/WikiSettings',
      text: settings,
      type: 'application/json'
    };
    // Add the tiddler
    //$tw.Bob.Wikis[data.wiki].wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
    // Push changes out to the browsers
    $tw.Bob.SendToBrowsers({type: 'saveTiddler', tiddler: {fields: tiddlerFields}, wiki: data.wiki});
    // Save the updated settings
    const userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
    const userSettingsFolder = path.join($tw.boot.wikiPath, 'settings')
    if (!fs.existsSync(userSettingsFolder)) {
      // Create the settings folder
      fs.mkdirSync(userSettingsFolder);
    }
    fs.writeFile(userSettingsPath, settings, {encoding: "utf8"}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log('Wrote settings file')
      }
    });

    $tw.CreateSettingsTiddlers(data);
    sendAck(data);
  }

  function buildSettings (tiddler, prefix) {
    let settings = {};
    if (tiddler) {
      if (tiddler.fields) {
        const object = (typeof tiddler.fields.text === 'string')?JSON.parse(tiddler.fields.text):tiddler.fields.text;
        Object.keys(object).forEach(function (field) {
          if (typeof object[field] === 'string' || typeof object[field] === 'number') {
            if (String(object[field]).startsWith('$:/WikiSettings/split')) {
              // Recurse!
              const newTiddler = $tw.Bob.Wikis[prefix].wiki.getTiddler(object[field]);
              settings[field] = buildSettings(newTiddler, prefix);
            } else {
              // Actual thingy!
              settings[field] = object[field];
            }
          } else {
            settings[field] = "";
          }
        });
      }
    }
    return settings;
  }

  /*
    This message lets you run a script defined in the settings.json file.
    You name and define the script there and then you can run it using this.

    The script must be listed in the settings. You send the script name with the
    message and then it takes the information for it from the settings file.

    settings file entries should be like this:

    "name": "somecommand argument argument"

    it would be easiest to write a script and then just call the script using
    this.

    If sequential is set to true than each script will only run after the
    previous script has finished in the order they are received.
    It is possible to run non-sequential scripts and sequential scripts
    simultaneously.
  */
  // This holds
  let scriptQueue = {};
  let scriptActive = {};
  let childproc = false;
  // This function checks if a script is currently running, if not it runs the
  // next script in the queue.
  function processScriptQueue (queue) {
    if (!scriptActive[queue] && scriptQueue[queue].length > 0) {
      childproc = require('child_process').spawn(scriptQueue[queue][0].command, scriptQueue[queue][0].args, scriptQueue[queue][0].options);
      scriptActive[queue] = true;
      childproc.on('error', function (err) {
        clearQueue(queue);
        console.log('Script error: ', err);
      })
      childproc.on('exit', function () {
        // Remove the finished task from the queue
        if (scriptQueue[queue].length > 0) {
          scriptQueue[queue].shift();
        }
        // Set the queue as inactive
        scriptActive[queue] = false;
        // Process the next task in the queue, if any.
        processScriptQueue(queue);
      });
    }
  }
  function clearQueue (queue) {
    scriptQueue[queue] = [];
    if (scriptActive[queue]) {
      childproc.kill('SIGINT');
    }
  }
  $tw.nodeMessageHandlers.runScript = function (data) {
    if (data.name) {
      if ($tw.settings.scripts) {
        if ($tw.settings.scripts[data.name]) {
          if (typeof $tw.settings.scripts[data.name] === 'string') {
            let splitThing = $tw.settings.scripts[data.name].split(" ");
            const command = splitThing.shift(),
            args = splitThing || [],
            options = {
              cwd: process.cwd(),
              detached: false,
              stdio: "inherit"
            };
            // If a command has an item that matches a property in the input
            // object than replace it with the value from the input object.
            Object.keys(data).forEach(function(item) {
              const index = args.indexOf(item);
              if (index !== -1) {
                args[index] = data[item];
              }
            });
            if (data.sequential) {
              data.queue = data.queue || 0;
              scriptActive[data.queue] = scriptActive[data.queue] || false;
              scriptQueue[data.queue] = scriptQueue[data.queue] || [];
              // Add the current script to the queue
              scriptQueue[data.queue].push({command: command, args: args, options: options, queue: data.queue});
              // Process the queue to run a command
              processScriptQueue(data.queue);
            } else {
              childproc = require('child_process').spawn(command, args, options);
              childproc.on('error', function (err) {
                console.log('Script error: ', err);
              })
            }
          }
        }
      }
    }
    sendAck(data);
  }
  // Stop any currently running script queues
  $tw.nodeMessageHandlers.stopScripts = function (data) {
    data.queue = data.queue || 0;
    clearQueue(data.queue);
    sendAck(data);
  }

  // This updates what wikis are being served and where they are being served
  $tw.nodeMessageHandlers.updateRoutes = function (data) {
    // This is only usable on the root wiki!
    if (data.wiki === 'RootWiki' || true) {
      // Then clear all the routes to the non-root wiki
      $tw.httpServer.clearRoutes();
      // The re-add all the routes from the settings
      // This reads the settings so we don't need to give it any arguments
      $tw.httpServer.addOtherRoutes();
    }
    sendAck(data);
  }

  // This builds a single file html version of the current wiki.
  // This is a modified version of the renderTiddler command.
  // It can exclude tiddlers from the wiki using a filter and it can include
  // tiddlers form any served wiki.
  /*
    buildWiki - the name of the base wiki to build
    excludeList - a filter that returns tiddlers to exclude from the resulting single file wiki.
    ignoreDefaultExclude - if this is 'true' than the default exclude list is ignored
    outputFolder - the name of the folder to save the result in
    outputName - the file name to use for the resulting html file (this should include the .html suffix)
    externalTiddlers - a json object that contains information about other tiddlers to include in the resulting html file

    About externalTiddlers:
      Each key is a the name of a wiki served by Bob, the value is a filter
      that will be run in that wiki and any returned tiddlers will be included in the output html file.
  */
  $tw.nodeMessageHandlers.buildHTMLWiki = function (data) {
    const path = require('path');
    const fs = require('fs');
    let wikiPath, fullName, excludeList = [];
    if (data.buildWiki) {
      const exists = $tw.ServerSide.loadWiki(data.buildWiki);
      if (exists) {
        wikiPath = $tw.Bob.Wikis[data.buildWiki].wikiPath || undefined;
        fullName = data.buildWiki;
      }
    } else {
      wikiPath = $tw.Bob.Wikis[data.wiki].wikiPath;
      fullName = data.wiki;
    }
    console.log('Build HTML Wiki:', fullName);
    if (data.excludeList) {
      // Get the excludeList from the provided filter, if it exists
      excludeList = $tw.Bob.Wikis[fullName].wiki.filterTiddlers(data.excludeList);
    } else {
      // Otherwise we want to ignore the server-specific plugins to keep things
      // small.
      excludeList = ['$:/plugins/OokTech/Bob', '$:/plugins/tiddlywiki/filesystem', '$:/plugins/tiddlywiki/tiddlyweb'];
    }
    if (data.ignoreDefaultExclude !== 'true') {
      const defaultExclude = $tw.Bob.Wikis[fullName].wiki.filterTiddlers('[prefix[$:/plugins/OokTech/Bob/]][[$:/plugins/OokTech/Bob]][prefix[$:/WikiSettings]][prefix[$:/Bob/]][[$:/ServerIP]][[$:/plugins/tiddlywiki/filesystem]][[$:/plugins/tiddlywiki/tiddlyweb]]');
      excludeList = excludeList.concat(defaultExclude);
    }
    if (wikiPath) {
      const outputFolder = data.outputFolder || 'output';
      const outputName = data.outputName || 'index.html';
      const outputFile = path.resolve(wikiPath, outputFolder, outputName);
      $tw.utils.createFileDirectories(outputFile);
      let tempWiki = new $tw.Wiki();
      /*
      var wikiTiddlers = $tw.Bob.Wikis[fullName].tiddlers.concat($tw.Bob.Wikis[fullName].plugins.concat($tw.Bob.Wikis[fullName].themes)).filter(function(tidInfo) {
        return (excludeList.indexOf(tidInfo) === -1)
      })
      */
      $tw.Bob.Wikis[fullName].wiki.allTitles().forEach(function(title) {
        if (excludeList.indexOf(title) === -1) {
          tempWiki.addTiddler($tw.Bob.Wikis[fullName].wiki.getTiddler(title));
        }
      })
      // If there are external tiddlers to add try and add them
      GatherTiddlers (tempWiki, data.externalTiddlers, data.transformFilters, data.transformFilter, data.decoded)
      // Prepare the wiki
      tempWiki.registerPluginTiddlers("plugin",["$:/core"]);
      // Unpack plugin tiddlers
  	  tempWiki.readPluginInfo();
      tempWiki.unpackPluginTiddlers();
      const text = tempWiki.renderTiddler('text/plain',"$:/core/save/all", {variables:{wikiTiddlers:$tw.utils.stringifyList(tempWiki.allTitles())}});
      fs.writeFile(outputFile,text,"utf8",function(err) {
        if (err) {
            console.log(err);
          } else {
            console.log('Built Wiki: ', outputFile);
          }
      });
    } else {
      console.log("Can't find wiki ", fullName, ", is it listed in the Bob settings tab?");
    }
    sendAck(data);
  }

  /*
    This lets you create a new wiki from existing tiddlers in other wikis.
    Tiddlers from each wiki are selected by filters

    inputs:

    tiddlers - an array of tiddlers in json format
    wikiFolder - The name of the folder that holds your wikis
    wikiName - The name of the wiki to create or add to
    wikisPath - the path to the folder that holds the wikiFolder
    overwrite - if a wikiName is given and a wiki with that name already exists
    than the tiddlers will be added to that wiki instead of making a new wiki.

    externalTiddlers - a json object that has filters to import tiddlers from
    existing wikis.

    If overwrite is not set to 'yes' than wiki names are made unique. If you
    already have a wiki called MyWiki and give MyWiki as the wikiName parameter
    than a number will be appended to the end of the name to make it unique,
    similarly to how new tiddler titles are made unique.
  */
  $tw.nodeMessageHandlers.newWikiFromTiddlers = function (data) {
    // send ack first because otherwise it often takes too long to run this
    // command and the message is sent again.
    sendAck(data);
    // Do nothing unless there is an input file path given
    if (data.tiddlers || data.externalTiddlers) {
      const path = require('path');
      const fs = require('fs')
      let wikiName, wikiTiddlersPath, basePath;
      const wikiFolder = data.wikiFolder || "Wikis";
      // If there is no wikiname given create one
      if (data.wikiName) {
        if (data.overwrite !== 'yes') {
          // If a name is given use it
          wikiName = GetWikiName(data.wikiName);
        } else {
          wikiName = data.wikiName;
        }
      } else {
        // Otherwise create a new wikiname
        wikiName = GetWikiName();
      }
      // If there is no output path given use a default one
      if (data.wikisPath) {
        basePath = data.wikisPath;
      } else {
        basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
        if ($tw.settings.wikiPathBase === 'homedir') {
          basePath = os.homedir();
        } else if ($tw.settings.wikiPathBase === 'cwd' || !$tw.settings.wikiPathBase) {
          basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
        } else {
          basePath = path.resolve($tw.settings.wikiPathBase);
        }
      }

      // even if overwrite is set to true we need to make sure the wiki already
      // exists
      let exists = false;
      const wikiPath = path.join(basePath, wikiFolder, wikiName)
      if (data.overwrite === 'true') {
        exists = $tw.ServerSide.loadWiki(wikiName)
      }

      // If we aren't overwriting or it doesn't already exist than make the new
      // wiki and load it
      if (!(typeof exists === 'string') || data.overwrite !== 'true') {
        // First copy the empty edition to the wikiPath to make the
        // tiddlywiki.info
        const params = {
          "wiki": data.wiki,
          "basePath": basePath,
          "wikisFolder": wikiFolder,
          "edition": "empty",
          "path": wikiName,
          "wikiName": wikiName,
          "decoded": data.decoded,
          "fromServer": true
        };
        $tw.nodeMessageHandlers.createNewWiki(params);
        // Get the folder for the wiki tiddlers
        wikiTiddlersPath = path.join(basePath, wikiFolder, wikiName, 'tiddlers');
        // Make sure tiddlers folder exists
        try {
          fs.mkdirSync(wikiTiddlersPath);
          console.log('Created Tiddlers Folder ', wikiTiddlersPath);
        } catch (e) {
          console.log('Tiddlers Folder Exists:', wikiTiddlersPath);
        }
        // Load the empty wiki
        $tw.ServerSide.loadWiki(wikiName)
      }
      // Add all the received tiddlers to the loaded wiki
      let count = 0;
      $tw.utils.each(data.tiddlers,function(tiddler) {
        // Save each tiddler using the syncadaptor
        // We don't save the components that are part of the empty edition
        // because we start with that
        if (tiddler.title !== '$:/core' && tiddler.title !== '$:/themes/tiddlywiki/snowwhite' && tiddler.title !== '$:/themes/tiddlywiki/vanilla') {
          $tw.syncadaptor.saveTiddler({fields: tiddler}, wikiName);
        }
        count++;
      });
      // If there are external tiddlers to add try and add them
      let tempWiki = new $tw.Wiki();
      GatherTiddlers(tempWiki, data.externalTiddlers, data.transformFilters, data.transformFilter, data.decoded);
      tempWiki.allTitles().forEach(function(tidTitle) {
        $tw.syncadaptor.saveTiddler(tempWiki.getTiddler(tidTitle), wikiName);
        count++;
      })
      if(!count) {
        console.log("No tiddlers found in the input file");
      } else {
        console.log("Wiki created")
      }
    } else {
      console.log('No tiddlers given!');
    }
  }

  /*
    This takes an externalTiddlers object that lists wikis and filters that
    define the tiddlers to get from that wiki

    inputs:

    wiki - the $tw.Wiki object to add the tiddlers to
    externalTiddlers - a json object that lists the wikis and filters
    token - the access token, if any
  */
  function GatherTiddlers (wiki, externalTiddlers, transformFilters, transformFilter, decodedToken) {
    if (externalTiddlers) {
      try {
        let externalData = externalTiddlers
        if (typeof externalTiddlers !== 'object') {
          externalData = JSON.parse(externalTiddlers);
        }
        transformFilters = transformFilters || '{}'
        if (typeof transformFilters !== 'object') {
          transformFilters = JSON.parse(transformFilters);
        }
        Object.keys(externalData).forEach(function(wikiTitle) {
          const allowed = $tw.Bob.AccessCheck(wikiTitle, {"decoded": decodedToken}, 'view');
          if (allowed) {
            const exists = $tw.ServerSide.loadWiki(wikiTitle);
            if (exists) {
              const includeList = $tw.Bob.Wikis[wikiTitle].wiki.filterTiddlers(externalData[wikiTitle]);
              includeList.forEach(function(tiddlerTitle) {
                let tiddler = $tw.Bob.Wikis[wikiTitle].wiki.getTiddler(tiddlerTitle)
                // Transform the tiddler title if a transfom filter is given
                let txformFilter = transformFilter
                if (transformFilters) {
                  txformFilter = transformFilters[wikiTitle] || transformFilter;
                }
                if (txformFilter) {
                  const transformedTitle = ($tw.Bob.Wikis[wikiTitle].wiki.filterTiddlers(txformFilter, null, $tw.Bob.Wikis[wikiTitle].wiki.makeTiddlerIterator([tiddlerTitle])) || [""])[0];
                  if(transformedTitle) {
                    tiddler = new $tw.Tiddler(tiddler,{title: transformedTitle});
                  }
                }
                wiki.addTiddler(tiddler);
              })
            }
          }
        });
      } catch (e) {
        console.log("Couldn't parse externalTiddlers input:", e);
      }
    }
    return wiki;
  }

  /*
    This ensures that the wikiName used is unique by appending a number to the
    end of the name and incrementing the number if needed until an unused name
    is created.
    If on name is given it defualts to NewWiki
  */
  function GetWikiName (wikiName, count, wikiObj, fullName) {
    let updatedName;
    count = count || 0;
    wikiName = wikiName || ''
    if(wikiName.trim() === '') {
      wikiName = 'NewWiki'
    }
    fullName = fullName || wikiName || 'NewWiki';
    wikiObj = wikiObj || $tw.settings.wikis;
    const nameParts = wikiName.split('/');
    if(nameParts.length === 1) {
      updatedName = nameParts[0];
      if(wikiObj[updatedName]) {
        if(wikiObj[updatedName].__path) {
          count = count + 1;
          while (wikiObj[updatedName + String(count)]) {
            if(wikiObj[updatedName + String(count)].__path) {
              count = count + 1;
            } else {
              break;
            }
          }
        }
      }
      if(count > 0) {
        return fullName + String(count);
      } else {
        return fullName;
      }
    } else if(!wikiObj[nameParts[0]]) {
      if (count > 0) {
        return fullName + String(count);
      } else {
        return fullName;
      }
    }
    if(nameParts.length > 1) {
      if(wikiObj[nameParts[0]]) {
        return GetWikiName(nameParts.slice(1).join('/'), count, wikiObj[nameParts[0]], fullName);
      } else {
        return fullName;
      }
    } else {
      return undefined
    }
  }

  // This is just a copy of the init command modified to work in this context
  $tw.nodeMessageHandlers.createNewWiki = function (data) {
    if (data.wiki === 'RootWiki' || true) {
      const fs = require("fs"),
        path = require("path");

      function specialCopy (source, destination) {
        fs.mkdirSync(destination, {recursive: true});
        const currentDir = fs.readdirSync(source)
        currentDir.forEach(function (item) {
          if (fs.statSync(path.join(source, item)).isFile()) {
            const fd = fs.readFileSync(path.join(source, item), {encoding: 'utf8'});
            fs.writeFileSync(path.join(destination, item), fd, {encoding: 'utf8'});
          } else {
            //Recurse!! Because it is a folder.
            // But make sure it is a directory first.
            if (fs.statSync(path.join(source, item)).isDirectory()) {
              specialCopy(path.join(source, item), path.join(destination, item));
            }
          }
        });
      }

      // Paths are relative to the root wiki path
      if (process.pkg) {
        // This is for handling when it is a single executable
        // Base path is where the executable is by default
        data.basePath = data.basePath || path.dirname(process.argv[0]);
        data.wikisFolder = data.wikisFolder || 'Wikis';
      }
      data.wikisFolder = data.wikisFolder || '';
      // If no basepath is given than the default is to make the folder a
      // sibling of the index wiki folder
      let rootPath = process.pkg?path.dirname(process.argv[0]):process.cwd();
      if ($tw.settings.wikiPathBase === 'homedir') {
        rootPath = os.homedir();
      } else if ($tw.settings.wikiPathBase === 'cwd' || !$tw.settings.wikiPathBase) {
        rootPath = process.pkg?path.dirname(process.argv[0]):process.cwd();
      } else {
        rootPath = path.resolve($tw.settings.wikiPathBase);
      }
      const basePath = data.basePath || path.resolve(rootPath, $tw.settings.wikisPath);
      // This is the path given by the person making the wiki, it needs to be
      // relative to the basePath
      // data.wikisFolder is an optional sub-folder to use. If it is set to
      // Wikis than wikis created will be in the basepath/Wikis/relativePath
      // folder
      // I need better names here.
      $tw.utils.createDirectory(path.join(basePath, data.wikisFolder));

      /*
      // Get desired name for the new wiki
      let name = data.wikiName || 'NewWiki';
      if (name.trim() === '') {
        name = 'NewWiki'
      }
      */

      // Make sure we have a unique name by appending a number to the wiki name
      // if it exists.
      let name = GetWikiName(data.wikiName)
      let relativePath = name;
      // This only does something for the secure wiki server
      if ($tw.settings.namespacedWikis === 'true') {
        data.decoded = data.decoded || {};
        data.decoded.name = data.decoded.name || 'imaginaryPerson';
        name = data.decoded.name + '/' + name;
        name = GetWikiName(name);
        relativePath = name;
        //relativePath = path.join(data.decoded.name, name);
        //name = path.join(data.decoded.name, name);
        $tw.utils.createDirectory(path.join(basePath, data.decoded.name));
      }
      const fullPath = path.join(basePath, data.wikisFolder, relativePath)
      //var tiddlersPath = path.join(fullPath, 'tiddlers')
      // For now we only support creating wikis with one edition, multi edition
      // things like in the normal init command can come later.
      const editionName = data.edition?data.edition:"empty";
      const searchPaths = $tw.getLibraryItemSearchPaths($tw.config.editionsPath,$tw.config.editionsEnvVar);
      if (process.pkg) {
        let editionPath = $tw.findLibraryItem(editionName,searchPaths);
        if(!$tw.utils.isDirectory(editionPath)) {
          editionPath = undefined
          const pluginPath = process.pkg.path.resolve("./editions","./" + editionName)
          if(true || fs.existsSync(pluginPath) && fs.statSync(pluginPath).isDirectory()) {
            editionPath = pluginPath;
          }
          if (editionPath) {
            try {
              specialCopy(editionPath, fullPath);
              console.log("Copied edition '" + editionName + "' to " + fullPath + "\n");
            } catch (e) {
              console.log('error copying edition', e);
            }
          } else {
            console.log("Edition not found");
          }
        } else if ($tw.utils.isDirectory(editionPath)) {
          // Copy the edition content
          const err = $tw.utils.copyDirectory(editionPath,fullPath);
          if(!err) {
            console.log("Copied edition '" + editionName + "' to " + fullPath + "\n");
          } else {
            console.log(err);
          }
        }
      } else {
        // Check the edition exists
        const editionPath = $tw.findLibraryItem(editionName,searchPaths);
        if(!$tw.utils.isDirectory(editionPath)) {
          console.log("Edition '" + editionName + "' not found");
        }
        // Copy the edition content
        const err = $tw.utils.copyDirectory(editionPath,fullPath);
        if(!err) {
          console.log("Copied edition '" + editionName + "' to " + fullPath + "\n");
        } else {
          console.log(err);
        }
      }
      // Tweak the tiddlywiki.info to remove any included wikis
      const packagePath = path.join(fullPath, "tiddlywiki.info");
      let packageJson = {};
      try {
        packageJson = JSON.parse(fs.readFileSync(packagePath));
      } catch (e) {
        console.log('failed to load tiddlywiki.info file', e);
      }
      delete packageJson.includeWikis;
      try {
        fs.writeFileSync(packagePath,JSON.stringify(packageJson,null,$tw.config.preferences.jsonSpaces));
      } catch (e) {
        console.log('failed to write settings', e)
      }

      // Use relative paths here.
      // Note this that is dependent on process.cwd()!!
      function listWiki(wikiName, currentLevel, wikiPath) {
        const nameParts = wikiName.split(path.sep);
        if (typeof currentLevel[nameParts[0]] === 'object' && nameParts.length > 1) {
          listWiki(nameParts.slice(1).join(path.sep), currentLevel[nameParts[0]], wikiPath);
        } else if (typeof currentLevel[nameParts[0]] === 'undefined' && nameParts.length > 1) {
          currentLevel[nameParts[0]] = {};
          listWiki(nameParts.slice(1).join(path.sep), currentLevel[nameParts[0]], wikiPath);
        } else if (nameParts.length === 1) {
          // For now assume that they mean what they say and overwrite anything
          // here if it exists.
          // List the wiki in the appropriate place
          currentLevel[nameParts[0]] = {'__path': wikiPath};
        }
      }
      listWiki(relativePath, $tw.settings.wikis, relativePath)

      // This is here as a hook for an external server. It is defined by the
      // external server and shouldn't be defined here or it will break
      // If you are not using an external server than this does nothing
      if ($tw.ExternalServer) {
        if (typeof $tw.ExternalServer.initialiseWikiSettings === 'function') {
          $tw.ExternalServer.initialiseWikiSettings(relativePath, data);
        }
      }

      // Update the settings
      setTimeout(function() {
        data.saveSettings = true;
        $tw.nodeMessageHandlers.findAvailableWikis(data);
      }, 1000);
      // Then clear all the routes to the non-root wiki
      $tw.httpServer.clearRoutes();
      // The re-add all the routes from the settings
      // This reads the settings so we don't need to give it any arguments
      $tw.httpServer.addOtherRoutes();
    }
    sendAck(data);
  }

  /*
    This unloads a wiki from memory.
    This can be used to reduce the memory footprint and to fully reload a wiki.

    It needs to remove everything under $tw.Bob.Wikis[data.wikiName] for the
    wiki. And it also need to find all of the tiddlers for the wiki and remove
    them. But I don't know how to do that without deleting the tiddlers.
  */
  $tw.nodeMessageHandlers.unloadWiki = function (data) {
    // make sure that there is a wiki name given.
    if (data.wikiName) {
      console.log('Unload wiki ', data.wikiName)
      // Make sure that the wiki is loaded
      if ($tw.Bob.Wikis[data.wikiName]) {
        if ($tw.Bob.Wikis[data.wikiName].State === 'loaded') {
          // If so than unload the wiki
          // This removes the information about the wiki and the wiki object
          delete $tw.Bob.Wikis[data.wikiName];
          // This removes all the info about the files for the wiki
          delete $tw.Bob.Files[data.wikiName];
        }
      }
      $tw.Bob.DisconnectWiki(data.wikiName);
    }
    sendAck(data);
  }

  /*
    This message fetches tiddlers from another wiki on the same Bob server
    The input data object has:
      fromWiki - the name of the wiki to pull from
      filter - the tiddler filter to use to select tiddlers from the remote
        wiki
      transformFilter - the titles of imported tiddlers are modified by this
        filter.
      resolution - how conflicts are handled
        - manual - all tiddlers are saved in a temporary place and have to be
          manually accepted or rejected
        - conflct - only tiddlers that conflict with existing tiddlers are
          saved in a temporary place to be accepted or rejected.
        - force - all imported tiddlers are saved regardelss of conflicts
  */
  $tw.nodeMessageHandlers.internalFetch = function(data) {
    // Make sure that the person has access to the wiki
    const authorised = $tw.Bob.AccessCheck(data.fromWiki, {"decoded":data.decoded}, 'view');
    if (authorised) {
      let externalTiddlers = {};
      if (data.externalTiddlers) {
        try {
          externalTiddlers = JSON.parse(data.externalTiddlers);
        } catch (e) {
          console.log("Can't parse externalTiddlers");
        }
      }
      externalTiddlers[data.fromWiki] = data.filter
      let tempWiki = new $tw.Wiki();
      GatherTiddlers(tempWiki, externalTiddlers, data.transformFilters, data.transformFilter, data.decoded);

      // Add the results to the current wiki
      // Each tiddler gets added to the requesting wiki
      let list = []
      let message
      tempWiki.allTitles().forEach(function(tidTitle){
        // Get the current tiddler
        const tiddler = tempWiki.getTiddler(tidTitle);
        list.push(tiddler.fields.title)
        // Create the message with the appropriate conflict resolution
        // method and send it
        if (data.resolution === 'conflict') {
          message = {type: 'conflict', message: 'saveTiddler', tiddler: tiddler, wiki: data.wiki};
        } else if (data.resolution === 'force') {
          message = {type: 'saveTiddler', tiddler: tiddler, wiki: data.wiki};
        } else {
          message = {type: 'import', tiddler: tiddler, wiki: data.wiki};
        }
        $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
      })
      // Make the import list and send that tiddler too
      const importListTiddler = {
        fields: {
          title: '$:/status/Bob/importlist',
          tags: [],
          list: list
        }
      }
      message = {type: 'saveTiddler', tiddler: importListTiddler, wiki: data.wiki}
      $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
    }
    sendAck(data);
  }

  /*
    This saves a plugin tiddler and splits it into separate .tid files and
    saves them into the appropriate folder

    But first it checks the plugin version to make sure that it is newer than
    the existing one
  */
  $tw.nodeMessageHandlers.savePluginFolder = function(data) {
    if (data.plugin) {
      const fs = require('fs')
      const path = require('path')
      const pluginTiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(data.plugin)
      if (pluginTiddler) {
        const pluginName = data.plugin.replace(/^\$:\/plugins\//, '')
        let basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
        if ($tw.settings.wikiPathBase === 'homedir') {
          basePath = os.homedir();
        } else if ($tw.settings.wikiPathBase === 'cwd' || !$tw.settings.wikiPathBase) {
          basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
        } else {
          basePath = path.resolve($tw.settings.wikiPathBase);
        }
        const pluginFolderPath = path.resolve(basePath, $tw.settings.pluginsPath, pluginName)
        const pluginInfoPath = path.join(pluginFolderPath, 'plugin.info')
        let isNewVersion = true
        let oldVersion = {}
        let newVersion = {}
        // Check if the plugin folder exists
        if (fs.existsSync(pluginInfoPath)) {
          // If it does exist than check versions, only save new or equal
          // versions
          // Load the plugin.info file and check the version
          let oldInfo
          try {
            oldInfo = JSON.parse(fs.readFileSync(pluginInfoPath, 'utf8'))
          } catch (e) {
            //Something
            console.log(e)
          }
          if (oldInfo) {
            // Check the version here
            oldVersion = $tw.utils.parseVersion(oldInfo.version)
            newVersion = $tw.utils.parseVersion(pluginTiddler.fields.version)
            if (oldVersion.major > newVersion.major) {
              isNewVersion = false
            } else if (oldVersion.minor > newVersion.minor) {
              isNewVersion = false
            } else if (oldVersion.patch > newVersion.patch) {
              isNewVersion = false
            }
          }
        } else {
          // We don't have any version of the plugin yet
          let error = $tw.utils.createDirectory(pluginFolderPath);
          if (error) {
            console.log(error)
          }
        }
        if (isNewVersion) {
          // Save the plugin tiddlers
          Object.keys(JSON.parse(pluginTiddler.fields.text).tiddlers).forEach(function(title) {
            const content = $tw.Bob.Wikis[data.wiki].wiki.renderTiddler("text/plain", "$:/core/templates/tid-tiddler", {variables: {currentTiddler: title}});
            const fileExtension = '.tid'
            const filepath = path.join(pluginFolderPath, $tw.syncadaptor.generateTiddlerBaseFilepath(title, data.wiki) + fileExtension);
            // If we aren't passed a path
            fs.writeFile(filepath,content,{encoding: "utf8"},function (err) {
              if(err) {
                console.log(err);
              } else {
                console.log('saved file', filepath)
              }
            });
          })
          // Make the plugin.info file
          let pluginInfo = {}
          Object.keys(pluginTiddler.fields).forEach(function(field) {
            if (field !== 'text' && field !== 'tags' && field !== 'type') {
              pluginInfo[field] = pluginTiddler.fields[field]
            }
          })
          fs.writeFile(pluginInfoPath,JSON.stringify(pluginInfo, null, 2),{encoding: "utf8"},function (err) {
            if(err) {
              console.log(err);
            } else {
              console.log('saved file', pluginInfoPath)
            }
          });
        } else {
          console.log("Didn't save plugin", pluginName, "with version", newVersion.version,"it is already saved with version", oldVersion.version)
        }
      }
    }
    sendAck(data);
  }

  /*
    This sends a list of all available plugins to the wiki
  */
  $tw.nodeMessageHandlers.getPluginList = function (data) {
    const pluginNames = $tw.utils.getPluginInfo();
    const fields = {
      title: '$:/Bob/AvailablePluginList',
      list: $tw.utils.stringifyList(Object.keys(pluginNames))
    }
    const tiddler = {fields: fields}
    const message = {type: 'saveTiddler', tiddler: tiddler, wiki: data.wiki}
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
    sendAck(data);
  }

  /*
    This sends a list of all available plugins to the wiki
  */
  $tw.nodeMessageHandlers.getThemeList = function (data) {
    const themeNames = $tw.utils.getThemeInfo();
    const fields = {
      title: '$:/Bob/AvailableThemeList',
      list: $tw.utils.stringifyList(Object.keys(themeNames))
    }
    const tiddler = {fields: fields}
    const message = {type: 'saveTiddler', tiddler: tiddler, wiki: data.wiki}
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
    sendAck(data);
  }

  /*
    This sends back a list of all wikis that are viewable using the current access token.
  */
  $tw.nodeMessageHandlers.getViewableWikiList = function (data) {
    function getList(obj, prefix) {
      let output = []
      Object.keys(obj).forEach(function(item) {
        if (typeof obj[item] === 'string') {
          if($tw.ServerSide.existsListed(prefix+item)) {
            if(item == '__path') {
              if(prefix.endsWith('/')) {
                output.push(prefix.slice(0,-1));
              } else {
                output.push(prefix);
              }
            } else {
              output.push(prefix+item);
            }
          }
        } else if (typeof obj[item] === 'object') {
          output = output.concat(getList(obj[item], prefix + item + '/'));
        }
      })
      return output
    }
    // Get the wiki list of wiki names from the settings object
    const wikiList = getList($tw.settings.wikis, '')
    const viewableWikis = []
    wikiList.forEach(function(wikiName) {
      if ($tw.Bob.AccessCheck(wikiName, {"decoded": data.decoded}, 'view')) {
        viewableWikis.push(wikiName)
      }
    })
    // Send viewableWikis back to the browser
    const message = {type: 'setViewableWikis', list: $tw.utils.stringifyList(viewableWikis), wiki: data.wiki}
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
    sendAck(data);
  }

  /*
    This loads the tiddlywiki.info and if new versions are given it updates the
    description, list of plugins, themes and languages
  */
  $tw.nodeMessageHandlers.updateTiddlyWikiInfo = function (data) {
    if (data.wiki) {
      const path = require('path')
      const fs = require('fs')
      const wikiInfoPath = path.join($tw.Bob.Wikis[data.wiki].wikiPath, 'tiddlywiki.info');
      let wikiInfo = {}
      try {
        wikiInfo = JSON.parse(fs.readFileSync(wikiInfoPath,"utf8"));
      } catch(e) {
        console.log(e)
      }
      if (data.description || data.description === "") {
        wikiInfo.description = data.description;
      }
      if (data.pluginList || data.pluginList === "") {
        wikiInfo.plugins = $tw.utils.parseStringArray(data.pluginList);
      }
      if (data.themeList || data.themeList === "") {
        wikiInfo.themes = $tw.utils.parseStringArray(data.themeList);
      }
      if (data.languageList || data.languageList === "") {
        wikiInfo.languages = $tw.utils.parseStringArray(data.languageList);
      }
      try {
        fs.writeFileSync(wikiInfoPath, JSON.stringify(wikiInfo, null, 4))
      } catch (e) {
        console.log(e)
      }
    }
    sendAck(data);
  }

  /*
    This downloads the single html file version of a wiki
    It defaults to the current wiki but if you give a forWiki input it
    downloads that wiki instead.
  */
  $tw.nodeMessageHandlers.downloadHTMLFile = function (data) {
    if (data.wiki) {
      const downloadWiki = data.forWiki || data.wiki;
      const allowed = $tw.Bob.AccessCheck(downloadWiki, {"decoded":data.decoded}, 'view');
      if (allowed) {
        const path = require('path');
        const fs = require('fs');
        try {
          const outputFilePath = path.join($tw.Bob.Wikis[data.wiki].wikiPath, 'output', 'index.html');
          const file = fs.readFileSync(outputFilePath);
          // Send file to browser in a websocket message
          const message = {'type': 'downloadFile', 'file': file};
          $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
        } catch (e) {
          console.log('Error:', e)
        }
      }
    }
    sendAck(data);
  }

  /*
    This sets up the logged in status of a wiki

    It needs to:

    - start the heartbeat process
    - populate the list of viewable wikis
    - add any configuration interface things
  */
  $tw.nodeMessageHandlers.setLoggedIn = function (data) {
    // Heartbeat. This can be done if the heartbeat is started or not because
    // if an extra heartbeat pong is heard it just shifts the timing.
    let message = {};
    message.type = 'pong';
    if (data.heartbeat) {
      message.heartbeat = true;
    }
    // When the server receives a ping it sends back a pong.
    const response = JSON.stringify(message);
    $tw.connections[data.source_connection].socket.send(response);

    // Populating the wiki list uses the same stuff as the other message.
    $tw.nodeMessageHandlers.getViewableWikiList(data);

    // Add configuration stuff
    $tw.nodeMessageHandlers.setConfigurationInterface(data);

    sendAck(data);
  }

  /*
    This uses the token to determine which configuration options should be
    visible on the wiki and sends the appropriate tiddlers
  */
  $tw.nodeMessageHandlers.setConfigurationInterface = function (data) {
    // I need to figure out what to put here
    const fields = {
      title: '$:/Bob/VisibleConfigurationTabs',
      list: "hi"
    }
    const tiddler = {fields: fields}
    const message = {type: 'saveTiddler', tiddler: tiddler, wiki: data.wiki}
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)

    $tw.CreateSettingsTiddlers(data);

    sendAck(data);
  }

  /*
    This looks in the wikis folder set in the configuration
    $tw.setting.wikisPath
    If none is set it uses ./Wikis

    This walks though subfolders too.
  */
  $tw.nodeMessageHandlers.findAvailableWikis = function (data) {
    // This gets the paths of all wikis listed in the settings
    function getWikiPaths(settingsObject) {
      const paths = Object.values(settingsObject);
      let outPaths = [];
      paths.forEach(function(thisPath) {
        if (typeof thisPath === 'object') {
          outPaths = outPaths.concat(getWikiPaths(thisPath));
        } else {
          outPaths.push(path.resolve(basePath, $tw.settings.wikisPath, thisPath));
        }
      })
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
          if (fs.statSync(fullName).isDirectory()) {
            if ($tw.ServerSide.wikiExists(fullName)) {
              realFolders.push(fullName);
            }
            // Check if there are subfolders that contain wikis and recurse
            const nextPath = path.join(startPath,item)
            if (fs.statSync(nextPath).isDirectory()) {
              realFolders = realFolders.concat(getRealPaths(nextPath));
            }
          }
        })
      } catch (e) {
        console.log('Error getting wiki paths', e);
      }
      return realFolders;
    }
    // This takes the list of wikis in the settings and returns a new object
    // without any of the non-existent wikis listed
    function pruneWikiList(dontExistList, settingsObj) {
      let prunedSettings = {};
      Object.keys(settingsObj).forEach(function(wikiName) {
        if (typeof settingsObj[wikiName] === 'string') {
          // Check if the wikiName resolves to one of the things to remove
          if (dontExistList.indexOf(path.resolve(wikiFolderPath, settingsObj[wikiName])) === -1) {
            // If the wiki isn't listed as not existing add it to the prunedSettings
            prunedSettings[wikiName] = settingsObj[wikiName];
          }
        } else if (typeof settingsObj[wikiName] === 'object') {
          prunedSettings[wikiName] = pruneWikiList(dontExistList, settingsObj[wikiName])
        }
      })
      return prunedSettings
    }
    const fs = require('fs');
    const path = require('path');
    let basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
    if ($tw.settings.wikiPathBase === 'homedir') {
      basePath = os.homedir();
    } else if ($tw.settings.wikiPathBase === 'cwd' || !$tw.settings.wikiPathBase) {
      basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
    } else {
      basePath = path.resolve($tw.settings.wikiPathBase);
    }
    $tw.settings.wikisPath = $tw.settings.wikisPath || './Wikis';
    let wikiFolderPath = path.resolve(basePath, $tw.settings.wikisPath);
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
    if (typeof data.update !== 'string') {
      data.update = '';
    }
    if (data.update.toLowerCase() === 'true') {
      wikisToAdd.forEach(function (wikiName) {
        const nameParts = wikiName.split('/');
        let settingsObj = $tw.settings.wikis;
        let i;
        for (i = 0; i < nameParts.length; i++) {
          if (typeof settingsObj[nameParts[i]] === 'object') {
            settingsObj = settingsObj[nameParts[i]];
          } else if (i < nameParts.length - 1) {
            settingsObj[nameParts[i]] = {};
            settingsObj = settingsObj[nameParts[i]]
          } else {
            settingsObj[nameParts[i]] = nameParts.join('/');
          }
        }
      })
    }
    data.remove = data.remove || ''
    if (typeof data.remove !== 'string') {
      data.remove = '';
    }
    if (data.remove.toLowerCase() === 'true') {
      // update the wikis listing in the settings with a version that doesn't
      // have the wikis that don't exist.
      $tw.settings.wikis = pruneWikiList(dontExist, $tw.settings.wikis);
    }
    // Save the new settings, update routes, update settings tiddlers in the
    // browser and update the list of available wikis
    if (data.saveSettings) {
      data.fromServer = true;
      $tw.nodeMessageHandlers.saveSettings(data);
      $tw.nodeMessageHandlers.updateRoutes(data);
      setTimeout($tw.nodeMessageHandlers.getViewableWikiList,1000,data)
    }

    sendAck(data);
  }

  /*
    This only really matters in the secure wiki server for now
    public - true or false to set the wiki as public or not
    viewers - the list of people who can view the wiki
    editors - the list of people who can edit the wiki
  */
  $tw.nodeMessageHandlers.setWikiPermissions = function(data) {
    // If the person doing this is owner of the wiki they can continue
    if ($tw.ExternalServer) {
      $tw.ExternalServer.updatePermissions(data);
    }
  }

  $tw.nodeMessageHandlers.getGitPlugin = function(data) {
    sendAck(data)
    if(data.url) {
      // Special handling for github, we will see about other things later.
      if(!data.url.toLowerCase().endsWith('.zip')) {
        if(data.url.toLowerCase().startsWith('https://github.com')) {
          data.url = data.url + '/archive/master.zip';
        } else if (data.url.toLowerCase().startsWith('https://gitlab.com')) {
          const repoName = data.url.toLowerCase().split('/').pop()
          data.url = data.url + '/-/archive/master/' + repoName + '-master.zip'
        }
      }
      const path = require('path');
      const fs = require('fs')
      const protocol = data.url.startsWith('https')?'https':'http';
      const JSZip = require("$:/plugins/OokTech/Bob/External/jszip/jszip.js");
      const http = require("$:/plugins/OokTech/Bob/External/followRedirects/followRedirects.js")[protocol];
      var req = http.get(data.url, function (res) {
        if (res.statusCode !== 200) {
          console.log(res.statusCode);
          // handle error
          return;
        }
        var data = [], dataLen = 0;
        res.on("data", function (chunk) {
          data.push(chunk);
          dataLen += chunk.length;
        });
        res.on("end", function () {
          var buf = Buffer.concat(data);
          // here we go !
          let zipObj;
          let rootFolder;
          JSZip.loadAsync(buf).then(function (zip) {
            zipObj = zip;
            const pluginInfo = zip.filter(function(relativePath,file) {
              const goodFolder = relativePath.split('/').length === 2;
              const correctName = relativePath.endsWith('plugin.info');
              return goodFolder && correctName;
            })[0]
            rootFolder = pluginInfo.name.split('/')[0];
            return pluginInfo.async('string');
          }).then(function(info) {
            const infoObj = JSON.parse(info.trim());
            // Check if we have the plugin already, if so check if this version
            // is newer than our local version. If not skip it.
            const pluginName = infoObj.title.replace('$:/plugins/','');
            const pluginNames = Object.keys($tw.utils.getPluginInfo());
            let exists = false;
            let newer = false;
            if(pluginNames.indexOf(pluginName) !== 0) {
              // Check versions
              exists = true;
            }
            let basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
            if($tw.settings.wikiPathBase === 'homedir') {
              basePath = os.homedir();
            } else if($tw.settings.wikiPathBase === 'cwd' || !$tw.settings.wikiPathBase) {
              basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
            } else {
              basePath = path.resolve($tw.settings.wikiPathBase);
            }
            const pluginsPath = path.resolve(basePath, $tw.settings.pluginsPath);
            // If we don't have the plugin than create the plugin folder, also
            // creating the author folder if we don't have it already.
            if(!exists) {
              // Make plugin folder
              $tw.utils.createDirectory(path.join(pluginsPath,pluginName));
            }
            if(!(exists && newer)) {
              // Then walk though the zip file and add all files and folders in
              // the zip file to our local folder.
              zipObj.folder(rootFolder).forEach(function(relativePath, file) {
                // Check if folder exists, if not create it.
                // This is for every file because I am not sure order is
                // gaurenteed so you may not get the folder before you get
                // files in the folder.
                if(!fs.existsSync(path.join(pluginsPath, pluginName, relativePath.split('/').slice(0,-1).join('/')))) {
                  // Make a folder
                  $tw.utils.createDirectory(path.join(pluginsPath, pluginName, relativePath.split('/').slice(0,-1).join('/')));
                }
                if(!file.dir) {
                  // save the file in the correct folder
                  file.nodeStream()
                  .pipe(fs.createWriteStream(path.join(pluginsPath,pluginName,relativePath)))
                  .on('finish', function() {
                    console.log('wrote file: ', path.join(pluginsPath,pluginName,relativePath));
                  })
                }
              });
            }
          }).catch(function(err) {
            console.log(err);
          });
        });
      });

      req.on("error", function(err){
        // handle error
        console.log('Rocks fall, everyone dies: ',err);
      });
    }
  }

  /*
    This handles ack messages.
  */
  $tw.nodeMessageHandlers.ack = $tw.Bob.Shared.handleAck;

}
})()
