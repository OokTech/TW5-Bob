/*\
title: $:/plugins/OokTech/MultiUser/NodeWebSocketsSetup.js
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
var WebSocketServer = $tw.node ? require('$:/plugins/OokTech/MultiUser/WS/ws.js').Server : undefined;
var fs = $tw.node ? require("fs"): undefined;

/*
  This sets up the websocket server and attaches it to the $tw object
*/
var setup = function () {
  // initialise the empty $tw.nodeMessageHandlers object. This holds the functions that
  // are used for each message type
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
  // Initialise connections array
  $tw.connections = [];
  // We need to get the ip address of the node process so that we can connect
  // to the websocket server from the browser
  // This is the node ip module wrapped in a tiddler so it can be packaged with
  // the plugin.
  var ip = require('$:/plugins/OokTech/MultiUser/ip.js');
  var ipAddress = ip.address();
  $tw.settings = $tw.settings || {};
  $tw.settings['ws-server'] = $tw.settings['ws-server'] || {};
  var ServerPort = $tw.settings['ws-server'].port || 8080;
  var host = $tw.settings['ws-server'].host || '127.0.0.1';

  $tw.wiki.addTiddler(new $tw.Tiddler({title: "$:/ServerIP", text: ipAddress, port: ServerPort, host: host}));

  /*
    Make the tiddler that lists the available wikis and puts it in a data tiddler
  */
  var MakeWikiListTiddler = function () {
    var tiddlerFields = {
      title: '$:/plugins/OokTech/MultiUser/WikiList',
      text: JSON.stringify($tw.settings.wikis, "", 2),
      type: 'application/json'
    };
    $tw.wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
  }

  MakeWikiListTiddler();

  // This is the port used by the web socket server
  var SERVER_PORT = 8081;
  // Create the web socket server on the defined port
  $tw.wss = new WebSocketServer({port: SERVER_PORT});

  // Set the onconnection function
  $tw.wss.on('connection', handleConnection);

  // I don't know how to set up actually closing a connection, so this doesn't
  // do anything useful yet
  /*.
  $tw.wss.on('close', function(connection) {
    console.log('closed connection ', connection);
  })
  */
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
    "active": boolean showing if the connection is active,
    "socket": socketObject,
    "name": the user name for the wiki using this connection
  }
*/
function handleConnection(client) {
  console.log("new connection");
  $tw.connections.push({'socket':client, 'active': true});
  client.on('message', function incoming(event) {
    var self = this;
    // Determine which connection the message came from
    var thisIndex = $tw.connections.findIndex(function(connection) {return connection.socket === self;});
    try {
      var eventData = JSON.parse(event);
      // Add the source to the eventData object so it can be used later.
      eventData.source_connection = thisIndex;
      // Make sure we have a handler for the message type
      if (typeof $tw.nodeMessageHandlers[eventData.messageType] === 'function') {
        $tw.nodeMessageHandlers[eventData.messageType](eventData);
      } else {
        console.log('No handler for message of type ', eventData.messageType);
      }
    } catch (e) {
      console.log("WebSocket error, probably closed connection: ", e);
    }
  });
  // Respond to the initial connection with a request for the tiddlers the
  // browser currently has to initialise everything.
  $tw.connections[Object.keys($tw.connections).length-1].index = [Object.keys($tw.connections).length-1];
  $tw.connections[Object.keys($tw.connections).length-1].socket.send(JSON.stringify({type: 'listTiddlers'}), function (err) {
    if (err) {
      console.log(err);
    }
  });
}

// Only act if we are running on node. Otherwise WebSocketServer will be
// undefined.
if (WebSocketServer) {
  setup()
}

})();
