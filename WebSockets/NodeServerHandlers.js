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

if($tw.node) {
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
  $tw.federatedConnections = $tw.federatedConnections || {};

  $tw.nodeMessageHandlers.openRemoteConnection = function(data) {
    console.log('openRemoteConnection', data)
    $tw.Bob.Shared.sendAck(data);
    if(data.url) {
      // Check to make sure that we don't already have a connection to the
      // remote server
      if(typeof $tw.federatedConnections[data.url] !== 'undefined') {
        const WebSocket = require('ws')
        try {
          $tw.federatedConnections[data.url] = {}
          $tw.federatedConnections[data.url].socket = new WebSocket(data.url)
          /* TODO make the openRemoteSocket function authenticate the connection and destroy it if it fails authentication */
          $tw.federatedConnections[data.url].on('open', openRemoteSocket)
          $tw.federatedConnections[data.url].on('message', handleFederationMessage)
          /* TODO
            add a readable name and something for a key here so that a server
            can change it's url and maintain the same name across different
            sessions

            Add an on open function that alerts the browsers that the
            connection has been made

            Add the on message handlers
          */
          function openRemoteSocket(event) {
            console.log('REMOTE SOCKET OPENED', event)
          }
          const handleFederationMessage = function (event) {
            try {
              let eventData = JSON.parse(event);
              // Make sure we have a handler for the message type
              if(typeof $tw.federationMessageHandlers[eventData.type] === 'function') {
                // Check authorisation
                const authorised = authenticateMessage(eventData)
                if(authorised) {
                  eventData.decoded = authorised
                  $tw.federationMessageHandlers[eventData.type](eventData);
                }
              } else {
                $tw.Bob.logger.error('No handler for federation message of type ', eventData.type, {level:3});
              }
            } catch (e) {
              $tw.Bob.logger.error("Federation WebSocket error: ", e, {level:1});
            }
          }
        } catch (e) {
          console.log('error opening federated connection ', e)
        }
      } else {
        console.log('A connection already exists to ', data.url)
      }
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

    // Populating the wiki list uses the same stuff as the other message.
    $tw.nodeMessageHandlers.getViewableWikiList(data);

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
          message = {type: 'conflict', message: 'saveTiddler', tiddler: tiddler, wiki: data.wiki};
        } else if(serverEntry.type === 'deleteTiddler') {
          message = {type: 'conflict', message: 'deleteTiddler', tiddler: {fields:{title:serverEntry.title}}, wiki: data.wiki};
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
    if(typeof data.updateString === 'object') {
      let failed = false;
      let updatesObject;
      let error = undefined;
      try {
        updatesObject = JSON.parse(data.updateString);
      } catch (e) {
        updatesObject = {};
        failed = true;
        error = e;
      }
      if(Object.keys(updatesObject).length > 0) {
        $tw.updateSettings($tw.settings, updatesObject);
      }
      if(!failed) {
        $tw.CreateSettingsTiddlers();
        const message = {
          alert: 'Updated ' + Object.keys(updatesObject).length + ' wiki settings.'
        };
        $tw.ServerSide.sendBrowserAlert(message);
      } else {
        $tw.CreateSettingsTiddlers();
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
    const path = require('path');
    const fs = require('fs');
    let settings = JSON.stringify($tw.settings, "", 2);
    if(data.fromServer !== true && data.settingsString) {
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
    if(!fs.existsSync(userSettingsFolder)) {
      // Create the settings folder
      fs.mkdirSync(userSettingsFolder);
    }
    fs.writeFile(userSettingsPath, settings, {encoding: "utf8"}, function (err) {
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

    $tw.CreateSettingsTiddlers(data);
    const message = {
      alert: 'Saved wiki settings.',
      wikis: [data.wiki]
    };
    $tw.ServerSide.sendBrowserAlert(message);
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
      $tw.Bob.logger.log('Unload wiki ', data.wikiName, {level:1})
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
    const tiddler = {fields: fields}
    const message = {type: 'saveTiddler', tiddler: tiddler, wiki: data.wiki}
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
    }
    const tiddler = {fields: fields}
    const message = {type: 'saveTiddler', tiddler: tiddler, wiki: data.wiki}
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
      var req = http.get(data.url, function (res) {
        if(res.statusCode !== 200) {
          $tw.Bob.logger.error('failed to fetch git plugin with code', res.statusCode, {level:1});
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
    const authorised = $tw.Bob.AccessCheck(data.fromWiki, {"decoded":data.decoded}, 'admin');
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
        midPath = $tw.settings.filePathRoot;
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
    const path = require('path')
    const fs = require('fs')
    const authorised = $tw.Bob.AccessCheck(data.fromWiki, {"decoded":data.decoded}, 'duplicate');
    if($tw.ServerSide.existsListed(data.oldWiki) && !$tw.ServerSide.existsListed(data.newWiki) && authorised) {
      // Unload the old wiki
      $tw.nodeMessageHandlers.unloadWiki({wikiName: data.oldWiki});
      const basePath = $tw.ServerSide.getBasePath();
      const oldWikiPath = $tw.ServerSide.getWikiPath(data.oldWiki);
      const newWikiPath = path.resolve(basePath, $tw.settings.wikisPath, data.newWiki);
      fs.rename(oldWikiPath, newWikiPath, function(e) {
        if(e) {
          $tw.Bob.logger.log('failed to rename wiki',e,{level:1});
        } else {
          // Refresh wiki listing
          data.update = 'true';
          data.saveSettings = 'true';
          $tw.nodeMessageHandlers.findAvailableWikis(data);
          const message = {
            alert: 'Renamed ' + data.oldWiki + ' to ' + data.newWiki
          };
          $tw.ServerSide.sendBrowserAlert(message);
        }
      })
    }
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

  // This is a thing to do rm -rf using node since rmdir fails on non-empty directories

  function deleteFile(dir, file) {
    const fs = require('fs');
    const path = require('path');
    return new Promise(function (resolve, reject) {
      //Check to make sure that dir is in the place we expect
      if(dir.startsWith($tw.ServerSide.getBasePath())) {
        var filePath = path.join(dir, file);
        fs.lstat(filePath, function (err, stats) {
          if(err) {
            return reject(err);
          }
          if(stats.isDirectory()) {
            resolve(deleteDirectory(filePath));
          } else {
            fs.unlink(filePath, function (err) {
              if(err) {
                return reject(err);
              }
              resolve();
            });
          }
        });
      } else {
        reject('The folder is not in expected place!');
      }
    });
  };

  function deleteDirectory(dir) {
    const fs = require('fs');
    const path = require('path');
    return new Promise(function (resolve, reject) {
      // Check to make sure that dir is in the place we expect
      if(dir.startsWith($tw.ServerSide.getBasePath())) {
        fs.access(dir, function (err) {
          if(err) {
            if(err.code === 'ENOENT') {
              return resolve();
            }
            return reject(err);
          }
          fs.readdir(dir, function (err, files) {
            if(err) {
              return reject(err);
            }
            Promise.all(files.map(function (file) {
              return deleteFile(dir, file);
            })).then(function () {
              fs.rmdir(dir, function (err) {
                if(err) {
                  return reject(err);
                }
                resolve();
              });
            }).catch(reject);
          });
        });
      } else {
        reject('The folder is not in expected pace!');
      }
    });
  };
  $tw.stopFileWatchers = function(wikiName) {
    // Close any file watchers that are active for the wiki
    if ($tw.Bob.Wikis[wikiName]) {
      if ($tw.Bob.Wikis[wikiName].watchers) {
        Object.values($tw.Bob.Wikis[wikiName].watchers).forEach(function(thisWatcher) {
          thisWatcher.close();
        })
      }
    }
  }
  $tw.nodeMessageHandlers.deleteWiki = function(data) {
    $tw.Bob.Shared.sendAck(data)
    const path = require('path')
    const fs = require('fs')
    const authorised = $tw.Bob.AccessCheck(data.deleteWiki, {"decoded":data.decoded}, 'delete');
    // Make sure that the wiki exists and is listed
    if($tw.ServerSide.existsListed(data.deleteWiki) && authorised) {
      $tw.stopFileWatchers(data.deleteWiki)
      const wikiPath = $tw.ServerSide.getWikiPath(data.deleteWiki);
      if(data.deleteChildren === 'yes') {
        deleteDirectory(wikiPath).then(function() {
          // Refresh wiki listing
          data.update = 'true';
          data.saveSettings = 'true';
          $tw.nodeMessageHandlers.findAvailableWikis(data);
          const message = {
            alert: 'Deleted wiki ' + data.deleteWiki + ' and its child wikis.'
          };
          $tw.ServerSide.sendBrowserAlert(message);
        }).catch(function(e) {
          // Refresh wiki listing
          data.update = 'true';
          data.saveSettings = 'true';
          $tw.nodeMessageHandlers.findAvailableWikis(data);
          const message = {
            alert: 'Error trying to delete wiki ' + e
          };
          $tw.ServerSide.sendBrowserAlert(message);
        })
      } else {
        // Delete the tiddlywiki.info file
        fs.unlink(path.join(wikiPath, 'tiddlywiki.info'), function(e) {
          if(e) {
            $tw.Bob.logger.error('failed to delete tiddlywiki.info',e, {level:1});
          } else {
            // Delete the tiddlers folder (if any)
            deleteDirectory(path.join(wikiPath, 'tiddlers')).then(function() {
              $tw.utils.deleteEmptyDirs(wikiPath,function() {
                // Refresh wiki listing
                data.update = 'true';
                data.saveSettings = 'true';
                $tw.nodeMessageHandlers.findAvailableWikis(data);
                const message = {
                  alert: 'Deleted wiki ' + data.deleteWiki
                };
                $tw.ServerSide.sendBrowserAlert(message);
              });
            }).catch(function(e){
              // Refresh wiki listing
              data.update = 'true';
              data.saveSettings = 'true';
              $tw.nodeMessageHandlers.findAvailableWikis(data);
              const message = {
                alert: 'Error trying to delete wiki ' + e
              };
              $tw.ServerSide.sendBrowserAlert(message);
            })
          }
        })
      }
    }
  }
}
})();
