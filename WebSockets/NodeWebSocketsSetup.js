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


// Make sure that $tw.settings is available.
//$tw.settings = $tw.settings || require('$:/plugins/OokTech/NodeSettings/NodeSettings.js');


if($tw.node) {
  //  var TOML = $tw.node ? require('$:/plugins/OokTech/Bob/External/@iarna/toml/toml.js') : undefined;
  // Import shared commands
  $tw.Bob.Shared = require('$:/plugins/OokTech/Bob/SharedFunctions.js');
  $tw.Bob = $tw.Bob || {};
  $tw.Bob.EditingTiddlers = $tw.Bob.EditingTiddlers || {};
  // Initialise connections array
  $tw.connections = $tw.connections || [];
  /*
    This sets up the websocket server and attaches it to the $tw object
  */
  const setup = function () {
    // require the websockets module if we are running node
    const WebSocketServer = require('$:/plugins/OokTech/Bob/External/WS/ws.js').Server;
    // initialise the empty $tw.nodeMessageHandlers object. This holds the
    // functions that are used for each message type
    $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
    $tw.settings['ws-server'] = $tw.settings['ws-server'] || {};

    /*
      Setup the websocket server if we aren't using an external one
    */
    function finishSetup () {
      if(!$tw.settings['ws-server'].useExternalWSS) {
        $tw.wss = new WebSocketServer({noServer: true});
        // Set the onconnection function
        $tw.wss.on('connection', handleConnection);
        // I don't know how to set up actually closing a connection, so this doesn't
        // do anything useful yet
        $tw.wss.on('close', function(connection) {
          $tw.Bob.logger.log('closed connection ', connection, {level:2});
        });
      }
      $tw.PruneTimeout = setInterval(function(){
        $tw.Bob.PruneConnections();
      }, 10000);
    }
    finishSetup();
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
  function handleConnection(client, request) {
    $tw.Bob.logger.log("new connection", {level:2});
    $tw.connections.push({'socket':client, 'wiki': undefined});
    client.on('message', $tw.Bob.handleMessage);
    // Respond to the initial connection with a request for the tiddlers the
    // browser currently has to initialise everything.
    $tw.connections[Object.keys($tw.connections).length-1].index = Object.keys($tw.connections).length-1;
    const message = {type: 'listTiddlers'}
    $tw.Bob.SendToBrowser($tw.connections[Object.keys($tw.connections).length-1], message);
    if(false && $tw.node && $tw.settings.enableFederation === 'yes') {
      $tw.Bob.Federation.updateConnections();
    }
  }

  /*
    This makes sure that the token send allows the action on the wiki
  */
  function authenticateMessage(event) {
    return $tw.Bob.AccessCheck(event.wiki, event.token, event.type);
  }

  /*
    The handle message function, split out so we can use it other places
  */
  $tw.Bob.handleMessage = function(event) {
    $tw.Bob.logger.log('Received websocket message ', event, {level:4});
    let self = this;
    // Determine which connection the message came from
    const thisIndex = $tw.connections.findIndex(function(connection) {return connection.socket === self;});
    try {
      let eventData = JSON.parse(event);
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
      if(eventData.wiki && eventData.wiki !== $tw.connections[thisIndex].wiki && !$tw.connections[thisIndex].wiki) {
        $tw.connections[thisIndex].wiki = eventData.wiki;
        // Make sure that the new connection has the correct list of tiddlers
        // being edited.
        $tw.Bob.UpdateEditingTiddlers(false, eventData.wiki);
      }
      // Make sure that the connection is from the wiki the message is for.
      // This may not be a necessary security measure.
      // I don't think that not having this would open up any exploits but I am not sure.
      // TODO figure out if this is needed.
      if(eventData.wiki === $tw.connections[thisIndex].wiki) {
        // Make sure we have a handler for the message type
        if(typeof $tw.nodeMessageHandlers[eventData.type] === 'function') {
          // Check authorisation
          const authorised = authenticateMessage(eventData);
          if(authorised) {
            eventData.decoded = authorised;
            $tw.nodeMessageHandlers[eventData.type](eventData);
          }
        } else {
          $tw.Bob.logger.error('No handler for message of type ', eventData.type, {level:3});
        }
      } else {
        $tw.Bob.logger.log('Target wiki and connected wiki don\'t match', {level:3});
      }
    } catch (e) {
      $tw.Bob.logger.error("WebSocket error: ", e, {level:1});
    }
  }

  /*
    This disconnects all connections that are for a specific wiki. this is used
    when unloading a wiki to make sure that people aren't trying to interact
    with a disconnected wiki.
  */
  $tw.Bob.DisconnectWiki = function (wiki) {
    $tw.connections.forEach(function(connectionIndex) {
      if(connectionIndex.wiki === wiki) {
        if(connectionIndex.socket !== undefined) {
          // Close the websocket connection
          connectionIndex.socket.terminate();
        }
      }
    })
  }

  /*
    This checks to see if a wiki has no connected sockets and if not it unloads
    the wiki.
  */
  $tw.Bob.PruneConnections = function () {
    if($tw.settings.autoUnloadWikis === "true") {
      $tw.connections.forEach(function(connection) {
        if(connection.socket !== undefined) {
          if(connection.socket.readyState !== 1) {
            $tw.nodeMessageHandlers.unloadWiki({wikiName: connection.wiki});
            connection.socket.terminate();
            connection.socket = undefined;
          }
        }
      })
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
  $tw.Bob.UpdateEditingTiddlers = function (tiddler, wikiName) {
    // Make sure that the wiki is loaded
    const exists = $tw.ServerSide.loadWiki(wikiName);
    // This should never be false, but then this shouldn't every have been a
    // problem to start.
    if(exists) {
      // Check if a tiddler title was passed as input and that the tiddler isn't
      // already listed as being edited.
      // If there is a title and it isn't being edited add it to the list.
      if(tiddler && !$tw.Bob.EditingTiddlers[wikiName][tiddler]) {
        $tw.Bob.EditingTiddlers[wikiName][tiddler] = true;
      }
      Object.keys($tw.connections).forEach(function(index) {
        if($tw.connections[index].wiki === wikiName) {
          $tw.Bob.EditingTiddlers[wikiName] = $tw.Bob.EditingTiddlers[wikiName] || {};
          const list = Object.keys($tw.Bob.EditingTiddlers[wikiName]);
          const message = {type: 'updateEditingTiddlers', list: list, wiki: wikiName};
          $tw.Bob.SendToBrowser($tw.connections[index], message);
          $tw.Bob.logger.log('Update Editing Tiddlers', {level: 4})
        }
      });
    }
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
  $tw.Bob.SendToBrowsers = function (message, excludeConnection) {
    $tw.Bob.UpdateHistory(message);
    const messageData = $tw.Bob.Shared.createMessageData(message);

    $tw.connections.forEach(function (connection, ind) {
      if((ind !== excludeConnection) && connection.socket) {
        if(connection.socket.readyState === 1 && (connection.wiki === message.wiki || !message.wiki)) {
          $tw.Bob.Shared.sendMessage(message, connection.index, messageData);
        }
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
    if(connection) {
      $tw.Bob.UpdateHistory(message);
      const messageData = $tw.Bob.Shared.createMessageData(message);
      if(connection.socket) {
        if(connection.socket.readyState === 1 && (connection.wiki === message.wiki || !message.wiki)) {
          $tw.Bob.Shared.sendMessage(message, connection.index, messageData);
        }
      }
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
    if(['saveTiddler', 'deleteTiddler'].indexOf(message.type) !== -1 && message.wiki) {
      $tw.Bob.ServerHistory = $tw.Bob.ServerHistory || {};
      $tw.Bob.ServerHistory[message.wiki] = $tw.Bob.ServerHistory[message.wiki] || [];
      const entryIndex = $tw.Bob.ServerHistory[message.wiki].findIndex(function(entry) {
        return entry.title === message.tiddler.fields.title;
      })
      const entry = {
        timestamp: Date.now(),
        title: message.tiddler.fields.title,
        type: message.type
      }
      if(entryIndex > -1) {
        $tw.Bob.ServerHistory[message.wiki][entryIndex] = entry;
      } else {
        $tw.Bob.ServerHistory[message.wiki].push(entry);
      }
    }
  }

  // Only act if we are running on node. Otherwise WebSocketServer will be
  // undefined.
  // Also we don't do this if we have an external server running things
  // we have to use the command line arguments because the externalserver
  // command hasn't run yet so we can't check $tw.ExternalServer
  if($tw.boot.argv.indexOf('--externalserver') === -1) {
    setup();
  }
}

})();
