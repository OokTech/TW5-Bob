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
    function setup() {
      $tw.Syncer.isDirty = false;
      var IPTiddler = $tw.wiki.getTiddler("$:/WikiSettings/split/ws-server");
      try {
        var output = JSON.parse(IPTiddler.fields.text);
      } catch (e) {
        var output = {};
      }
      var IPAddress = window.location.hostname;
      var WSSPort = output.wssport;
      var WSScheme = window.location.protocol=="https:"?"wss://":"ws://";

      $tw.connections = $tw.connections || [];
      $tw.connections[connectionIndex] = $tw.connections[connectionIndex] || {};
      $tw.connections[connectionIndex].index = connectionIndex;
      $tw.connections[connectionIndex].active = true;
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

      addHooks();
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
      var id = $tw.Bob.Shared.makeId();
      message.id = id;
      var messageData = {
        message: message,
        id: id,
        time: Date.now(),
        ack: {}
      };
      // If the connection is open, send the message
      if ($tw.connections[connectionIndex].socket.readyState === 1) {
        $tw.Bob.Shared.sendMessage(messageData, 0);
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
        var message = {type: 'editingTiddler', tiddler: event.tiddlerTitle, wiki: $tw.wikiName, token: token};
        sendToServer(message);
        // do the normal editing actions for the event
        return true;
      });
      $tw.hooks.addHook("th-cancelling-tiddler", function(event) {
        var token = localStorage.getItem('ws-token')
        var message = {type: 'cancelEditingTiddler', tiddler: event.tiddlerTitle, wiki: $tw.wikiName, token: token};
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
              var message = {type: 'deleteTiddler', tiddler: tiddlerTitle, wiki: $tw.wikiName, token: token};
              sendToServer(message);
            }
          } else {
            // Stop the dirty indicator from turning on.
            $tw.utils.toggleClass(document.body,"tc-dirty",false);
          }
        }
    	});
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
    setup();
  }
})();
