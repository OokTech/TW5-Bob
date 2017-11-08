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

// require the websockets module if we are running node
var WebSocketServer = $tw.node ? require('ws').Server : undefined;
//var Git = $tw.node ? require('simple-git') : undefined;
var fs = $tw.node ? require("fs"): undefined;

/*
  This sets up the websocket server and attaches it to the $tw object
*/
var setup = function () {
  // initialise the empty $tw.nodeMessageHandlers object. This holds the functions that
  // are used for each message type
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};

  $tw.connections = [];
  // We need to get the ip address of the node process so that we can connect
  // to the websocket server from the browser
  var ip = require("ip");
  var ipAddress = ip.address();
  // Create the tiddler that holds the IP address
  var fileData = `title: $:/ServerIP\n\n${ipAddress}`;

  $tw.wiki.addTiddler(new $tw.Tiddler({title: "$:/ServerIP", text: ipAddress}));

  // This is the port used by the web socket server
  var SERVER_PORT = 8000;
  // Create the web socket server on the defined port
  $tw.wss = new WebSocketServer({port: SERVER_PORT});
  // Initialise the connections array
  //var connections = new Array;
  // Put a 0 in the array to start, it wasn't working without putting something // here for some reason.

  //$tw.connections.push(0);
  // Set the onconnection function
  $tw.wss.on('connection', handleConnection);
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
    "name": the user name for the wiki using this connection
  }
*/
function handleConnection(client) {
  console.log("new connection");
  $tw.connections.push({'socket':client, 'active': true});
  client.on('message', function incoming(event) {
    var self = this;
    var thisIndex = $tw.connections.findIndex(function(connection) {return connection.socket === self;});
    if (typeof event === 'object') {
      //console.log(Object.keys(event));
    }
    try {
      var eventData = JSON.parse(event);
      // Add the source to the eventData object so it can be used later.
      //eventData.source_connection = $tw.connections.indexOf(this);
      eventData.source_connection = thisIndex;
      if (typeof $tw.nodeMessageHandlers[eventData.messageType] === 'function') {
        $tw.nodeMessageHandlers[eventData.messageType](eventData);
      } else {
        console.log('No handler for message of type ', eventData.messageType);
      }
    } catch (e) {
      console.log(e);
    }
  });
  $tw.connections[Object.keys($tw.connections).length-1].socket.send(JSON.stringify({type: 'listTiddlers'}));
}

//module.exports = setup;
if (WebSocketServer) {
  setup()
  setTimeout(function() {testFunction()}, 1000)

  var testFunction = function() {
    if ($tw.connections[0]) {
      if (typeof $tw.connections[0].socket.send === 'function') {
        $tw.connections[0].socket.send(JSON.stringify({type: "listTiddlers"}))
      } else {
        setTimeout(testFunction, 1000)
      }
    } else {
      setTimeout(testFunction, 1000)
    }
  }
}

})();
