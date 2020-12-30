/*\
title: $:/plugins/OokTech/Bob/NodeServerHandlers.js
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
exports.startup = function() {
if($tw.node) {
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
  $tw.Bob.Federation = $tw.Bob.Federation || {};
  $tw.Bob.Federation.remoteConnections = $tw.Bob.Federation.remoteConnections || {};

  $tw.nodeMessageHandlers.openRemoteConnection = function(data) {
    $tw.Bob.logger.log('openRemoteConnection', data, {level: 3})
    $tw.Bob.Shared.sendAck(data);
    if(data.url) {
      function authenticateMessage() {
        return true
      }
      function openRemoteSocket() {
        $tw.settings.federation = $tw.settings.federation || {};
        const serverName = $tw.settings.federation.serverName || 'Noh Neigh-m';
        const serverFederationInfo = {
          type: 'requestServerInfo',
          info: {
            name: serverName,
            publicKey: 'c minor',
            allows_login: 'no',
            available_wikis: $tw.ServerSide.getViewableWikiList(),
            available_chats: [],
            staticUrl: 'no',
            port: $tw.settings['ws-server'].port
          }
        }
        $tw.Bob.logger.log('REMOTE SOCKET OPENED', data.url, {level: 4})
        $tw.Bob.Federation.sendToRemoteServer(serverFederationInfo, data.url)
        $tw.Bob.Federation.sendToRemoteServer({type:'requestServerInfo', port:$tw.settings['ws-server'].port}, data.url)
        $tw.Bob.Federation.updateConnections()
      }
      // Check to make sure that we don't already have a connection to the
      // remote server
      // If the socket is closed than reconnect
      const remoteSocketAddress = data.url.startsWith('ws://')?data.url:'ws://'+data.url+'/api/federation/socket'
      const WebSocket = require('$:/plugins/OokTech/Bob/External/WS/ws.js');
      if(Object.keys($tw.Bob.Federation.remoteConnections).indexOf(data.url) === -1 || $tw.Bob.Federation.remoteConnections[data.url].socket.readyState === WebSocket.OPEN) {
        try {
          $tw.Bob.Federation.remoteConnections[data.url] = {}
          $tw.Bob.Federation.remoteConnections[data.url].socket = new WebSocket(remoteSocketAddress)
          /* TODO make the openRemoteSocket function authenticate the connection and destroy it if it fails authentication */
          $tw.Bob.Federation.remoteConnections[data.url].socket.on('open', openRemoteSocket)
          $tw.Bob.Federation.remoteConnections[data.url].socket.on('message', $tw.Bob.Federation.handleMessage)
          /* TODO
            add a readable name and something for a key here so that a server
            can change it's url and maintain the same name across different
            sessions

            Add an on open function that alerts the browsers that the
            connection has been made

            Add the on message handlers
          */
        } catch (e) {
          $tw.Bob.logger.error('error opening federated connection ', e, {level: 2})
        }
      } else {
        $tw.Bob.logger.log('A connection already exists to ', data.url, {level: 3})
      }
    }
  }

  /*
    This sends a websocket message to a remote server.

    data = {
      $server: the server url (or human readable name? It has to be unique),
      $message: the message type
      otherThings: data to pass on to the other server as parameters of the message being sent.
    }
  */
  $tw.nodeMessageHandlers.sendRemoteMessage = function (data) {
    $tw.Bob.Shared.sendAck(data);
    if(data.$server && data.$message) {
      const newData = {
        type: data.$message
      }
      Object.keys(data).forEach(function(key) {
        if(['type', '$server', '$message', 'wiki'].indexOf(key) === -1) {
          newData[key] = data[key]
        }
      })
      // TODO here we need to get the server info from the server name in data.$server
      // We need to get the target server port and address using data.$server and then use that to send.
      const serverInfo = {
        port: $tw.Bob.Federation.connections[data.$server].port,
        address: $tw.Bob.Federation.connections[data.$server].address
      }
      $tw.Bob.logger.log('send remote message:', newData, {level: 4})
      $tw.Bob.logger.log('send message to:', serverInfo, {level: 4})
      $tw.Bob.Federation.sendToRemoteServer(JSON.stringify(newData), serverInfo, data.wiki)
    }
  }

  /*
    Update information about a federated connection and syncing wikis on the
    server.

    To do this the tiddler that has the information about the connection gets
    sent with the message and it is parsed here.
  */
  $tw.nodeMessageHandlers.updateFederatedConnectionInfo = function(data) {
    $tw.Bob.Shared.sendAck(data);
    if(data.tid_param) {
      $tw.Bob.Federation.connections[data.tid_param.server_name].available_wikis[data.tid_param.name] = $tw.Bob.Federation.connections[data.tid_param.server_name].available_wikis[data.tid_param.name] || {};
      // $tw.Bob.Federation.connections[data.tid_param.server_name].availableWikis[data.tid_param.name] = $tw.Bob.Federation.connections[data.tid_param.server_name].availableWikis[data.tid_param.name] || {};
      $tw.Bob.Federation.connections[data.tid_param.server_name].available_wikis[data.tid_param.name].allows_login = data.tid_param.allows_login;
      $tw.Bob.Federation.connections[data.tid_param.server_name].available_wikis[data.tid_param.name].auto_sync = data.tid_param.auto_sync;
      $tw.Bob.Federation.connections[data.tid_param.server_name].available_wikis[data.tid_param.name].conflict_type = data.tid_param.conflict_type;
      $tw.Bob.Federation.connections[data.tid_param.server_name].available_wikis[data.tid_param.name].public = data.tid_param.public;
      $tw.Bob.Federation.connections[data.tid_param.server_name].available_wikis[data.tid_param.name].sync = data.tid_param.sync;
      $tw.Bob.Federation.connections[data.tid_param.server_name].available_wikis[data.tid_param.name].sync_filter = data.tid_param.sync_filter;
      $tw.Bob.Federation.connections[data.tid_param.server_name].available_wikis[data.tid_param.name].sync_type = data.tid_param.sync_type;
      $tw.Bob.Federation.connections[data.tid_param.server_name].available_wikis[data.tid_param.name].local_name = data.tid_param.local_name;
      $tw.Bob.Federation.updateConnectionsInfo();
    }
  }

  /*
    This lets us shutdown the server from within the wiki.
  */
  $tw.nodeMessageHandlers.shutdownServer = function(data) {
    $tw.Bob.logger.log('Shutting down server.', {level:0});
    // TODO figure out if there are any cleanup tasks we should do here.
    // Sennd message to parent saying server is shutting down
    $tw.Bob.Shared.sendAck(data);
    process.exit();
  }

  /*
    This sets up the logged in status of a wiki

    It needs to:

    - start the heartbeat process
    - populate the list of viewable wikis
    - add any configuration interface things
  */
  $tw.nodeMessageHandlers.setLoggedIn = function (data) {
    $tw.Bob.Shared.sendAck(data);
    // Heartbeat. This can be done if the heartbeat is started or not because
    // if an extra heartbeat pong is heard it just shifts the timing.
    let message = {};
    message.type = 'pong';
    if(data.heartbeat) {
      message.heartbeat = true;
    }
    // When the server receives a ping it sends back a pong.
    const response = JSON.stringify(message);
    $tw.connections[data.source_connection].socket.send(response);

    // Add configuration stuff
    $tw.nodeMessageHandlers.setConfigurationInterface(data);
  }

  /*
    This uses the token to determine which configuration options should be
    visible on the wiki and sends the appropriate tiddlers
  */
  $tw.nodeMessageHandlers.setConfigurationInterface = function (data) {
    $tw.Bob.Shared.sendAck(data);
    // I need to figure out what to put here
    const fields = {
      title: '$:/Bob/VisibleConfigurationTabs',
      list: "hi"
    }
    const tiddler = {fields: fields}
    const message = {type: 'saveTiddler', tiddler: tiddler, wiki: data.wiki}
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
    $tw.CreateSettingsTiddlers(data);
  }

  /*
    This only really matters in the secure wiki server for now
    public - true or false to set the wiki as public or not
    viewers - the list of people who can view the wiki
    editors - the list of people who can edit the wiki
  */
  $tw.nodeMessageHandlers.setWikiPermissions = function(data) {
    $tw.Bob.Shared.sendAck(data);
    // If the person doing this is owner of the wiki they can continue
    if($tw.ExternalServer) {
      $tw.ExternalServer.updatePermissions(data);
    }
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
    // Acknowledge the message.
    $tw.Bob.Shared.sendAck(data);
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
      const message = {
        alert: 'Can\'t parse changes from the server!',
        connections: [data.source_connection]
      };
      $tw.ServerSide.sendBrowserAlert(message);
      $tw.Bob.logger.error("Can't parse server changes!!", {level:1});
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
      if(serverEntry) {
        if(messageData.type !== serverEntry.type) {
          // Different message types between server and browser => conflict
          conflicts.push(messageData.title);
        } else if(messageData.type === 'saveTiddler' && serverEntry.type === 'saveTiddler') {
          // Server and browser are both save => conflict if the two tiddlers
          // aren't the same.
          let tempTid = JSON.parse(JSON.stringify(messageData.message.tiddler));
          tempTid.fields.title = messageData.title;
          tempTid.hash = messageData.hash;
          const serverTiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(tempTid.fields.title);
          if($tw.Bob.Shared.TiddlerHasChanged(serverTiddler, tempTid)) {
            conflicts.push(messageData.title);
          }
        }
      }
    });
    // Take care of all the messages that aren't conflicting
    // First from the received queue
    queue.forEach(function(messageData){
      if(conflicts.indexOf(messageData.title) === -1) {
        // Send the message to the handler with the appropriate setup
        $tw.Bob.handleMessage.call($tw.connections[data.source_connection].socket, JSON.stringify(messageData.message));
      }
    });
    // Then from the server side
    recentServer.forEach(function(messageData) {
      if(conflicts.indexOf(messageData.title) === -1) {
        let message = {type: messageData.type, wiki: data.wiki}
        let tiddler
        if(messageData.type === 'saveTiddler') {
          const longTitle = messageData.title;
          const tempTid = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(longTitle);
          if(typeof tempTid === 'object') {
            tiddler = JSON.parse(JSON.stringify(tempTid));
            tiddler.fields.title = messageData.title;
            // Making the copy above does something that breaks the date fields
            if(tempTid.fields.created) {
              tiddler.fields.created = $tw.utils.stringifyDate(tempTid.fields.created);
            }
            if(tempTid.fields.modified) {
              tiddler.fields.modified = $tw.utils.stringifyDate(tempTid.fields.modified);
            }
          }
        } else {
          tiddler = {fields:{title:messageData.title}}
        }
        message.tiddler = tiddler;
        if(typeof tiddler === 'object') {
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
      if(serverEntry) {
        let message = {};
        if(serverEntry.type === 'saveTiddler') {
          const longTitle = serverEntry.title;
          const tiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(longTitle);
          message = {
            type: 'conflict',
            message: 'saveTiddler',
            tiddler: tiddler,
            wiki: data.wiki
          };
        } else if(serverEntry.type === 'deleteTiddler') {
          message = {
            type: 'conflict',
            message: 'deleteTiddler',
            tiddler: {
              fields:{
                title:serverEntry.title
              }
            },
            wiki: data.wiki
          };
        }
        if(message) {
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
      if(tid) {
        if(data.hashes[tidTitle] !== $tw.Bob.Shared.getTiddlerHash(tid)) {
          // Send the updated tiddler
          message.type = 'saveTiddler'
        }
      } else {
        // Tiddler has been removed on the server, so send a conflict delete
        // message
        message.type = 'conflict'
        message.message = 'deleteTiddler'
      }
      if(message.type) {
        $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
      }
    })
  }

  $tw.nodeMessageHandlers.updateSetting = function(data) {
    $tw.Bob.Shared.sendAck(data);
    const path = require('path');
    const fs = require('fs');
    if(data.remove && typeof data.remove === 'string') {
      // Remove settings
      const pieces = data.remove.split('.');
      if(pieces) {
        if(pieces.length === 1) {
          if($tw.settings[pieces[0]]) {
            delete $tw.settings[pieces[0]]
          }
        } else if($tw.settings[pieces[0]]) {
          let current = $tw.settings;
          for(let i = 0; i < pieces.length ; i++) {
            if(i == pieces.length - 1) {
              // If we are at the end and it exists delete the setting
              if(current[pieces[i]]) {
                delete current[pieces[i]];
              }
            } else if(current[pieces[i]]) {
              // If the next step exists move up one
              current = current[pieces[i]];
            } else {
              // The setting doesn't exist/is already gone
              break;
            }
          }
        }
      }
      $tw.CreateSettingsTiddlers(data);
      const message = {
        alert: 'Updated 1 wiki settings.'
      };
      $tw.ServerSide.sendBrowserAlert(message);
      $tw.nodeMessageHandlers.saveSettings({fromServer: true, wiki: data.wiki})
    }
    if(typeof data.updateString !== 'undefined') {
      // Add/Update settings values
      let failed = false;
      let updatesObject = {};
      let error = undefined;
      try {
        if(typeof data.updateString === 'object') {
          Object.keys(data.updateString).forEach(function(key) {
            if(typeof data.updateString[key] === 'object') {
              updatesObject[key] = data.updateString[key]
            } else if(typeof data.updateString[key] === 'string') {
              if(data.updateString[key].startsWith('{') || data.updateString[key].startsWith('[')) {
                try {
                  updatesObject[key] = JSON.parse(data.updateString[key]);
                } catch (e) {
                  updatesObject[key] = data.updateString[key];
                }
              } else {
                updatesObject[key] = data.updateString[key];
              }
            }
          })
        } else {
          updatesObject = JSON.parse(data.updateString);
        }
      } catch (e) {
        updatesObject = {};
        failed = true;
        error = e;
      }
      if(Object.keys(updatesObject).length > 0) {
        $tw.updateSettings($tw.settings, updatesObject);
      }
      if(!failed) {
        $tw.CreateSettingsTiddlers(data);
        const message = {
          alert: 'Updated ' + Object.keys(updatesObject).length + ' wiki settings.'
        };
        $tw.ServerSide.sendBrowserAlert(message);
        $tw.nodeMessageHandlers.saveSettings({fromServer: true, wiki: data.wiki})
      } else {
        $tw.CreateSettingsTiddlers(data);
        const message = {
          alert: 'Failed to update settings with error: ' + error
        };
        $tw.ServerSide.sendBrowserAlert(message);
      }
    }
  }

  /*
    This updates the settings.json file based on the changes that have been made
    in the browser.
  */
  $tw.nodeMessageHandlers.saveSettings = function(data) {
    $tw.Bob.Shared.sendAck(data);
    if($tw.ExternalServer) {
      if(data.fromServer !== true && data.settingsString) {
        // Get first tiddler to start out
        settings = data.settingsString;
        // save the settings to the database
        require('./LoadConfig.js').saveSetting(JSON.parse(data.settingsString));
      }
    } else {
      const path = require('path');
      const fs = require('fs');
      let settings = JSON.stringify($tw.settings, "", 2);
      if(data.fromServer !== true && data.settingsString) {
        // Get first tiddler to start out
        settings = data.settingsString;

        // Update the $tw.settings object
        // Put the updated version in.
        $tw.updateSettings($tw.settings, JSON.parse(settings));
      }
      // Save the updated settings
      const userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
      const userSettingsFolder = path.join($tw.boot.wikiPath, 'settings')
      if(!fs.existsSync(userSettingsFolder)) {
        // Create the settings folder
        fs.mkdirSync(userSettingsFolder);
      }
      // This should prevent an empty string from ever being given
      fs.writeFile(userSettingsPath, JSON.stringify($tw.settings, "", 2), {encoding: "utf8"}, function (err) {
        if(err) {
          const message = {
            alert: 'Error saving settings:' + err,
            connections: [data.source_connection]
          };
          $tw.ServerSide.sendBrowserAlert(message);
          $tw.Bob.logger.error(err, {level:1});
        } else {
          $tw.Bob.logger.log('Wrote settings file', {level:1})
        }
      });
    }
    try {
      // Update the settings tiddler in the wiki.
      const tiddlerFields = {
        title: '$:/WikiSettings',
        text: JSON.parse(data.settingsString),
        type: 'application/json'
      };
      // Push changes out to the browsers
      $tw.Bob.SendToBrowsers({
        type: 'saveTiddler',
        tiddler: {
          fields: tiddlerFields
        },
        wiki: data.wiki
      });
    } catch (e) {
      // something?
    }
    if(typeof data.settingsString === "string") {
      try {
        $tw.updateSettings($tw.settings, JSON.parse(data.settingsString));
      } catch (e) {
        // nothing
      }
    }
    $tw.CreateSettingsTiddlers(data);
    const message = {
      alert: 'Saved wiki settings.',
      wikis: [data.wiki]
    };
    $tw.ServerSide.sendBrowserAlert(message);
    $tw.Bob.SendToBrowsers({type: 'updateSettings'});
  }

  /*
    This unloads a wiki from memory.
    This can be used to reduce the memory footprint and to fully reload a wiki.

    It needs to remove everything under $tw.Bob.Wikis[data.wikiName] for the
    wiki. And it also need to find all of the tiddlers for the wiki and remove
    them. But I don't know how to do that without deleting the tiddlers.
  */
  $tw.nodeMessageHandlers.unloadWiki = function (data) {
    $tw.Bob.Shared.sendAck(data);
    // make sure that there is a wiki name given.
    if(data.wikiName) {
      $tw.Bob.logger.log('Unload wiki ', data.wikiName, {level:1});
      $tw.stopFileWatchers(data.wikiName);
      // Make sure that the wiki is loaded
      if($tw.Bob.Wikis[data.wikiName]) {
        if($tw.Bob.Wikis[data.wikiName].State === 'loaded') {
          // If so than unload the wiki
          // This removes the information about the wiki and the wiki object
          delete $tw.Bob.Wikis[data.wikiName];
          // This removes all the info about the files for the wiki
          delete $tw.Bob.Files[data.wikiName];
        }
      }
      $tw.Bob.DisconnectWiki(data.wikiName);
    }
  }

  /*
    This sends a list of all available plugins to the wiki
  */
  $tw.nodeMessageHandlers.getPluginList = function (data) {
    $tw.Bob.Shared.sendAck(data);
    const pluginNames = $tw.utils.getPluginInfo();
    const fields = {
      title: '$:/Bob/AvailablePluginList',
      list: $tw.utils.stringifyList(Object.keys(pluginNames))
    }
    const tiddler = {
      fields: fields
    };
    const message = {
      type: 'saveTiddler',
      tiddler: tiddler,
      wiki: data.wiki
    }
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
  }

  /*
    This sends a list of all available plugins to the wiki
  */
  $tw.nodeMessageHandlers.getThemeList = function (data) {
    $tw.Bob.Shared.sendAck(data);
    const themeNames = $tw.utils.getThemeInfo();
    const fields = {
      title: '$:/Bob/AvailableThemeList',
      list: $tw.utils.stringifyList(Object.keys(themeNames))
    };
    const tiddler = {
      fields: fields
    };
    const message = {
      type: 'saveTiddler',
      tiddler: tiddler,
      wiki: data.wiki
    };
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
  }

  /*
    This loads the tiddlywiki.info and if new versions are given it updates the
    description, list of plugins, themes and languages
  */
  $tw.nodeMessageHandlers.updateTiddlyWikiInfo = function (data) {
    $tw.Bob.Shared.sendAck(data);
    if(data.wiki) {
      const path = require('path')
      const fs = require('fs')
      const wikiInfoPath = path.join($tw.Bob.Wikis[data.wiki].wikiPath, 'tiddlywiki.info');
      let wikiInfo = {}
      try {
        wikiInfo = JSON.parse(fs.readFileSync(wikiInfoPath,"utf8"));
      } catch(e) {
        $tw.Bob.logger.error(e, {level:1})
      }
      if(data.description || data.description === "") {
        wikiInfo.description = data.description;
      }
      if(data.pluginList || data.pluginList === "") {
        wikiInfo.plugins = $tw.utils.parseStringArray(data.pluginList);
      }
      if(data.themeList || data.themeList === "") {
        wikiInfo.themes = $tw.utils.parseStringArray(data.themeList);
      }
      if(data.languageList || data.languageList === "") {
        wikiInfo.languages = $tw.utils.parseStringArray(data.languageList);
      }
      try {
        fs.writeFileSync(wikiInfoPath, JSON.stringify(wikiInfo, null, 4))
      } catch (e) {
        $tw.Bob.logger.error(e, {level:1})
      }
    }
  }

  /*
    This saves a plugin tiddler and splits it into separate .tid files and
    saves them into the appropriate folder

    But first it checks the plugin version to make sure that it is newer than
    the existing one
  */
  $tw.nodeMessageHandlers.savePluginFolder = function(data) {
    $tw.Bob.Shared.sendAck(data);
    if(data.plugin) {
      const fs = require('fs')
      const path = require('path')
      const pluginTiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(data.plugin)
      if(pluginTiddler) {
        const pluginName = data.plugin.replace(/^\$:\/plugins\//, '')
        const basePath = $tw.ServerSide.getBasePath()
        const pluginFolderPath = path.resolve(basePath, $tw.settings.pluginsPath, pluginName)
        const pluginInfoPath = path.join(pluginFolderPath, 'plugin.info')
        let isNewVersion = true
        let oldVersion = {}
        let newVersion = {}
        // Check if the plugin folder exists
        if(fs.existsSync(pluginInfoPath)) {
          // If it does exist than check versions, only save new or equal
          // versions
          // Load the plugin.info file and check the version
          let oldInfo
          try {
            oldInfo = JSON.parse(fs.readFileSync(pluginInfoPath, 'utf8'))
          } catch (e) {
            //Something
            $tw.Bob.logger.error(e, {level:1})
          }
          if(oldInfo) {
            // Check the version here
            oldVersion = $tw.utils.parseVersion(oldInfo.version)
            newVersion = $tw.utils.parseVersion(pluginTiddler.fields.version)
            if(oldVersion.major > newVersion.major) {
              isNewVersion = false
            } else if(oldVersion.minor > newVersion.minor) {
              isNewVersion = false
            } else if(oldVersion.patch > newVersion.patch) {
              isNewVersion = false
            }
          }
        } else {
          // We don't have any version of the plugin yet
          let error = $tw.utils.createDirectory(pluginFolderPath);
          if(error) {
            $tw.Bob.logger.error(error, {level:1})
          }
        }
        if(isNewVersion) {
          // Save the plugin tiddlers
          Object.keys(JSON.parse(pluginTiddler.fields.text).tiddlers).forEach(function(title) {
            const content = $tw.Bob.Wikis[data.wiki].wiki.renderTiddler("text/plain", "$:/core/templates/tid-tiddler", {variables: {currentTiddler: title}});
            const fileExtension = '.tid'
            const filepath = path.join(pluginFolderPath, $tw.syncadaptor.generateTiddlerBaseFilepath(title, data.wiki) + fileExtension);
            // If we aren't passed a path
            fs.writeFile(filepath,content,{encoding: "utf8"},function (err) {
              if(err) {
                $tw.Bob.logger.error(err, {level:1});
              } else {
                $tw.Bob.logger.log('saved file', filepath, {level:2})
              }
            });
          })
          // Make the plugin.info file
          let pluginInfo = {}
          Object.keys(pluginTiddler.fields).forEach(function(field) {
            if(field !== 'text' && field !== 'tags' && field !== 'type') {
              pluginInfo[field] = pluginTiddler.fields[field]
            }
          })
          fs.writeFile(pluginInfoPath,JSON.stringify(pluginInfo, null, 2),{encoding: "utf8"},function (err) {
            if(err) {
              $tw.Bob.logger.error(err, {level:1});
            } else {
              $tw.Bob.logger.log('saved file', pluginInfoPath, {level:2})
            }
          });
        } else {
          $tw.Bob.logger.log("Didn't save plugin", pluginName, "with version", newVersion.version,"it is already saved with version", oldVersion.version, {level:1})
        }
      }
    }
  }

  /*
    Given a url that points to either github, gitlab or a zip file with a
    plugin this gets the plugin and adds it to the plugins on the server.
  */
  $tw.nodeMessageHandlers.getGitPlugin = function(data) {
    $tw.Bob.Shared.sendAck(data)
    if(data.url) {
      // Special handling for github, we will see about other things later.
      if(!data.url.toLowerCase().endsWith('.zip')) {
        if(data.url.toLowerCase().startsWith('https://github.com')) {
          data.url = data.url + '/archive/master.zip';
        } else if(data.url.toLowerCase().startsWith('https://gitlab.com')) {
          const repoName = data.url.toLowerCase().split('/').pop()
          data.url = data.url + '/-/archive/master/' + repoName + '-master.zip'
        }
      }
      const path = require('path');
      const fs = require('fs')
      const protocol = data.url.startsWith('https')?'https':'http';
      const JSZip = require("$:/plugins/OokTech/Bob/External/jszip/jszip.js");
      const http = require("$:/plugins/OokTech/Bob/External/followRedirects/followRedirects.js")[protocol];
      const req = http.get(data.url, function (res) {
        if(res.statusCode !== 200) {
          $tw.Bob.logger.error('failed to fetch git plugin with code', res.statusCode, {level:1});
          // handle error
          return;
        }
        let data = [], dataLen = 0;
        res.on("data", function (chunk) {
          data.push(chunk);
          dataLen += chunk.length;
        });
        res.on("end", function () {
          const buf = Buffer.concat(data);
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
            const basePath = $tw.ServerSide.getBasePath()
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
                    $tw.Bob.logger.log('wrote file: ', path.join(pluginsPath,pluginName,relativePath), {level:2});
                  })
                }
              });
              const message = {
                alert: 'Saved ' + pluginName + 'to server library.'
              };
              $tw.ServerSide.sendBrowserAlert(message);
            }
          }).catch(function(err) {
            $tw.Bob.logger.error('some error saving git plugin',err, {level:1});
          });
        });
      });

      req.on("error", function(err){
        // handle error
        $tw.Bob.logger.error('Rocks fall, everyone dies: ',err, {level:0});
      });
    }
  }

  /*
    This takes all embedded media and moves it into the folder for serving
    files and replaces all of the media tiddlers with _canonical_uri tiddlers.

    Structure of data
    {
      "type": "makeImagesExternal",
      "wiki": "wikiName",
      "storeIn": "folderType"
    }

    storeIn can be 'global' (default) or 'wiki'
    global puts the files in the global folder
    wiki puts the files in the wiki specific folder

  */
  $tw.nodeMessageHandlers.makeImagesExternal = function(data) {
    $tw.Bob.Shared.sendAck(data);
    const authorised = $tw.Bob.AccessCheck(data.fromWiki, {"decoded":data.decoded}, 'makeImagesExternal', 'server');
    if(authorised) {
      $tw.settings.fileURLPrefix = $tw.settings.fileURLPrefix || 'files'
      const path = require('path');
      const fs = require('fs');
      // Get all the tiddlers that have a media type we care about
      // Get files path
      const basePath = $tw.ServerSide.getBasePath()
      let midPath;
      if(data.storeIn !== 'wiki') {
        midPath = path.join($tw.settings.wikisPath, data.wiki);
      } else {
        //midPath = $tw.settings.filePathRoot;
        midPath = $tw.ServerSide.getFilePathRoot();
      }
      let filesPath;
      if(data.storeIn !== 'wiki') {
        filesPath = path.resolve(basePath, midPath, 'files');
      } else {
        filesPath = path.resolve(basePath, midPath);
      }
      // Make sure that filesPath exists
      $tw.utils.createDirectory(filesPath);
      let tiddlersToMove = [];
      $tw.Bob.Wikis[data.wiki].wiki.allTitles().forEach(function(tidTitle) {
        const tiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(tidTitle);
        if(tiddler) {
          if(tiddler.fields.type) {
            const typeParts = tiddler.fields.type.split('/')
            if((['image', 'audio', 'video'].indexOf(typeParts[0]) !== -1 || tiddler.fields.type === 'application/pdf') && (!tiddler.fields._canonical_uri || tiddler.fields._canonical_uri === '')) {
              // Move the file from the tiddlers folder to the files folder,
              if($tw.Bob.Files[data.wiki][tidTitle]) {
                const fileName = $tw.Bob.Files[data.wiki][tidTitle].filepath.split('/').slice(-1)[0]
                fs.rename($tw.Bob.Files[data.wiki][tidTitle].filepath, path.join(filesPath, fileName), function(e) {
                  if(e) {
                    $tw.Bob.logger.error('failed to move image file',e, {level:1});
                  } else {
                    let newFields = JSON.parse(JSON.stringify(tiddler.fields));
                    newFields.text = ''
                    if(data.storeIn === 'wiki') {
                      newFields._canonical_uri = path.join('/', data.wiki, $tw.settings.fileURLPrefix, fileName);
                    } else {
                      newFields._canonical_uri = path.join('/', $tw.settings.fileURLPrefix, fileName);
                    }
                    //delete the original tiddler
                    $tw.Bob.DeleteTiddler($tw.Bob.Files[data.wiki][tidTitle].filepath.split('/').slice(0,-1).join('/'), fileName, data.wiki);
                    // create the tiddler with the same name and give it a
                    // _canonical_uri field pointing to the correct file.
                    $tw.syncadaptor.saveTiddler(new $tw.Tiddler(newFields), data.wiki);
                  }
                });
              }
            }
          }
        }
      })
      const message = {
        alert: 'Made media external for ' + data.wiki,
        wikis: [data.wiki]
      };
      $tw.ServerSide.sendBrowserAlert(message);
    }
  }

  /*
    This renames/moves a wiki

    {
      wiki: callingWiki,
      oldWiki: oldWikiName,
      newWiki: newWikiName
    }

    oldWiki is the name of the wiki you want to rename, newWiki is the new name
    for the wiki.

    If the new name is an existing wiki than this won't do anything.
  */
  $tw.nodeMessageHandlers.renameWiki = function(data) {
    $tw.Bob.Shared.sendAck(data);
    $tw.ServerSide.renameWiki(data, function(e) {
      if(!e) {
        const message = {
          alert: 'Renamed ' + data.oldWiki + ' to ' + data.newWiki
        };
        $tw.ServerSide.sendBrowserAlert(message);
      } else {
        const message = {
          alert: 'Failed to rename ' + data.oldWiki
        };
        $tw.ServerSide.sendBrowserAlert(message);
      }
    })
  }

  /*
    This deletes a wiki.

    {
      wiki: callingWiki,
      deleteWiki: wikiToDelete,
      deleteChildren: deleteChildren
    }

    wikiToDelete is the wiki that will be deleted
    deleteChildren if set to 'yes' than the entire wiki folder, including any
    child wikis, is deleted, Otherwise only the tiddlywiki.info file and the
    tiddlers folder is removed.
  */
  $tw.nodeMessageHandlers.deleteWiki = function(data) {
    $tw.Bob.Shared.sendAck(data)
    $tw.ServerSide.deleteWiki(data, thisCallback);

    function thisCallback(err) {
      let message;
      if(err) {
        message = {
          alert: 'Error trying to delete wiki ' + e
        };
      } else {
        if(data.deleteChildren === 'yes') {
          message = {
            alert: 'Deleted wiki ' + data.deleteWiki + ' and its child wikis.'
          };
        } else {
          message = {
            alert: 'Deleted wiki ' + data.deleteWiki
          };
        }
      }
      $tw.ServerSide.sendBrowserAlert(message);
    }
  }

  /*
    This handlers takes a folder as input and if the folder is one of the
    folders with media being served it will return a list of files available in
    the folder.

    data = {
      folder: './',
      mediaTypes: .mp3 .mp3 .doc,
      tiddler: $:/state/fileList,
      field: list
    }

    TODO figure out the authorisation level for this one
  */
  $tw.nodeMessageHandlers.listFiles = function(data) {
    $tw.Bob.Shared.sendAck(data);

    function thisCallback(prefix, filteredItems, urlPath) {
      wikiName = wikiName || '';
      data.tiddler = data.tiddler || path.join('$:/state/fileList/', data.wiki, $tw.settings.fileURLPrefix, urlPath);
      data.field = data.field || 'list';

      const fields = {
        title: data.tiddler,
        pathprefix: prefix,
        folder: data.folder,
      }
      fields[data.field] = $tw.utils.stringifyList(filteredItems);
      const message = {
        type: "saveTiddler",
        tiddler: {
          fields: fields
        },
        wiki: data.wiki
      }
      $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
    }

    $tw.ServerSide.listFiles(data, thisCallback)

  }

  /*
    This handler takes a folder as input and scans the folder for media
    and creates _canonical_uri tiddlers for each file found.,
    an optional extension list can be passed to restrict the media types scanned for.

    ignoreExisting takes precidence over overwrite

    data = {
      folder: './',
      ignoreExisting: 'true',
      overwrite: 'false',
      prune: 'false',
      mediaTypes: [things listed in the mimemap],
      prefix: 'docs'
    }
    Folder paths are either absolute or relative to $tw.Bob.getBasePath()

    folder - the folder to scan
    ignoreExisting -
    overwrite - if this is true than tiddlers are made even if they overwrite existing tiddlers
    prune - remove tiddlers that have _canonical_uri fields pointing to files that don't exist in the folder
    mediaTypes - an array of file extensions to look for. If the media type is not in the mimemap than the tiddler type may be set incorrectly.
    prefix - the prefix to put on the uri, the uri will be in the form
            /wikiName/files/prefix/file.ext

    TODO - add a recursive option (with some sane limits, no recursively finding everything in /)
    TODO - figure out what permission this one should go with
    TODO - maybe add some check to limit where the folders can be
    TODO - add a flag to add folders to the static file server component
  */
  $tw.nodeMessageHandlers.mediaScan = function(data) {
    $tw.Bob.Shared.sendAck(data);
    data.prefix = data.prefix || 'prefix';
    const path = require('path');
    const fs = require('fs');
    const authorised = $tw.Bob.AccessCheck(data.wiki, {"decoded":data.decoded}, 'serverAdmin');
    const filePathRoot = $tw.ServerSide.getFilePathRoot();
    $tw.settings.fileURLPrefix = $tw.settings.fileURLPrefix || 'files';
    if(authorised) {
      $tw.settings.servingFiles[data.prefix] = data.folder;
      const mimeMap = $tw.settings.mimeMap || {
        '.aac': 'audio/aac',
        '.avi': 'video/x-msvideo',
        '.csv': 'text/csv',
        '.doc': 'application/msword',
        '.epub': 'application/epub+zip',
        '.gif': 'image/gif',
        '.html': 'text/html',
        '.htm': 'text/html',
        '.ico': 'image/x-icon',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.mp3': 'audio/mpeg',
        '.mpeg': 'video/mpeg',
        '.oga': 'audio/ogg',
        '.ogv': 'video/ogg',
        '.ogx': 'application/ogg',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.weba': 'audio/weba',
        '.webm': 'video/webm',
        '.wav': 'audio/wav'
      };
      if(typeof data.mediaTypes === 'string') {
        if(data.mediaTypes.length > 0) {
          data.mediaTypes = data.mediaTypes.split(' ');
        }
      } else {
        data.mediaTypes = undefined;
      }
      data.mediaTypes = data.mediaTypes || Object.keys(mimeMap);
      if(data.folder && data.wiki) {
        // Make sure the folder exists
        let mediaURIList = [];
        /*
        if(typeof $tw.settings.filePathRoot !== 'string') {
          $tw.settings.filePathRoot = './files';
        }
        */
        const mediaDir = path.resolve($tw.ServerSide.getBasePath(), filePathRoot, data.folder)
        if($tw.utils.isDirectory(mediaDir)) {
          fs.readdir(mediaDir, function(err, files) {
            if(err) {
              $tw.Bob.logger.error('Error scanning folder', data.folder, {level:1});
              return;
            }
            const uriPrefix = '/' + path.relative($tw.ServerSide.getBasePath(), mediaDir);
            if(data.keepBroken !== true) {
              // get a list of all tiddlers with _canonical_uri fields that
              // point to this folder.
              mediaURIList = $tw.Bob.Wikis[data.wiki].wiki.filterTiddlers(`[has[_canonical_uri]get[_canonical_uri]prefix[${uriPrefix}]]`);
              // We don't want to list uris for subfolders until we do a recursive find thing
              mediaURIList = mediaURIList.filter(function(uri) {
                return uri.slice(uriPrefix.length+1).indexOf('/') === -1;
              })
            }
            // For each file check the extension against the mimemap, if it matches make the corresponding _canonical_uri tiddler.
            files.forEach(function(file) {
              if(fs.statSync(path.join(mediaDir, file)).isFile()) {
                const pathInfo = path.parse(file);
                if(data.mediaTypes.indexOf(pathInfo.ext) !== -1) {
                  const thisURI = '/' + $tw.settings.fileURLPrefix + '/' + data.prefix + '/' + path.relative(path.resolve(data.folder),path.join(mediaDir, file));
                  if(data.prune === 'yes') {
                    // Remove any _canonical_uri tiddlers that have paths to
                    // this folder but no files exist for them.
                    // remove the current file from the mediaURIList so that at
                    // the end we have a list of URIs that don't have files
                    // that exist.
                    if(mediaURIList.indexOf(thisURI) > -1) {
                      mediaURIList.splice(mediaURIList.indexOf(thisURI),1);
                    }
                  }
                  // It is a file and the extension is listed, so create a tiddler for it.
                  const fields = {
                    title: pathInfo.base,
                    type: mimeMap[pathInfo.ext],
                    _canonical_uri: thisURI
                  };
                  if(data.ignoreExisting !== 'yes') {
                    // check if the tiddler with this _canonical_uri already
                    // exists.
                    // If we aren't set to overwrite than don't do anything for
                    // this file if it exists
                    if($tw.Bob.Wikis[data.wiki].wiki.filterTiddlers(`[_canonical_uri[${fields._canonical_uri}]]`).length > 0) {
                      return;
                    }
                  }
                  const thisTiddler = new $tw.Tiddler($tw.Bob.Wikis[data.wiki].wiki.getCreationFields(), fields);
                  const tiddlerPath = path.join($tw.Bob.Wikis[data.wiki].wikiTiddlersPath, file);
                  // Check if the file exists and only overwrite it if the
                  // overwrite flag is set.
                  // Update this to check for files by the _canonical_uri field
                  if(data.overwrite === 'yes' || !$tw.Bob.Wikis[data.wiki].wiki.getTiddler(file)) {
                    // Add tiddler to the wiki listed in data.wiki
                    $tw.syncadaptor.saveTiddler(thisTiddler, data.wiki);
                  }
                }
              }
            });
            if(data.prune === 'yes') {
              // mediaURIList now has the uris from tiddlers that don't point
              // to real files.
              // Get the tiddlers with the uris listed and remove them.
              mediaURIList.forEach(function(uri) {
                const tiddlerList = $tw.Bob.Wikis[data.wiki].wiki.filterTiddlers(`[_canonical_uri[${uri}]]`);
                tiddlerList.forEach(function(tidTitle) {
                  $tw.syncadaptor.deleteTiddler(tidTitle, {wiki: data.wiki});
                })
              })
            }
          })
        }
      }
      // Save the settings
      $tw.nodeMessageHandlers.saveSettings({fromServer: true, wiki: data.wiki});
    }
  }

  /*
    List visible profiles
  */
  $tw.nodeMessageHandlers.listProfiles = function(data) {
    $tw.Bob.Shared.sendAck(data);
    // Access is controlled by the listProfile function, it checks each profile
    // to see if the logged in person can view it.
    const profiles = request.wiki.tw.ServerSide.listProfiles(data);
    const message = {
      type: "profileList",
      profiles: profiles
    }
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
  }
}
}
})();
