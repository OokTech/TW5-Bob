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
  $tw.connections = $tw.connections || [];
  $tw.Bob = $tw.Bob || {};
  $tw.Bob.Shared = require('$:/plugins/OokTech/Bob/SharedFunctions.js');
  // This lets you add to the $tw.nodeMessageHandlers object without overwriting
  // existing handler functions
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
  // Ensure that the browser tiddler list object exists without overwriting an
  // existing copy.
  $tw.BrowserTiddlerList = $tw.BrowserTiddlerList || {};

  var sendAck = function (data) {
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
    $tw.CreateSettingsTiddlers(data.wiki);
    $tw.connections[data.source_connection].wikiName = data.wiki;
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
    var message = {};
    //var message = {type: 'pong'};
    Object.keys(data).forEach(function (key) {
      message[key] = data[key];
    })
    message.type = 'pong';
    if (data.heartbeat) {
      message.heartbeat = true;
    }
    // When the server receives a ping it sends back a pong.
    var response = JSON.stringify(message);
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
          var prefix = data.wiki || '';
          var internalTitle = '{'+data.wiki+'}'+data.tiddler.fields.title;
          // Set the saved tiddler as no longer being edited. It isn't always
          // being edited but checking eacd time is more complex than just
          // always setting it this way and doesn't benifit us.
          $tw.nodeMessageHandlers.cancelEditingTiddler({tiddler:{fields:{title:data.tiddler.fields.title}}, wiki: prefix});
          // If we are not expecting a save tiddler event than save the
          // tiddler normally.
          if (!$tw.boot.files[internalTitle]) {
            $tw.syncadaptor.saveTiddler(data.tiddler, prefix);
          } else {
            // If changed send tiddler
            var changed = true;
            try {
              if (data.tiddler.fields._canonical_uri) {
                var tiddlerObject = $tw.loadTiddlersFromFile($tw.boot.files[internalTitle].filepath+'.meta');
              } else {
                var tiddlerObject = $tw.loadTiddlersFromFile($tw.boot.files[internalTitle].filepath);
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
          delete $tw.Bob.EditingTiddlers[internalTitle];
          $tw.Bob.UpdateEditingTiddlers(false);
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
    var title = data.tiddler.fields.title;
    if (title) {
      // Delete the tiddler file from the file system
      $tw.syncadaptor.deleteTiddler(title, {wiki: data.wiki});
      // Set the wiki as modified
      $tw.Bob.Wikis[data.wiki].modified = true;
      // Remove the tiddler from the list of tiddlers being edited.
      var internalTitle = '{'+data.wiki+'}'+title;
      if ($tw.Bob.EditingTiddlers[internalTitle]) {
        delete $tw.Bob.EditingTiddlers[internalTitle];
        $tw.Bob.UpdateEditingTiddlers(false);
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
    var title = data.tiddler.fields.title;
    if (title) {
      // Add the tiddler to the list of tiddlers being edited to prevent
      // multiple people from editing it at the same time.
      var internalTitle = '{'+data.wiki+'}'+title;
      $tw.Bob.UpdateEditingTiddlers(internalTitle);
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
    var title = data.tiddler.fields.title;
    if (title) {
      // Make sure that the tiddler title is a string
      if (title.startsWith("Draft of '")) {
        title = title.slice(10,-1);
      }
      var internalName = '{'+data.wiki+'}' + title;
      // Remove the current tiddler from the list of tiddlers being edited.
      if ($tw.Bob.EditingTiddlers[internalName]) {
        delete $tw.Bob.EditingTiddlers[internalName];
      }
      $tw.Bob.UpdateEditingTiddlers(false);
    }
    // Acknowledge the message.
    sendAck(data);
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
  */
  $tw.nodeMessageHandlers.syncChanges = function(data) {
    // Make sure that the wiki that the syncing is for is actually loaded
    // TODO make sure that this works for wikis that are under multiple levels
    $tw.ServerSide.loadWiki(data.wiki, $tw.settings.wikis[data.wiki]);
    // Make sure that the server history exists
    $tw.Bob.ServerHistory = $tw.Bob.ServerHistory || {};
    $tw.Bob.ServerHistory[data.wiki] = $tw.Bob.ServerHistory[data.wiki] || [];
    // Get the received message queue
    var queue = [];
    try {
      queue = JSON.parse(data.changes);
    } catch (e) {
      console.log("Can't parse server changes!!");
    }
    // Only look at changes more recent than when the browser disconnected
    var recentServer = $tw.Bob.ServerHistory[data.wiki].filter(function(entry) {
      return entry.timestamp > data.since;
    })
    var conflicts = [];
    // Iterate through the received queue
    queue.forEach(function(messageData) {
      // Find the serverEntry for the tiddler the current message is for, if
      // any.
      var serverEntry = recentServer.find(function(entry) {
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
          var tempTid = JSON.parse(JSON.stringify(messageData.message.tiddler));
          tempTid.fields.title = messageData.title;
          var serverTiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(tempTid.fields.title);
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
        var message = {type: messageData.type, wiki: data.wiki}
        if (messageData.type === 'saveTiddler') {
          var longTitle = messageData.title;
          var tempTid = $tw.Bob.Wiki[data.wiki].wiki.getTiddler(longTitle);
          var tiddler = JSON.parse(JSON.stringify(tempTid));
          tiddler.fields.title = messageData.title;
          // Making the copy above does something that breaks the date fields
          if (tempTid.fields.created) {
            tiddler.fields.created = $tw.utils.stringifyDate(tempTid.fields.created);
          }
          if (tempTid.fields.modified) {
            tiddler.fields.modified = $tw.utils.stringifyDate(tempTid.fields.modified);
          }
        } else {
          var tiddler = {fields:{title:messageData.title}}
        }
        message.tiddler = tiddler;
        $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
      }
    });
    // Then do something with the conflicts
    // I think that we need a new message, something like 'conflictingEdits'
    // that sends the tiddler info from the server to the browser and the
    // browser takes care of the rest.
    conflicts.forEach(function(title) {
      var serverEntry = recentServer.find(function(entry) {
        return entry.title === title;
      });
      if (serverEntry) {
        var message;
        if (serverEntry.type === 'saveTiddler') {
          var longTitle = serverEntry.title;
          var tiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(longTitle);
          message = {type: 'conflict', message: 'saveTiddler', tiddler: tiddler, wiki: data.wiki};
        } else if (serverEntry.type === 'deleteTiddler') {
          message = {type: 'conflict', message: 'deleteTiddler', tiddler: {fields:{title:serverEntry.title}}, wiki: data.wiki};
        }
        if (message) {
          $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
        }
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
  }

  /*
    This lets us shutdown the server from within the wiki.
  */
  $tw.nodeMessageHandlers.shutdownServer = function(data) {
    console.log('Shutting down server.');
    // TODO figure out if there are any cleanup tasks we should do here.
    // Sennd message to parent saying server is shutting down
    process.exit();
  }

  /*
    This updates the settings.json file based on the changes that have been made
    in the browser.
    TODO update this to work with child wikis
  */
  $tw.nodeMessageHandlers.saveSettings = function(data) {
    if (!path) {
      var path = require('path');
      var fs = require('fs');
    }
    var prefix = data.wiki;
    // Get first tiddler to start out
    var tiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler('$:/WikiSettings/split');
    var settings = JSON.stringify(buildSettings(tiddler, prefix), "", 2);
    // Update the settings tiddler in the wiki.
    var tiddlerFields = {
      title: '$:/WikiSettings',
      text: settings,
      type: 'application/json'
    };
    // Add the tiddler
    $tw.Bob.Wikis[data.wiki].wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
    // Push changes out to the browsers
    $tw.Bob.SendToBrowsers({type: 'saveTiddler', tiddler: {fields: tiddlerFields}, wiki: data.wiki});
    // Save the updated settings
    var userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
    if (!fs.existsSync(userSettingsPath)) {
      // Create the settings folder
      fs.mkdirSync(userSettingsPath);
    }
    fs.writeFile(userSettingsPath, settings, {encoding: "utf8"}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log('Wrote settings file')
      }
    });
    // Update the $tw.settings object
    // First clear the settings
    $tw.settings = {};
    // Put the updated version in.
    $tw.updateSettings($tw.settings, JSON.parse(settings));

    $tw.CreateSettingsTiddlers();
  }

  function buildSettings (tiddler, prefix) {
    var settings = {};
    if (tiddler) {
      if (tiddler.fields) {
        var object = (typeof tiddler.fields.text === 'string')?JSON.parse(tiddler.fields.text):tiddler.fields.text;
        Object.keys(object).forEach(function (field) {
          if (typeof object[field] === 'string' || typeof object[field] === 'number') {
            if (String(object[field]).startsWith('$:/WikiSettings/split')) {
              // Recurse!
              var newTiddler = $tw.Bob.Wikis[prefix].wiki.getTiddler(object[field]);
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
  var scriptQueue = {};
  var scriptActive = {};
  var childproc = false;
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
            var splitThing = $tw.settings.scripts[data.name].split(" ");
            var command = splitThing.shift(),
            args = splitThing || [],
            options = {
              cwd: process.cwd(),
              detached: false,
              stdio: "inherit"
            };
            // If a command has an item that matches a property in the input
            // object than replace it with the value from the input object.
            Object.keys(data).forEach(function(item) {
              var index = args.indexOf(item);
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
  }
  // Stop any currently running script queues
  $tw.nodeMessageHandlers.stopScripts = function (data) {
    data.queue = data.queue || 0;
    clearQueue(data.queue);
  }

  // This updates what wikis are being served and where they are being served
  $tw.nodeMessageHandlers.updateRoutes = function (data) {
    // This is only usable on the root wiki!
    if (data.wiki === 'RootWiki') {
      // Then clear all the routes to the non-root wiki
      $tw.httpServer.clearRoutes();
      // The re-add all the routes from the settings
      // This reads the settings so we don't need to give it any arguments
      $tw.httpServer.addOtherRoutes();
    }
  }

  // This builds a single file html version of the current wiki.
  // This is a modified version of the renderTiddler command.
  // It can exclude tiddlers from the wiki using a filter and it can include
  // tiddlers form any served wiki.
  $tw.nodeMessageHandlers.buildHTMLWiki = function (data) {
    var path = require('path');
    var fs = require('fs');
    var wikiPath, fullName, excludeList = [];
    if (data.buildWiki) {
      var exists = $tw.ServerSide.loadWiki(data.buildWiki, $tw.settings.wikis[data.buildWiki]);
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
      var defaultExclude = $tw.Bob.Wikis[fullName].wiki.filterTiddlers('[prefix[$:/plugins/OokTech/Bob/]][[$:/plugins/OokTech/Bob]][prefix[$:/WikiSettings]][prefix[$:/Bob/]][[$:/ServerIP]][[$:/plugins/tiddlywiki/filesystem]][[$:/plugins/tiddlywiki/tiddlyweb]]');
      excludeList = excludeList.concat(defaultExclude);
    }
    if (wikiPath) {
      var outputFolder = data.outputFolder || 'output';
      var outputName = data.outputName || 'index.html';
      var outputFile = path.resolve(wikiPath, outputFolder, outputName);
      $tw.utils.createFileDirectories(outputFile);
      var tempWiki = new $tw.Wiki();
      var wikiTiddlers = $tw.Bob.Wikis[fullName].tiddlers.concat($tw.Bob.Wikis[fullName].plugins.concat($tw.Bob.Wikis[fullName].themes)).filter(function(tidInfo) {
        return (excludeList.indexOf(tidInfo) === -1)
      })
      $tw.Bob.Wikis[fullName].wiki.allTitles().forEach(function(title) {
        if (excludeList.indexOf(title) === -1) {
          tempWiki.addTiddler($tw.Bob.Wikis[fullName].wiki.getTiddler(title));
        }
      })
      // If there are external tiddlers to add try and add them
      if (data.externalTiddlers) {
        try {
          var externalData = JSON.parse(data.externalTiddlers);
          Object.keys(externalData).forEach(function(wikiTitle) {
            var exists = $tw.ServerSide.loadWiki(wikiTitle, $tw.settings.wikis[wikiTitle]);
            if (exists) {
              var includeList = $tw.Bob.Wikis[wikiTitle].wiki.filterTiddlers(externalData[wikiTitle]);
              includeList.forEach(function(tiddlerTitle) {
                tempWiki.addTiddler($tw.Bob.Wikis[wikiTitle].wiki.getTiddler(tiddlerTitle));
              })
            }
          });
        } catch (e) {
          console.log("Couldn't parse externalTiddlers input")
        }
      }
      tempWiki.registerPluginTiddlers("plugin",["$:/core"]);
      // Unpack plugin tiddlers
  	  tempWiki.readPluginInfo();
      tempWiki.unpackPluginTiddlers();
      var text = tempWiki.renderTiddler('text/plain',"$:/core/save/all", {variables:{wikiTiddlers:$tw.utils.stringifyList(tempWiki.allTitles())}});
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
  }

  /*
    This lets you select a wiki html file and split it into individual tiddlers
    and create a new node wiki for it.
    It also adds the new wiki to the list of wikis served.

    Rather than mess around with parsing html in node I am going to have this
    parse the html file into tiddlers in the browser and then send them to this
    message. This also means that this can be used to make a wiki out of a sub-set of tiddlers from an existing wiki, or from different wikis.
    TODO make this keep track of where the original wiki is so we can overwrite
    the original wiki when saving this one.

    inputs:
    data.filePath - the path to the single file html wiki to split up.
    data.wikisPath - the path to where the node wiki should be saved.
    data.wikiFolder - the folder to hold the wikis
    data.wikiName - the name to give the node version of the wiki
  */
  $tw.nodeMessageHandlers.newWikiFromTiddlers = function (data) {
    // Do nothing unless there is an input file path given
//    if (data.filePath) {
    if (data.tiddlers) {
      var path = require('path');
      var fs = require('fs')
      var wikiName, wikiTiddlersPath, basePath;
      var wikiFolder = data.wikiFolder || "Wikis";
      // If there is no wikiname given create one
      if (data.wikiName) {
        // If a name is given use it
        wikiName = GetWikiName(data.wikiName, 0);
      } else {
        // Otherwise create a new wikiname
        wikiName = GetWikiName("NewWiki", 0);
      }
      // If there is no output path given use a default one
      if (data.wikisPath) {
        basePath = data.wikisPath;
      } else {
        basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
      }

      // First copy the empty edition to the wikiPath to make the
      // tiddlywiki.info
      var params = {"wiki": "", "basePath": basePath, "wikisFolder": wikiFolder, "edition": "empty", "path": wikiName, "wikiName": wikiName};
      $tw.nodeMessageHandlers.createNewWiki(params);
      // Get the folder for the wiki tiddlers
      wikiTiddlersPath = path.join(basePath, wikiFolder, wikiName, 'tiddlers');
      // Make sure tiddlers folder exists
      try {
        fs.mkdirSync(wikiTiddlersPath);
        console.log('Created Tiddlers Folder ', wikiTiddlersPath);
      } catch (e) {
        console.log('Tiddlers Folder Exists');
      }
      // Then split the wiki into separate tidders
      //var tiddlers = $tw.loadTiddlersFromFile(data.filePath),
      var count = 0;
      $tw.utils.each(data.tiddlers,function(tiddler) {
        // Save each tiddler in the correct folder
        // Get the tiddler file title
        var tiddlerFileName = $tw.syncadaptor.generateTiddlerBaseFilepath(tiddler.title, wikiName);
        // Output file name
        var outputFile = path.join(wikiTiddlersPath, tiddlerFileName);
        var options = {
          "currentTiddler": tiddler.title
        };
        var text = $tw.Bob.Wikis[wikiName].wiki.renderTiddler('text/plain','$:/core/templates/tid-tiddler', options);
        // Save each tiddler as a file in the appropriate place
        fs.writeFile(outputFile,text,"utf8",function(err) {
          if (err) {
            console.log(err);
          }
        });
        count++;
      });
      if(!count) {
        console.log("No tiddlers found in the input file");
      } else {
        // Add the new wiki to the list of served wikis
        // TODO this!!
      }
    } else {
      console.log('No path given!');
    }
  }

  /*
    This ensures that the wikiName used is unique by appending a number to the
    end of the name and incrementing the number if needed until an unused name
    is created.
  */
  function GetWikiName (wikiName, count) {
    var updatedName;
    // If the wikiName is usused than return it
    if (!$tw.settings.wikis[wikiName]) {
      return wikiName;
    } else {
      // Try the next name and recurse
      if (wikiName.endsWith(count)) {
        // If the name ends in a number increment it
        wikiName = wikiName.slice(0, -1*String(count).length);
        count = Number(count) + 1;
        updatedName = wikiName + String(count);
      } else {
        // If the name doesn't end in a number than add a 1 to start out.
        count = Number(count) + 1;
        updatedName = wikiName + String(count);
      }
      return GetWikiName(updatedName, count);
    }
  }

  // This is just a copy of the init command modified to work in this context
  $tw.nodeMessageHandlers.createNewWiki = function (data) {
    if (data.wiki === 'RootWiki') {
      var fs = require("fs"),
        path = require("path");

      function specialCopy (source, destination) {
        fs.mkdirSync(destination);
        var currentDir = fs.readdirSync(source)
        currentDir.forEach(function (item) {
          if (fs.statSync(path.join(source, item)).isFile()) {
            var fd = fs.readFileSync(path.join(source, item), {encoding: 'utf8'});
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
      var basePath = data.basePath || path.join($tw.boot.wikiPath, '..')

      try {
        fs.mkdirSync(path.join(basePath, data.wikisFolder));
        console.log('Created Wikis Folder');
      } catch (e) {
        console.log('Wikis Folder Exists');
      }
      // This is the path given by the person making the wiki, it needs to be
      // relative to the basePath
      // data.wikisFolder is an optional sub-folder to use. If it is set to
      // Wikis than wikis created will be in the basepath/Wikis/relativePath
      // folder
      // I need better names here.
      var relativePath = path.join(data.wikisFolder, data.path);
      var fullPath = path.join(basePath, relativePath)
      var tiddlersPath = path.join(fullPath, 'tiddlers')
      // For now we only support creating wikis with one edition, multi edition
      // things like in the normal init command can come later.
      var editionName = data.edition?data.edition:"empty";
      var searchPaths = $tw.getLibraryItemSearchPaths($tw.config.editionsPath,$tw.config.editionsEnvVar);
      if (process.pkg) {
        var editionPath = $tw.findLibraryItem(editionName,searchPaths);
        if(!$tw.utils.isDirectory(editionPath)) {
          //var editionPath = undefined
          editionPath = undefined
          var pluginPath = process.pkg.path.resolve("./editions","./" + editionName)
          if(true || fs.existsSync(pluginPath) && fs.statSync(pluginPath).isDirectory()) {
            editionPath = pluginPath;
          }
          if (editionPath) {
            specialCopy(editionPath, fullPath);
            console.log("Copied edition '" + editionName + "' to " + fullPath + "\n");
          } else {
            console.log("Edition not found");
          }
        } else if ($tw.utils.isDirectory(editionPath)) {
          // Copy the edition content
          var err = $tw.utils.copyDirectory(editionPath,fullPath);
          if(!err) {
            console.log("Copied edition '" + editionName + "' to " + fullPath + "\n");
          } else {
            console.log(err);
          }
        }
      } else {
        // Check the edition exists
        var editionPath = $tw.findLibraryItem(editionName,searchPaths);
        if(!$tw.utils.isDirectory(editionPath)) {
          console.log("Edition '" + editionName + "' not found");
        }
        // Copy the edition content
        var err = $tw.utils.copyDirectory(editionPath,fullPath);
        if(!err) {
          console.log("Copied edition '" + editionName + "' to " + fullPath + "\n");
        } else {
          console.log(err);
        }
      }
      // Tweak the tiddlywiki.info to remove any included wikis
      var packagePath = path.join(fullPath, "tiddlywiki.info");
      var packageJson = JSON.parse(fs.readFileSync(packagePath));
      delete packageJson.includeWikis;
      fs.writeFileSync(packagePath,JSON.stringify(packageJson,null,$tw.config.preferences.jsonSpaces));

      // We need to make sure that the wikis entry is in the root settings
      // thing.
      var tidText = {};
      var tiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler('$:/WikiSettings/split');
      if (tiddler) {
        if (typeof tiddler.fields.text === 'object') {
          // Clone object to make it writable
          tidText = JSON.parse(JSON.stringify(tiddler.fields.text));
        } else {
          tidText = JSON.parse(tiddler.fields.text);
        }
      }
      tidText['wikis'] = tidText['wikis'] || '$:/WikiSettings/split/wikis';

      $tw.Bob.Wikis[data.wiki].wiki.addTiddler(new $tw.Tiddler({title:'$:/WikiSettings/split', text:tidText, type: 'application/json'}));
      $tw.Bob.SendToBrowsers({type: 'saveTiddler', tiddler: {fields: {title:'$:/WikiSettings/split', text:JSON.stringify(tidText, "", $tw.config.preferences.jsonSpaces), type: 'application/json'}}, wiki: 'RootWiki'});

      var tiddlerText = $tw.Bob.Wikis[data.wiki].wiki.getTiddlerText('$:/WikiSettings/split/wikis')

      tiddlerText = tiddlerText?tiddlerText:"{}";
      var currentWikis = JSON.parse(tiddlerText);
      // Get desired name for the new wiki
      var name = data.wikiName || 'newWiki';
      // Make sure we have a unique name by appending a number to the wiki name
      // if it exists.
      if (currentWikis[name]) {
        var i = 0;
        var newName = name;
        while (currentWikis[newName]) {
          i = i + 1;
          newName = name + i;
        }
        name = name + i;
      }

      // Use relative paths here.
      // Note this that is dependent on process.cwd()!!
      var rootPath = process.pkg?path.dirname(process.argv[0]):process.cwd();
      currentWikis[name] = '.' + path.sep + path.relative(rootPath, fullPath);

      var tiddlerFields = {
        title: '$:/WikiSettings/split/wikis',
        text: JSON.stringify(currentWikis, null, $tw.config.preferences.jsonSpaces),
        type: 'application/json'
      };
      // Add the tiddler
      $tw.Bob.Wikis[data.wiki].wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
      // Push changes out to the browsers
      $tw.Bob.SendToBrowsers({type: 'saveTiddler', tiddler: {fields: tiddlerFields}, wiki: 'RootWiki'});

      // Update the settings
      $tw.nodeMessageHandlers.saveSettings({wiki: 'RootWiki'});

      // This is here as a hook for an external server. It is defined by the
      // external server and shouldn't be defined here or it will break
      // If you are not using an external server than this does nothing
      if ($tw.ExternalServer) {
        if (typeof $tw.ExternalServer.initialiseWikiSettings === 'function') {
          $tw.ExternalServer.initialiseWikiSettings(name, data);
        }
      }

      // Then clear all the routes to the non-root wiki
      $tw.httpServer.clearRoutes();
      // The re-add all the routes from the settings
      // This reads the settings so we don't need to give it any arguments
      $tw.httpServer.addOtherRoutes();
    }
  }

  /*
    This unloads a wiki from memory.
    This can be used to reduce the memory footprint and to fully reload a wiki.

    It needs to remove everything under $tw.Bob.Wikis[data.wikiName] for the
    wiki. And it also need to find all of the tiddlers for the wiki and remove
    them. But I don't know how to do that without deleting the tiddlers.
  */
  $tw.nodeMessageHandlers.unloadWiki = function (data) {
    console.log('Unload wiki ', data.wikiName)
    // make sure that there is a wiki name given.
    if (data.wikiName) {
      // Make sure that the wiki is loaded
      if ($tw.Bob.Wikis[data.wikiName]) {
        if ($tw.Bob.Wikis[data.wikiName].State === 'loaded') {
          // If so than unload the wiki
          // This removes the information about the wiki and the wiki object
          delete $tw.Bob.Wikis[data.wikiName];
          // This removes all the info about the files for the wiki
          var key;
          var result = {};
          for (key in $tw.boot.files) {
            if (typeof key === 'string' && !key.startsWith('{'+data.wikiName+'}')) {
              result[key] = $tw.boot.files[key];
            }
          }
          $tw.boot.files = result;
        }
      }
      $tw.Bob.DisconnectWiki(data.wikiName);
    }
  }

  /*
    Determine if the token is authorised to view the wiki
  */
  function canAccess(token, wiki) {
    return true
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
    var authorised = canAccess(data.token, data.fromWiki)
    if (authorised) {
      // Make sure that the wiki is listed
      if ($tw.settings.wikis[data.fromWiki]) {
        // If the wiki isn't loaded than load it
        if (!$tw.Bob.Wikis[data.fromWiki]) {
          $tw.ServerSide.loadWiki(data.fromWiki, $tw.settings.wikis[data.fromWiki]);
        } else if ($tw.Bob.Wikis[data.fromWiki].State !== 'loaded') {
          $tw.ServerSide.loadWiki(data.fromWiki, $tw.settings.wikis[data.fromWiki]);
        }
        // Make sure that the wiki exists and is loaded
        if ($tw.Bob.Wikis[data.fromWiki]) {
          if ($tw.Bob.Wikis[data.fromWiki].State === 'loaded') {
            // The list of tidddlers that are returned by the filter
            var list = $tw.Bob.Wikis[data.fromWiki].wiki.filterTiddlers(data.filter);
            // Add the results to the current wiki
            // Each tiddler gets added to the requesting wiki
            var message
            list.forEach(function(tidTitle){
              // Get the current tiddler
              var tiddler = $tw.Bob.Wikis[data.fromWiki].wiki.getTiddler(tidTitle);
              // Transform the tiddler title if a transfom filter is given
              if (data.transformFilter) {
                var transformedTitle = ($tw.Bob.Wikis[data.fromWiki].wiki.filterTiddlers(data.transformFilter, null, $tw.Bob.Wikis[data.fromWiki].wiki.makeTiddlerIterator([tidTitle])) || [""])[0];
                if(transformedTitle) {
                  tiddler = new $tw.Tiddler(tiddler,{title: transformedTitle});
                }
              }
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
            var importListTiddler = {
              fields: {
                title: '$:/status/Bob/importlist',
                tags: [],
                list: list
              }
            }
            message = {type: 'saveTiddler', tiddler: importListTiddler, wiki: data.wiki}
            $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
          }
        }
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
    if (data.plugin) {
      const fs = require('fs')
      const path = require('path')
      var pluginTiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(data.plugin)
      if (pluginTiddler) {
        var pluginName = data.plugin.replace(/^\$:\/plugins\//, '')
        var pluginFolderPath = path.resolve($tw.settings.pluginsPath, pluginName)
        var pluginInfoPath = path.join(pluginFolderPath, 'plugin.info')
        var isNewVersion = true
        // Check if the plugin folder exists
        if (fs.existsSync(pluginInfoPath)) {
          // If it does exist than check versions, only save new or equal
          // versions
          // Load the plugin.info file and check the version
          var oldInfo
          try {
            oldInfo = JSON.parse(fs.readFileSync(pluginInfoPath, 'utf8'))
          } catch (e) {
            //Something
            console.log(e)
          }
          if (oldInfo) {
            // Check the version here
            var oldVersion = $tw.utils.parseVersion(oldInfo.version)
            var newVersion = $tw.utils.parseVersion(pluginTiddler.fields.version)
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
          var error = $tw.utils.createDirectory(pluginFolderPath);
        }
        if (isNewVersion) {
          // Save the plugin tiddlers
          Object.keys(JSON.parse(pluginTiddler.fields.text).tiddlers).forEach(function(title) {
            var content = $tw.Bob.Wikis[data.wiki].wiki.renderTiddler("text/plain", "$:/core/templates/tid-tiddler", {variables: {currentTiddler: title}});
            var fileExtension = '.tid'
            var filepath = path.join(pluginFolderPath, $tw.syncadaptor.generateTiddlerBaseFilepath(title, data.wiki) + fileExtension);
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
          var pluginInfo = {}
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
  }

  /*
    This sends a list of all available plugins to the wiki
  */
  $tw.nodeMessageHandlers.getPluginList = function (data) {
    var pluginNames = $tw.utils.getPluginInfo();
    var fields = {
      title: '$:/Bob/AvailablePluginList',
      list: $tw.utils.stringifyList(Object.keys(pluginNames))
    }
    var tiddler = {fields: fields}
    var message = {type: 'saveTiddler', tiddler: tiddler, wiki: data.wiki}
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
  }

  /*
    This loads the tiddlywiki.info and if new versions are given it updates the
    description, list of plugins, themes and languages
  */
  $tw.nodeMessageHandlers.updateTiddlyWikiInfo = function (data) {
    if (data.wiki) {
      const path = require('path')
      const fs = require('fs')
      var wikiInfoPath = path.join($tw.Bob.Wikis[data.wiki].wikiPath, 'tiddlywiki.info');
      try {
        var wikiInfo = JSON.parse(fs.readFileSync(wikiInfoPath,"utf8"));
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
      fs.writeFileSync(wikiInfoPath, JSON.stringify(wikiInfo, null, 4))
    }
  }

  /*
    This handles ack messages.
  */
  $tw.nodeMessageHandlers.ack = $tw.Bob.Shared.handleAck;

}
})()
