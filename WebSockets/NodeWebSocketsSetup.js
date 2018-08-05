/*\
title: $:/plugins/OokTech/Bob/NodeWebSocketsSetup.js
type: application/javascript
module-type: startup

This is the node component of the web sockets. It works with
web-sockets-setup.js and ActionWebSocketMessage.js which set up the browser
side and make the action widget used to send messages to the node process.

To extend this you make a new file that adds functions to the
$tw.nodeMessageHandlers object.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "websocket-server";
exports.platforms = ["node"];
exports.after = ["node-settings"];
exports.synchronous = true;

// require the websockets module if we are running node
var WebSocketServer = $tw.node ? require('$:/plugins/OokTech/Bob/WS/ws.js').Server : undefined;
var fs = $tw.node ? require("fs"): undefined;
var http = $tw.node ? require("http") : undefined;
var path = $tw.node ? require("path") : undefined;

if ($tw.node) {
  // Import shared commands
  $tw.Bob.Shared = require('$:/plugins/OokTech/Bob/SharedFunctions.js');
  /*
    This sets up the websocket server and attaches it to the $tw object
  */
  var setup = function () {
    // initialise the empty $tw.nodeMessageHandlers object. This holds the functions that
    // are used for each message type
    $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
    $tw.Bob = $tw.Bob || {};
    $tw.Bob.EditingTiddlers = $tw.Bob.EditingTiddlers || {};
    $tw.Bob.MessageQueue = $tw.Bob.MessageQueue || [];
    // Initialise connections array
    $tw.connections = $tw.connections || [];

    if (!$tw.settings) {
      // Make sure that $tw.settings is available.
      var settings = require('$:/plugins/OokTech/NodeSettings/NodeSettings.js')
    }
    // Get the ip address to display to make it easier for other computers to
    // connect.
    var ip = require('$:/plugins/OokTech/Bob/ip.js');
    var ipAddress = ip.address();

    $tw.settings['ws-server'] = $tw.settings['ws-server'] || {};
    var ServerPort = Number($tw.settings['ws-server'].port) || 8080;
    var host = $tw.settings['ws-server'].host || '127.0.0.1';

    /*
      Make the tiddler that lists the available wikis and puts it in a data tiddler
    */
    var MakeWikiListTiddler = function () {
      var tiddlerFields = {
        title: '$:/plugins/OokTech/Bob/WikiList',
        text: JSON.stringify($tw.settings.wikis, "", 2),
        type: 'application/json'
      };
      $tw.wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
    }

    MakeWikiListTiddler();

    /*
      This function ensures that the WS server is made on an available port
    */
    var server;
    function makeWSS () {
      if ($tw.settings['ws-server'].autoIncrementPort || typeof $tw.settings['ws-server'].autoIncrementPort === 'undefined') {
        // If we try to autoincrement the web socket ports
        try {
          server = http.createServer(function (request, response) {
            // We don't need anything here, this is just for websockets.
          });
          server.on('error', function (e) {
            if (e.code === 'EADDRINUSE') {
              WSS_SERVER_PORT = WSS_SERVER_PORT + 1;
              makeWSS();
            }
          });
          server.listen(WSS_SERVER_PORT, function (e) {
            if (!e) {
              console.log('Websockets listening on ', WSS_SERVER_PORT);
              finishSetup();
            } else {
              console.log('Port ', WSS_SERVER_PORT, ' in use trying ', WSS_SERVER_PORT + 1);
            }
          });
        } catch (e) {
          WSS_SERVER_PORT += 1;
          makeWSS();
        }
      } else {
        // Otherwise fail if a
        server = http.createServer(function (request, response) {
          // We don't need anything here, this is just for websockets.
        });
        server.listen(WSS_SERVER_PORT, function (e) {
          if (!e) {
            console.log('Websockets listening on ', WSS_SERVER_PORT);
            finishSetup();
          } else {
            console.log('Error port used for websockets in use probably: ', e);
          }
        });
      }
    }
    // Stat trying with the next port from the one used by the http process
    // We want this one to start at the +1 place so that the webserver has a
    // chance to be in the desired port.
    var WSS_SERVER_PORT = $tw.settings['ws-server'].wssport || Number($tw.settings['ws-server'].port) + 1 || ServerPort + 1;

    var wikiPathPrefix = $tw.settings['ws-server'].wikiPathPrefix;
    // This makes the server and returns the actual port used
    if (!$tw.settings['ws-server'].useExternalWSS) {
      makeWSS();
    } else {
      WSS_SERVER_PORT = $tw.settings['ws-server'].wssport || WSS_SERVER_PORT;
      finishSetup();
    }

    function finishSetup () {
      if (!$tw.settings['ws-server'].useExternalWSS) {
        $tw.wss = new WebSocketServer({server: server});
        // Set the onconnection function
        $tw.wss.on('connection', handleConnection);
        // I don't know how to set up actually closing a connection, so this doesn't
        // do anything useful yet
        $tw.wss.on('close', function(connection) {
          console.log('closed connection ', connection);
        });
      }
      $tw.settings['ws-server'].wssport = WSS_SERVER_PORT;

      $tw.settings.serverInfo = {
        ipAddress: ipAddress,
        port: ServerPort,
        host: host,
        wssPort: WSS_SERVER_PORT
      };
    }
  }

  /*
    This function handles connections to a client.
    It currently only supports one client and if a new client connection is made
    it will replace the current connection.
    This function saves the connection and adds the message handler wrapper to
    the client connection.
    The message handler part is a generic wrapper that checks to see if we have a
    handler function for the message type and if so it passes the message to the
    handler, if not it prints an error to the console.

    connection objects are:
    {
      "socket": socketObject,
      "wiki": the name for the wiki using this connection
    }
  */
  function handleConnection(client) {
    console.log("new connection");
    $tw.connections.push({'socket':client, 'wiki': undefined});
    client.on('message', $tw.Bob.handleMessage);
    // Respond to the initial connection with a request for the tiddlers the
    // browser currently has to initialise everything.
    $tw.connections[Object.keys($tw.connections).length-1].index = Object.keys($tw.connections).length-1;
    var message = {type: 'listTiddlers'}
    $tw.Bob.SendToBrowser($tw.connections[Object.keys($tw.connections).length-1], message);
  }

  /*
    A placeholder, I may put something here later
  */
  function authenticateMessage(event) {
    return true
  }

  /*
    The handle message function, split out so we can use it other places
  */
  $tw.Bob.handleMessage = function(event) {
    var self = this;
    // Determine which connection the message came from
    var thisIndex = $tw.connections.findIndex(function(connection) {return connection.socket === self;});
    try {
      var eventData = JSON.parse(event);
      // Add the source to the eventData object so it can be used later.
      eventData.source_connection = thisIndex;
      // If the wiki on this connection hasn't been determined yet, take it
      // from the first message that lists the wiki.
      // After that the wiki can't be changed. It isn't a good security
      // measure but this part doesn't have real security anyway.
      // TODO figure out if this is actually a security problem.
      // We may have to add a check to the token before sending outgoing
      // messages.
      // This is really only a concern for the secure server, in that case
      // you authenticate the token and it only works if the wiki matches
      // and the token has access to that wiki.
      if (eventData.wiki && eventData.wiki !== $tw.connections[thisIndex].wiki && !$tw.connections[thisIndex].wiki) {
        $tw.connections[thisIndex].wiki = eventData.wiki;
        // Make sure that the new connection has the correct list of tiddlers being
        // edited.
        $tw.Bob.UpdateEditingTiddlers();
      }
      // Make sure we have a handler for the message type
      if (typeof $tw.nodeMessageHandlers[eventData.type] === 'function') {
        // Check authorisation
        var authorised = authenticateMessage(eventData)
        if (authorised) {
          eventData.decoded = authorised
          $tw.nodeMessageHandlers[eventData.type](eventData);
        }
      } else {
        console.log('No handler for message of type ', eventData.type);
      }
    } catch (e) {
      console.log("WebSocket error, probably closed connection: ", e);
    }
  }

  /*
    This updates the list of tiddlers being edited in each wiki. Any tiddler on
    this list has the edit button disabled to prevent two people from
    simultaneously editing the same tiddler.
    If run without an input it just re-sends the lists to each browser, with a
    tiddler title as input it appends that tiddler to the list and sends the
    updated list to all connected browsers.

    For privacy and security only the tiddlers that are in the wiki a
    conneciton is using are sent to that connection.
  */
  $tw.Bob.UpdateEditingTiddlers = function (tiddler) {
    // Check if a tiddler title was passed as input and that the tiddler isn't
    // already listed as being edited.
    // If there is a title and it isn't being edited add it to the list.
    if (tiddler && !$tw.Bob.EditingTiddlers[tiddler]) {
      $tw.Bob.EditingTiddlers[tiddler] = true;
    }
    Object.keys($tw.connections).forEach(function(index) {
      var list = Object.keys($tw.Bob.EditingTiddlers).filter(function(title) {
        return title.startsWith('{' + $tw.connections[index].wiki + '}');
      });
      var message = {type: 'updateEditingTiddlers', list: list, wiki: $tw.connections[index].wiki};
      $tw.Bob.SendToBrowser($tw.connections[index], message);
    });
  }

  /*
    This is a wrapper function that takes a message that is meant to be sent to
    all connected browsers and handles the details.

    It iterates though all connections, checkis if each one is active, tries to
    send the message, if the sending fails than it sets the connection as
    inactive.

    Note: This checks if the message is a string despite SendToBrowser also
    checking because if it needs to be changed and sent to multiple browsers
    changing it once here instead of once per browser should be better.
  */
  $tw.Bob.SendToBrowsers = function (message) {
    $tw.Bob.UpdateHistory(message);
    var messageData = $tw.Bob.Shared.createMessageData(message);
    // Send message to all connections.
    $tw.connections.forEach(function (connection) {
      if (connection.socket.readyState === 1 && (connection.wiki === messageData.message.wiki || !messageData.message.wiki)) {
        $tw.Bob.Shared.sendMessage(messageData, connection.index);
      }
    })
  }

  /*
    This function sends a message to a single connected browser. It takes the
    browser connection object and the stringifyed message as input.
    If any attempt fails mark the connection as inacive.

    On the server side the history is a bit more complex.
    There is one history of messages sent that has the message ids, each
    connection has a list of message ids that are still waiting for acks.
  */
  $tw.Bob.SendToBrowser = function (connection, message) {
    $tw.Bob.UpdateHistory(message);
    var messageData = $tw.Bob.Shared.createMessageData(message);
    // If the connection is open, send the message
    if (connection.socket.readyState === 1 && (connection.wiki === messageData.message.wiki || !messageData.message.wiki)) {
      $tw.Bob.Shared.sendMessage(messageData, connection.index);
    }
  }

  /*
    This keeps a history of changes for each wiki so that when a wiki is
    disconnected and reconnects and asks to resync this can be used to resync
    the wiki with the minimum amount of network traffic.

    Resyncing only needs to keep track of creating and deleting tiddlers here.
    The editing state of tiddlers is taken care of by the websocket
    reconnection process.

    So this is just the list of deleted tiddlers and saved tiddlers with time
    stamps, and it should at most have one item per tiddler because the newest
    save or delete message overrides any previous messages.

    The hisotry is an array of change entries
    Each entry in the history is in the form
    {
      title: tiddlerTitle,
      timestamp: changeTimeStamp,
      type: messageType
    }
  */
  $tw.Bob.UpdateHistory = function(message) {
    // Only save saveTiddler or deleteTiddler events that have a wiki listed
    if (['saveTiddler', 'deleteTiddler'].indexOf(message.type) !== -1 && message.wiki) {
      $tw.Bob.ServerHistory = $tw.Bob.ServerHistory || {};
      $tw.Bob.ServerHistory[message.wiki] = $tw.Bob.ServerHistory[message.wiki] || [];
      var entryIndex = $tw.Bob.ServerHistory[message.wiki].findIndex(function(entry) {
        return entry.title === message.tiddler.fields.title;
      })
      var entry = {
        timestamp: Date.now(),
        title: message.tiddler.fields.title,
        type: message.type
      }
      if (entryIndex > -1) {
        $tw.Bob.ServerHistory[message.wiki][entryIndex] = entry;
      } else {
        $tw.Bob.ServerHistory[message.wiki].push(entry);
      }
    }
  }

  // Only act if we are running on node. Otherwise WebSocketServer will be
  // undefined.
  setup();
}

})();
