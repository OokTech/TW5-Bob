/*\
title: $:/plugins/OokTech/Bob/BrowserWebSocketsSetup.js
type: application/javascript
module-type: startup

This is the browser component for the web sockets. It works with the node web
socket server, but it can be extended for use with other web socket servers.

\*/
(function () {

  /*jslint node: true, browser: true */
  /*global $tw: false */
  "use strict";

  // Export name and synchronous status
  exports.name = "web-sockets-setup";
  exports.platforms = ["browser"];
  exports.after = ["render"];
  exports.synchronous = true;

  $tw.browserMessageHandlers = $tw.browserMessageHandlers || {};

  // This is needed for IE compatibility
  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(search, pos) {
      return this.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
    };
  }

  exports.startup = function() {
    // Ensure that the needed objects exist
    $tw.Bob = $tw.Bob || {};
    $tw.Bob.MessageQueue = $tw.Bob.MessageQueue || [];
    // Import shared commands
    $tw.Bob.Shared = require('$:/plugins/OokTech/Bob/SharedFunctions.js');
    $tw.Bob.ExcludeFilter = $tw.wiki.getTiddlerText('$:/plugins/OokTech/Bob/ExcludeSync');
    // In the browser there is only one connection, so set the connection index
    var connectionIndex = 0;

    // Do all actions on startup.
    $tw.Bob.setup = function(reconnect) {
      if (reconnect) {
        $tw.connections = null;
      }
      $tw.Syncer.isDirty = false;
      var IPAddress = window.location.hostname;
      var WSSPort = window.location.port;
      var WSScheme = window.location.protocol=="https:"?"wss://":"ws://";

      $tw.connections = $tw.connections || [];
      $tw.connections[connectionIndex] = $tw.connections[connectionIndex] || {};
      $tw.connections[connectionIndex].index = connectionIndex;
      $tw.connections[connectionIndex].socket = new WebSocket(WSScheme + IPAddress +":" + WSSPort);
      $tw.connections[connectionIndex].socket.onopen = openSocket;
      $tw.connections[connectionIndex].socket.onmessage = parseMessage;
      $tw.connections[connectionIndex].socket.binaryType = "arraybuffer";

      // Get the name for this wiki for websocket messages
      var tiddler = $tw.wiki.getTiddler("$:/WikiName");
      if (tiddler) {
        $tw.wikiName = tiddler.fields.text;
      } else {
        $tw.wikiName = '';
      }

      if (!reconnect) {
        addHooks();
      }
    }
    /*
      When the socket is opened the heartbeat process starts. This lets us know
      if the connection to the server gets interrupted.
    */
    var openSocket = function() {
      console.log('Opened socket');
      var token = localStorage.getItem('ws-token');
      // Start the heartbeat process
      $tw.connections[connectionIndex].socket.send(JSON.stringify({type: 'ping', heartbeat: true, token: token, wiki: $tw.wikiName}));
    }
    /*
      This is a wrapper function, each message from the websocket server has a
      message type and if that message type matches a handler that is defined
      than the data is passed to the handler function.
    */
    var parseMessage = function(event) {
      var eventData = JSON.parse(event.data);
      if (eventData.type) {
        if (typeof $tw.browserMessageHandlers[eventData.type] === 'function') {
          $tw.browserMessageHandlers[eventData.type](eventData);
        }
      }
    }

    var sendToServer = function (message) {
      var messageData = $tw.Bob.Shared.createMessageData(message);
      // If the connection is open, send the message
      if ($tw.connections[connectionIndex].socket.readyState === 1) {
        $tw.Bob.Shared.sendMessage(messageData, 0);
      } else {
        // If the connection is not open than store the message in the queue
        var tiddler = $tw.wiki.getTiddler('$:/plugins/OokTech/Bob/Unsent');
        var queue = [];
        var start = Date.now();
        if (tiddler) {
          if (typeof tiddler.fields.text === 'string') {
            queue = JSON.parse(tiddler.fields.text);
          }
          if (tiddler.fields.start) {
            start = tiddler.fields.start;
          }
        }
        // Check to make sure that the current message is eligible to be saved
        if ($tw.Bob.Shared.messageIsEligible(messageData, 0, queue)) {
          // Prune the queue and check if the current message makes any enqueued
          // messages redundant or overrides old messages
          queue = $tw.Bob.Shared.removeRedundantMessages(messageData, queue);
          // Don't save any messages that are about the unsent list or you get
          // infinite loops of badness.
          if (messageData.title !== '$:/plugins/OokTech/Bob/Unsent') {
            queue.push(messageData);
          }
          var tiddler2 = {title: '$:/plugins/OokTech/Bob/Unsent', text: JSON.stringify(queue, '', 2), type: 'application/json', start: start};
          $tw.wiki.addTiddler(new $tw.Tiddler(tiddler2));
        }
      }
    }

    /*
      This adds actions for the different event hooks. Each hook sends a
      message to the node process.

      Some unused hooks have commented out skeletons for adding those hooks in
      the future if they are needed.
    */
    var addHooks = function() {
      if (!$tw.wikiName) {
        $tw.wikiName = '';
      }
      $tw.hooks.addHook("th-editing-tiddler", function(event) {
        var token = localStorage.getItem('ws-token')
        var message = {type: 'editingTiddler', tiddler: {fields: {title: event.tiddlerTitle}}, wiki: $tw.wikiName, token: token};
        sendToServer(message);
        // do the normal editing actions for the event
        return true;
      });
      $tw.hooks.addHook("th-cancelling-tiddler", function(event) {
        var token = localStorage.getItem('ws-token')
        var message = {type: 'cancelEditingTiddler', tiddler:{fields:{title: event.tiddlerTitle}}, wiki: $tw.wikiName, token: token};
        sendToServer(message);
        // Do the normal handling
        return event;
      });
      $tw.hooks.addHook("th-renaming-tiddler", function (event) {
        // For some reason this wasn't being handled by the generic 'change'
        // event. So the hook is here.
        console.log('renaming tiddler');
        console.log(event)
      });
      /*
        Listen out for changes to tiddlers
        This handles tiddlers that are edited directly or made using things
        like the setfield widget.
        This ignores tiddlers that are in the exclude filter
      */
    	$tw.wiki.addEventListener("change",function(changes) {
        for (var tiddlerTitle in changes) {
          // If the changed tiddler is the one that holds the exclude filter
          // than update the exclude filter.
          if (tiddlerTitle === '$:/plugins/OokTech/Bob/ExcludeSync') {
            $tw.Bob.ExcludeFilter = $tw.wiki.getTiddlerText('$:/plugins/OokTech/Bob/ExcludeSync');
          }
          var list = $tw.wiki.filterTiddlers($tw.Bob.ExcludeFilter);
          if (list.indexOf(tiddlerTitle) === -1) {
            if (changes[tiddlerTitle].modified) {
              var token = localStorage.getItem('ws-token')
              var tiddler = $tw.wiki.getTiddler(tiddlerTitle);
              if (tiddler) {
                var tempTid = {fields:{}};
                Object.keys(tiddler.fields).forEach(function (field) {
                    if (field !== 'created' && field !== 'modified') {
                      tempTid.fields[field] = tiddler.fields[field];
                    } else {
                      tempTid.fields[field] = $tw.utils.stringifyDate(tiddler.fields[field]);
                    }
                  }
                );
                var message = {type: 'saveTiddler', tiddler: tempTid, wiki: $tw.wikiName, token: token};
                sendToServer(message);
              }
            } else if (changes[tiddlerTitle].deleted) {
              var token = localStorage.getItem('ws-token')
              var message = {type: 'deleteTiddler', tiddler:{fields:{title:tiddlerTitle}} , wiki: $tw.wikiName, token: token};
              sendToServer(message);
            }
          } else {
            // Stop the dirty indicator from turning on.
            $tw.utils.toggleClass(document.body,"tc-dirty",false);
          }
        }
    	});

      $tw.Bob.Reconnect = function (sync) {
        if ($tw.connections[0].socket.readyState !== 1) {
          $tw.Bob.setup();
          if (sync) {
            $tw.Bob.syncToServer();
          }
        }
      }
      $tw.Bob.syncToServer = function () {
        // Use a timeout to ensure that the websocket is ready
        if ($tw.connections[0].socket.readyState !== 1) {
          setTimeout($tw.Bob.syncToServer, 100)
          console.log('waiting')
        } else {
          /*
          // The process here should be:

            Send the full list of changes from the browser to the server in a
            special message
            The server determines if any conflicts exist and marks the tiddlers as appropriate
            If there are no conflicts than it just applies the changes from the browser/server
            If there are than it marks the tiddler as needing resolution and both versions are made available
            All connected browsers now see the tiddlers marked as in conflict and resolution is up to the people

            This message is sent to the server, once the server receives it it respons with a special ack for it, when the browser receives that it deletes the unsent tiddler

            What is a conflict?

            If both sides say to delete the same tiddler there is no conflict
            If one side says save and the othre delete there is a conflict
            if both sides say save there is a conflict if the two saved versions
            aren't the same.
          */
          // Get the tiddler with the info about local changes
          var tiddler = $tw.wiki.getTiddler('$:/plugins/OokTech/Bob/Unsent');
          // Ask the server for a listing of changes since the browser was
          // disconnected
          var token = localStorage.getItem('ws-token');
          var message = {type: 'syncChanges', since: tiddler.fields.start, changes: tiddler.fields.text, wiki: $tw.wikiName, token: token};
          sendToServer(message);
        }
      }
      /*
        Below here are skeletons for adding new actions to existing hooks.
        None are needed right now but the skeletons may help later.

        Other available hooks are:
        th-importing-tiddler
        th-relinking-tiddler
        th-renaming-tiddler
      */
      /*
        This handles the hook for importing tiddlers.
      */
      /*
      $tw.hooks.addHook("th-importing-tiddler", function (tiddler) {
        return tiddler;
      });
      */
      /*
        For the th-saving-tiddler hook send the saveTiddler message along with
        the tiddler object.
      */
      /*
      $tw.hooks.addHook("th-saving-tiddler",function(tiddler) {
        // do the normal saving actions for the event
        return tiddler;
      });
      */
      /*
        For the th-deleting-tiddler hook send the deleteTiddler message along
        with the tiddler object.
      */
      /*
      $tw.hooks.addHook("th-deleting-tiddler",function(tiddler) {
        // do the normal deleting actions for the event
        return true;
      });
      */
      /*
      $tw.hooks.addHook("th-new-tiddler", function(event) {
        console.log("new tiddler hook: ", event);
        return event;
      })
      $tw.hooks.addHook("th-navigating", function(event) {
        console.log("navigating event: ",event);
        return event;
      })
      */
    }
    // Send the message to node using the websocket
    $tw.Bob.setup();
  }
})();
