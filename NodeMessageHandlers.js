/*\
title: $:/plugins/OokTech/MultiUser/NodeMessageHandlers.js
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

// This lets you add to the $tw.nodeMessageHandlers object without overwriting
// existing handler functions
$tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
// Ensure that the browser tiddler list object exists without overwriting an
// existing copy.
$tw.BrowserTiddlerList = $tw.BrowserTiddlerList || {};

/*
  This handles when the browser sends the list of all tiddlers that currently
  exist in the browser version of the wiki. This is different than the list of
  all tiddlers in files.
*/
$tw.nodeMessageHandlers.browserTiddlerList = function(data) {
  // Save the list of tiddlers in the browser as part of the $tw object so it
  // can be used elsewhere.
  $tw.BrowserTiddlerList[data.source_connection] = data.titles;
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
  var message = {type: 'pong'};
  Object.keys(data).forEach(function (key) {
    message[key] = data[key];
  })
  // When the server receives a ping it sends back a pong.
  var response = JSON.stringify(message);
  $tw.connections[data.source_connection].socket.send(response);
}

/*
  This handles saveTiddler messages sent from the browser.

  TODO: Determine if we always want to ignore draft tiddlers.
*/
$tw.nodeMessageHandlers.saveTiddler = function(data) {
  // Make sure there is actually a tiddler sent
  if (data.tiddler) {
    // Make sure that the tiddler that is sent has fields
    if (data.tiddler.fields) {
      // Ignore draft tiddlers
      if (!data.tiddler.fields['draft.of']) {
        // Set the saved tiddler as no longer being edited. It isn't always
        // being edited but checking eacd time is more complex than just always
        // setting it this way and doesn't benifit us.
        $tw.nodeMessageHandlers.cancelEditingTiddler({data:data.tiddler.fields.title});
        // Make sure that the waitinhg list object has an entry for this
        // connection
        $tw.MultiUser.WaitingList[data.source_connection] = $tw.MultiUser.WaitingList[data.source_connection] || {};
        // Check to see if we are expecting a save tiddler message from this
        // connection for this tiddler.
        if (!$tw.MultiUser.WaitingList[data.source_connection][data.tiddler.fields.title]) {
          // If we are not expecting a save tiddler event than save the tiddler
          // normally.
          console.log('Node Save Tiddler');
          if (!$tw.boot.files[data.tiddler.fields.title]) {
            $tw.syncadaptor.saveTiddler(data.tiddler);
          } else {
            // If changed send tiddler
            var changed = true;
            try {
              var tiddlerObject = $tw.loadTiddlersFromFile($tw.boot.files[data.tiddler.fields.title].filepath);
              changed = $tw.syncadaptor.TiddlerHasChanged(data.tiddler, tiddlerObject);
            } catch (e) {
              console.log(e);
            }
            if (changed) {
              $tw.syncadaptor.saveTiddler(data.tiddler);
            }
          }
        } else {
          // If we are expecting a save tiddler message than it is the browser
          // acknowledging that it received the update and we remove the entry
          // from the waiting list.
          // This is very important, without this it gets stuck in infitine
          // update loops.
          $tw.MultiUser.WaitingList[data.source_connection][data.tiddler.fields.title] = false;
        }
      }
    }
  }
}

/*
  Remove a tiddler from the waiting list.
  This is the response that a browser gives if a tiddler is sent that is
  identical to what is already on the browser.
  We use this instead of the browser sending back an update message with the
  new tiddler as a change.
*/
$tw.nodeMessageHandlers.clearStatus = function(data) {
  delete $tw.MultiUser.WaitingList[data.source_connection][data.title];
}

/*
  This is the handler for when the browser sends the deleteTiddler message.
*/
$tw.nodeMessageHandlers.deleteTiddler = function(data) {
  console.log('Node Delete Tiddler');
  // Delete the tiddler file from the file system
  $tw.syncadaptor.deleteTiddler(data.tiddler);
  // Remove the tiddler from the list of tiddlers being edited.
  if ($tw.MultiUser.EditingTiddlers[data.tiddler]) {
    delete $tw.MultiUser.EditingTiddlers[data.tiddler];
    $tw.MultiUser.UpdateEditingTiddlers(false);
  }
}

/*
  This is the handler for when a browser sends the editingTiddler message.
*/
$tw.nodeMessageHandlers.editingTiddler = function(data) {
  // Add the tiddler to the list of tiddlers being edited to prevent multiple
  // people from editing it at the same time.
  $tw.MultiUser.UpdateEditingTiddlers(data.tiddler);
}

/*
  This is the handler for when a browser stops editing a tiddler.
*/
$tw.nodeMessageHandlers.cancelEditingTiddler = function(data) {
  // This is ugly and terrible and I need to make the different soures of this
  // message all use the same message structure.
  if (typeof data.data === 'string') {
    if (data.data.startsWith("Draft of '")) {
      var title = data.data.slice(10,-1);
    } else {
      var title = data.data;
    }
  } else {
    if (data.tiddler.startsWith("Draft of '")) {
      var title = data.tiddler.slice(10,-1);
    } else {
      var title = data.tiddler;
    }
  }
  // Remove the current tiddler from the list of tiddlers being edited.
  if ($tw.MultiUser.EditingTiddlers[title]) {
    delete $tw.MultiUser.EditingTiddlers[title];
    $tw.MultiUser.UpdateEditingTiddlers(false);
  }
}

/*
  This function sets values in the settings files.
*/
$tw.nodeMessageHandlers.updateSettings = function(data) {
  if ($tw.node && !fs) {
    var fs = require('fs');
    var path = require('path');
  }
  // This should have some sort of validation
  if (typeof data === 'object') {
    // Update the settings
    $tw.updateSettings($tw.settings, JSON.parse(data.body));
    // Save the updated settings
    var userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
    var settingsFileString = JSON.stringify($tw.settings, null, 2);
    fs.writeFile(userSettingsPath, settingsFileString, {encoding: "utf8"}, function (err) {
      if (err) {
        console.log(err);
      }
    });
  }
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
    // Close http server.
    // TODO figure out how to do this properly.  we have to close all open
    // connections or it will wait to timeout before actualy closing. And the
    // socket is left open for some reason.
    $tw.httpServer.close(function () {
      console.log('Closed http server');
    });
    console.log('Restarting Server');
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
  process.exit();
}

/*
  TODO a note here about how to get a list of used ports on a linux or mac
  machine. I have no idea how to do this in windows.

  linux:
  ss -lntu | awk '{print $5}' | grep ':' | grep -o '[^:]*$' | sort -g | uniq
  osx:
  lsof -PiUDP -PiTCP -sTCP:LISTEN | awk '{print $9}' | grep ':' | grep -o '[^:]*$' | sort -g | uniq
  windows:
  ????
*/

/*
  This restarts the tiddlywiki server and loads a different wiki.
*/
$tw.nodeMessageHandlers.changeWiki = function(data) {
  if ($tw.node) {
    if (data.wikiName) {
      if ($tw.settings.wikis[data.wikiName]) {
        console.log('Switch wiki to ', data.wikiName);
        // TODO figure out how to make sure that the tiddlywiki.info file
        // exists before moving to this point

        // This bit of magic starts a new server with the wiki given in
        // data.wikiName
        // Get our commands (node and tiddlywiki)
        var nodeCommand = process.argv.shift();
        var tiddlyWikiCommand = process.argv.shift();
        // cut off the old wiki argument
        process.argv.shift();
        // Add the new wiki argument.
        process.argv.unshift($tw.settings.wikis[data.wikiName]);
        // the fork command uses the same node command to start the wiki and
        // we can use the returned object forked to send and received messages // to and from the new process. This can be used to wait until the
        // wiki is fully booted before switching to it. And other stuff.
        var forked = require('child_process').fork(tiddlyWikiCommand, process.argv, {
          cwd: process.cwd(),
          detached: false,
          stdio: "inherit"
        });
        //forked.send({server: $tw.httpServer});

        //console.log($tw.loadTiddlersFromPath($tw.settings.wikis[data.wikiName]));
      }
    }
  }
}

/*
  This updates the settings.json file based on the changes that have been made
  in the browser.
*/
$tw.nodeMessageHandlers.saveSettings = function(data) {
  if (!path) {
    var path = require('path');
    var fs = require('fs');
  }
  // Get first tiddler to start out
  var tiddler = $tw.wiki.getTiddler('$:/WikiSettings/split');
  var settings = JSON.stringify(buildSettings(tiddler), "", 2);
  // Update the settings tiddler in the wiki.
  var tiddlerFields = {
    title: '$:/WikiSettings',
    text: settings,
    type: 'application/json'
  };
  $tw.wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
  // Save the updated settings
  var userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
  fs.writeFile(userSettingsPath, settings, {encoding: "utf8"}, function (err) {
    if (err) {
      console.log(err);
    }
  });
}

function buildSettings (tiddler) {
  var settings = {};
  var object = JSON.parse(tiddler.fields.text);
  Object.keys(object).forEach(function (field) {
    if (typeof object[field] === 'string' || typeof object[field] === 'number') {
      if (String(object[field]).startsWith('$:/WikiSettings/split')) {
        // Recurse!
        var newTiddler = $tw.wiki.getTiddler(object[field]);
        settings[field] = buildSettings(newTiddler);
      } else {
        // Actual thingy!
        settings[field] = object[field];
      }
    } else {
      settings[field] = "";
    }
  });
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
*/
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
          })
          require('child_process').spawn(command, args, options);
        }
      }
    }
  }
}

})()
