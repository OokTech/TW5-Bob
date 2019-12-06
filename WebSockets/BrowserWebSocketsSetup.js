/*\
title: $:/plugins/OokTech/Bob/BrowserWebSocketsSetup.js
type: application/javascript
module-type: old-startup

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

  exports.startup = function() {
    // Ensure that the needed objects exist
    $tw.Bob = $tw.Bob || {};
    // Import shared commands
    $tw.Bob.Shared = require('$:/plugins/OokTech/Bob/SharedFunctions.js');
    $tw.Bob.ExcludeFilter = $tw.wiki.getTiddlerText('$:/plugins/OokTech/Bob/ExcludeSync');
    // In the browser there is only one connection, so set the connection index
    const connectionIndex = 0;

    // Do all actions on startup.
    $tw.Bob.setup = function(reconnect) {
      // Add a message that the wiki isn't connected yet
      const text = "<div  style='position:fixed;bottom:0px;width:100%;background-color:red;height:1.5em;max-height:100px;text-align:center;vertical-align:center;color:white;'>''WARNING: The connection to server hasn't been established yet.''</div>";
      const warningTiddler = {
        title: '$:/plugins/OokTech/Bob/Server Warning',
        text: text,
        tags: '$:/tags/PageTemplate'
      };
      $tw.wiki.addTiddler(new $tw.Tiddler(warningTiddler));
      if(reconnect) {
        $tw.connections = null;
      }
      const proxyPrefixTiddler = $tw.wiki.getTiddler('$:/ProxyPrefix');
      let ProxyPrefix = ''
      if(proxyPrefixTiddler) {
        ProxyPrefix = proxyPrefixTiddler.fields.text;
        if(ProxyPrefix.charAt() !== '/') {
          ProxyPrefix = '/' + ProxyPrefix;
        }
      }
      const IPAddress = window.location.hostname;
      const WSSPort = window.location.port;
      const WSScheme = window.location.protocol=="https:"?"wss://":"ws://";

      $tw.connections = $tw.connections || [];
      $tw.connections[connectionIndex] = $tw.connections[connectionIndex] || {};
      $tw.connections[connectionIndex].index = connectionIndex;
      $tw.connections[connectionIndex].socket = new WebSocket(WSScheme + IPAddress +":" + WSSPort + ProxyPrefix);
      $tw.connections[connectionIndex].socket.onopen = openSocket;
      $tw.connections[connectionIndex].socket.onmessage = parseMessage;
      $tw.connections[connectionIndex].socket.binaryType = "arraybuffer";

      // Get the name for this wiki for websocket messages
      const tiddler = $tw.wiki.getTiddler("$:/WikiName");
      if(tiddler) {
        $tw.wikiName = tiddler.fields.text;
      } else {
        $tw.wikiName = '';
      }

      if(!reconnect) {
        addHooks();
      }
    }
    /*
      When the socket is opened the heartbeat process starts. This lets us know
      if the connection to the server gets interrupted.
    */
    const openSocket = function() {
      console.log('Opened socket');
      const token = localStorage.getItem('ws-token');
      // Login with whatever credentials you have
      const data = {
        type: 'setLoggedIn',
        wiki: $tw.wikiName,
        heartbeat: true,
        token: token
      };
      $tw.Bob.Shared.sendMessage(data, 0);
    }
    /*
      This is a wrapper function, each message from the websocket server has a
      message type and if that message type matches a handler that is defined
      than the data is passed to the handler function.
    */
    const parseMessage = function(event) {
      const eventData = JSON.parse(event.data);
      if(eventData.type) {
        if(typeof $tw.browserMessageHandlers[eventData.type] === 'function') {
          $tw.browserMessageHandlers[eventData.type](eventData);
        }
      }
    }

    const sendToServer = function (message) {
      const tiddlerText = $tw.wiki.getTiddlerText('$:/plugins/OokTech/Bob/Unsent', '');
      // If the connection is open, send the message
      if($tw.connections[connectionIndex].socket.readyState === 1) {
        $tw.Bob.Shared.sendMessage(message, 0);
      } else {
        // If the connection is not open than store the message in the queue
        const tiddler = $tw.wiki.getTiddler('$:/plugins/OokTech/Bob/Unsent');
        let queue = [];
        let start = Date.now();
        if(tiddler) {
          if(typeof tiddler.fields.text === 'string') {
            queue = JSON.parse(tiddler.fields.text);
          }
          if(tiddler.fields.start) {
            start = tiddler.fields.start;
          }
        }
        // Check to make sure that the current message is eligible to be saved
        const messageData = $tw.Bob.Shared.createMessageData(message)
        if($tw.Bob.Shared.messageIsEligible(messageData, 0, queue)) {
          // Prune the queue and check if the current message makes any enqueued
          // messages redundant or overrides old messages
          queue = $tw.Bob.Shared.removeRedundantMessages(messageData, queue);
          // Don't save any messages that are about the unsent list or you get
          // infinite loops of badness.
          if(messageData.title !== '$:/plugins/OokTech/Bob/Unsent') {
            queue.push(messageData);
          }
          const tiddler2 = {
            title: '$:/plugins/OokTech/Bob/Unsent',
            text: JSON.stringify(queue, '', 2),
            type: 'application/json',
            start: start
          };
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
    const addHooks = function() {
      if(!$tw.wikiName) {
        $tw.wikiName = '';
      }
      $tw.hooks.addHook("th-editing-tiddler", function(event) {
        const token = localStorage.getItem('ws-token');
        const message = {
          type: 'editingTiddler',
          tiddler: {
            fields: {
              title: event.tiddlerTitle
            }
          },
          wiki: $tw.wikiName,
          token: token
        };
        sendToServer(message);
        // do the normal editing actions for the event
        return true;
      });
      $tw.hooks.addHook("th-cancelling-tiddler", function(event) {
        const token = localStorage.getItem('ws-token');
        const draftTitle = event.param || event.tiddlerTitle;
        const draftTiddler = $tw.wiki.getTiddler(draftTitle);
        const originalTitle = draftTiddler && draftTiddler.fields["draft.of"];
        const message = {
          type: 'cancelEditingTiddler',
          tiddler:{
            fields:{
              title: originalTitle
            }
          },
          wiki: $tw.wikiName,
          token: token
        };
        sendToServer(message);
        // Do the normal handling
        return event;
      });

      $tw.Bob.Reconnect = function (sync) {
        if($tw.connections[0].socket.readyState !== 1) {
          $tw.Bob.setup();
          if(sync) {
            $tw.Bob.syncToServer();
          }
        }
      }
      $tw.Bob.syncToServer = function () {
        // Use a timeout to ensure that the websocket is ready
        if($tw.connections[0].socket.readyState !== 1) {
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
          const tiddler = $tw.wiki.getTiddler('$:/plugins/OokTech/Bob/Unsent');
          let tiddlerHashes = {};
          const allTitles = $tw.wiki.allTitles()
          const list = $tw.wiki.filterTiddlers($tw.Bob.ExcludeFilter);
          allTitles.forEach(function(tidTitle) {
            if(list.indexOf(tidTitle) === -1) {
              const tid = $tw.wiki.getTiddler(tidTitle);
              tiddlerHashes[tidTitle] = $tw.Bob.Shared.getTiddlerHash(tid);
            }
          })
          // Ask the server for a listing of changes since the browser was
          // disconnected
          const token = localStorage.getItem('ws-token');
          const message = {
            type: 'syncChanges',
            since: tiddler.fields.start,
            changes: tiddler.fields.text,
            hashes: tiddlerHashes,
            wiki: $tw.wikiName,
            token: token
          };
          sendToServer(message);
          $tw.wiki.deleteTiddler('$:/plugins/OokTech/Bob/Unsent')
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
      $tw.hooks.addHook("th-importing-tiddler", function (tiddler) {
        if ($tw.settings.saveMediaOnServer === 'yes') {
          function updateProgress(e) {
            // TODO make this work in different browsers
            /*
            if (e.lengthComputable) {
              var percentComplete = e.loaded/e.total*100;
            } else {
              var percentComplete = -1;
            }
            console.log(percentComplete);
            */
          }
          function transferComplete(e) {
            console.log('Complete!!');
          }
          function transferFailed(e) {
            console.log('Failed!');
          }
          function transferCanceled(e) {
            console.log('Cancelled!')
          }
          // Figure out if the thing being imported is something that should be
          // saved on the server.
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
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.svg': 'image/svg+xml',
            '.weba': 'audio/weba',
            '.webm': 'video/webm',
            '.wav': 'audio/wav'
          };
          if (Object.values(mimeMap)[tiddler.fields.type] && !tiddler.fields._canonical_uri) {
            // Check if this is set up to use HTTP post or websockets to save the
            // image on the server.
            var request = new XMLHttpRequest();
            request.upload.addEventListener('progress', updateProgress);
            request.upload.addEventListener('load', transferComplete);
            request.upload.addEventListener('error', transferFailed);
            request.upload.addEventListener('abort', transferCanceled);

            var wikiPrefix = $tw.wiki.getTiddlerText('$:/WikiName') || '';
            var uploadURL = '/api/upload';
            request.open('POST', uploadURL, true);
            // cookies are sent with the request so the authentication cookie
            // should be there if there is one.
            var thing = {
              tiddler: tiddler,
              wiki: $tw.wiki.getTiddlerText('$:/WikiName')
            }
            request.setRequestHeader('x-wiki-name',wikiPrefix);
            request.send(JSON.stringify(thing));
            // Change the tiddler fields and stuff
            var fields = {};
            var wikiPrefix = $tw.wiki.getTiddlerText('$:/WikiName') || '';
            wikiPrefix = wikiPrefix === 'RootWiki'?'':'/'+wikiPrefix;
            var uri = wikiPrefix+'/files/'+tiddler.fields.title;
            fields.title = tiddler.fields.title;
            fields.type = tiddler.fields.type;
            fields._canonical_uri = uri;
            return new $tw.Tiddler(fields);
          } else {
            return tiddler;
          }
        }
      });
    }
    // Only set up the websockets if we aren't in an iframe.
    if (window.location === window.parent.location && false) {
      // Send the message to node using the websocket
      $tw.Bob.setup();
    }
  }
})();
