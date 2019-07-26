/*\
title: $:/plugins/OokTech/Bob/WebsocketAdaptor.js
type: application/javascript
module-type: syncadaptor

A sync adaptor module for synchronising using Websockets

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.platforms = ["node"];

if($tw.node) {

  $tw.Bob = $tw.Bob || {};
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
  $tw.federationMessageHandlers = $tw.federationMessageHandlers || {};

  handleFederationMessage = function (event) {
    try {
      let eventData = JSON.parse(event);
      // Make sure we have a handler for the message type
      if(typeof $tw.federationMessageHandlers[eventData.type] === 'function') {
        // Check authorisation
        const authorised = authenticateMessage(eventData)
        if(authorised) {
          eventData.decoded = authorised
          $tw.federationMessageHandlers[eventData.type](eventData);
        }
      } else {
        $tw.Bob.logger.error('No handler for federation message of type ', eventData.type, {level:3});
      }
    } catch (e) {
      $tw.Bob.logger.error("Federation WebSocket error: ", e, {level:1});
    }
  }

  const setup = function () {
    // require the websockets module if we are running node
    const WebSocketServer = require('$:/plugins/OokTech/Bob/External/WS/ws.js').Server;
    // initialise the empty $tw.nodeMessageHandlers object. This holds the
    // functions that are used for each message type
    $tw.federationMessageHandlers = $tw.federationMessageHandlers || {};
    $tw.settings['fed-wss'] = $tw.settings['fed-wss'] || {};
    /*
      Setup the websocket server if we aren't using an external one
    */
    function finishSetup () {
      if(!$tw.settings['fed-wss'].useExternalWSS) {
        $tw.federationWss = new WebSocketServer({noServer: true});
        // Set the onconnection function
        $tw.federationWss.on('connection', handleConnection);
        // I don't know how to set up actually closing a connection, so this doesn't
        // do anything useful yet
        $tw.federationWss.on('close', function(connection) {
          $tw.Bob.logger.log('closed remote connection ', connection, {level:2});
        });
      }
      $tw.PruneTimeout = setInterval(function(){
        $tw.Bob.PruneConnections();
      }, 10000);
    }

    function handleConnection (client, request) {
      $tw.Bob.logger.log("new remote connection", {level:2});
      $tw.Bob.remoteConnections.push({'socket':client, 'server': undefined, 'url': undefined});
      client.on('message', handleFederationMessage);
      // Respond to the initial connection with a request for the tiddlers the
      // browser currently has to initialise everything.
      $tw.Bob.remoteConnections[Object.keys($tw.Bob.remoteConnections).length-1].index = Object.keys($tw.Bob.remoteConnections).length-1;
    }

    finishSetup();
  }

}

})();