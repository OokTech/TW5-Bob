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
    // Each time we load the wiki we start with id 0
    var idNumber = 0;
    // Ensure that the needed objects exist
    $tw.Bob = $tw.Bob || {};
    $tw.Bob.MessageQueue = $tw.Bob.MessageQueue || [];
    $tw.Bob.ExcludeFilter = $tw.wiki.getTiddlerText('$:/plugins/OokTech/Bob/ExcludeSync');

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
      $tw.socket = new WebSocket(WSScheme + IPAddress +":" + WSSPort);
      $tw.socket.onopen = openSocket;
      $tw.socket.onmessage = parseMessage;
      $tw.socket.binaryType = "arraybuffer";

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
      $tw.socket.send(JSON.stringify({messageType: 'ping', heartbeat: true, token: token, wiki: $tw.wikiName}));
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

    var makeId = function () {
      idNumber = idNumber + 1;
      var newId = 'b' + idNumber;
      return newId;
    }

    /*
      Check if the file version matches the in-browser version of a tiddler
    */
    function TiddlerHasChanged(tiddler, otherTiddler) {
      if (!otherTiddler) {
        return true;
      }
      if (!tiddler) {
        return true;
      }

      var changed = false;
      // Some cleverness that gives a list of all fields in both tiddlers without
      // duplicates.
      var allFields = Object.keys(tiddler.fields).concat(Object.keys(otherTiddler.fields).filter(function (item) {
        return Object.keys(tiddler.fields).indexOf(item) < 0;
      }));
      // check to see if the field values are the same, ignore modified for now
      allFields.forEach(function(field) {
        if (field !== 'modified' && field !== 'created' && field !== 'list' && field !== 'tags') {
          if (!otherTiddler.fields[field] || otherTiddler.fields[field] !== tiddler.fields[field]) {
            // There is a difference!
            changed = true;
          }
        } else if (field === 'list' || field === 'tags') {
          if (tiddler.fields[field] && otherTiddler.fields[field]) {
            if ($tw.utils.parseStringArray(otherTiddler.fields[field]).length !== tiddler.fields[field].length) {
              changed = true;
            } else {
              var arrayList = $tw.utils.parseStringArray(otherTiddler.fields[field]);
              arrayList.forEach(function(item) {
                if (tiddler.fields[field].indexOf(item) === -1) {
                  changed = true;
                }
              })
            }
          } else {
            changed = true;
          }
        }
      })
      return changed;
    };

    var isDuplicate = function (message) {
      var matches = $tw.Bob.MessageQueue.filter(function(item) {
        if (item.messageType === 'deleteTiddler' && message.messageType === 'deleteTiddler' && item.tiddler === message.tiddler) {
          return true;
        } else if (item.messageType === 'saveTiddler' && message.messageType === 'saveTiddler') {
          // figure out if the tiddler saved is the same as a previous message
          return TiddlerHasChanged(message.tiddler, item.tiddler);
        } else {
          return false;
        }
      })
      return (matches.length > 0);
    }

    /*
      This sends a message to the server and gives it an id. The ids are unique
      to the session, but not globally.
      Duplicate messages are rejected.
    */
    $tw.Bob.sendMessage = function(message) {
      if (!isDuplicate(message)) {
        var messageId = makeId();
        message._messageId = messageId;
        var messageData = {
          message: message,
          id: messageId,
          time: Date.now(),
          ack: false
        };
        $tw.Bob.MessageQueue.push(messageData);
        $tw.socket.send(JSON.stringify(message));
        clearTimeout($tw.Bob.MessageQueueTimer);
        $tw.Bob.MessageQueueTimer = setTimeout(checkMessageQueue, 500);
      }
    }

    var checkMessageQueue = function () {
      // If the queue isn't empty
      if($tw.Bob.MessageQueue.length > 0) {
        // Check if there are any messages that are more than 500ms old
        var oldMessages = $tw.Bob.MessageQueue.filter(function(messageData) {
          if ((Date.now() - messageData.time > 500) && !messageData.ack) {
            return true;
          } else {
            return false;
          }
        });
        oldMessages.forEach(function (messageData) {
          console.log(JSON.stringify(messageData.message))
          $tw.socket.send(JSON.stringify(messageData.message));
        });
        if($tw.Bob.MessageQueueTimer) {
          clearTimeout($tw.Bob.MessageQueueTimer);
        }
        $tw.Bob.MessageQueueTimer = setTimeout(checkMessageQueue, 500);
      } else {
        clearTimeout($tw.Bob.MessageQueueTimer);
        $tw.Bob.MessageQueueTimer = false;
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
        //var message = JSON.stringify({messageType: 'editingTiddler', tiddler: event.tiddlerTitle, wiki: $tw.wikiName, token: token});
        //$tw.socket.send(message);
        var message = {messageType: 'editingTiddler', tiddler: event.tiddlerTitle, wiki: $tw.wikiName, token: token};
        $tw.Bob.sendMessage(message);
        // do the normal editing actions for the event
        return true;
      });
      $tw.hooks.addHook("th-cancelling-tiddler", function(event) {
        var token = localStorage.getItem('ws-token')
        //var message = JSON.stringify({messageType: 'cancelEditingTiddler', tiddler: event.tiddlerTitle, wiki: $tw.wikiName, token: token});
        //$tw.socket.send(message);
        var message = {messageType: 'cancelEditingTiddler', tiddler: event.tiddlerTitle, wiki: $tw.wikiName, token: token};
        $tw.Bob.sendMessage(message);
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
                //var message = JSON.stringify({messageType: 'saveTiddler', tiddler: tempTid, wiki: $tw.wikiName, token: token});
                //$tw.socket.send(message);
                var message = {messageType: 'saveTiddler', tiddler: tempTid, wiki: $tw.wikiName, token: token};
                $tw.Bob.sendMessage(message);
              }
            } else if (changes[tiddlerTitle].deleted) {
              var token = localStorage.getItem('ws-token')
              //var message = JSON.stringify({messageType: 'deleteTiddler', tiddler: tiddlerTitle, wiki: $tw.wikiName, token: token});
              //$tw.socket.send(message);
              var message = {messageType: 'deleteTiddler', tiddler: tiddlerTitle, wiki: $tw.wikiName, token: token};
              $tw.Bob.sendMessage(message);
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
