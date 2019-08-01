/*\
title: $:/plugins/OokTech/Bob/FederationWebsocketSetup.js
type: application/javascript
module-type: startup

A module that adds the framework for inter-server communication

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.platforms = ["node"];

if($tw.node) {

  const setup = function () {
    $tw.Bob = $tw.Bob || {};
    $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
    $tw.Bob.Federation.messageHandlers = $tw.Bob.Federation.messageHandlers || {};
    $tw.settings['fed-wss'] = $tw.settings['fed-wss'] || {};
    $tw.Bob.Federation = $tw.Bob.Federation || {}
    $tw.Bob.Federation.remoteConnections = $tw.Bob.Federation.remoteConnections || {};

    const URL = require('url');

    $tw.Bob.Federation.authenticateMessage = function (message) {
      return true
    }

    $tw.Bob.Federation.handleMessage = function (event) {
      let self = this;
      try {
        let eventData = JSON.parse(event);
        if (typeof this.url !== 'undefined') {
          const thisURL = URL.parse(this.url);
          eventData._source_info = {
            address: thisURL.hostname,
            port: thisURL.port,
            url: thisURL.hostname + ':' + thisURL.port
          };
        } else {
          eventData._source_info = this._socket._peername;
          eventData._source_info.url = this._socket._peername.address + ':' +this._socket._peername.port;
        }
        if (typeof $tw.Bob.Federation.remoteConnections[eventData._source_info.url] === 'undefined') {
          $tw.Bob.Federation.remoteConnections[eventData._source_info.url] = {socket: this}
        }
        // Make sure we have a handler for the message type
        if(typeof $tw.Bob.Federation.messageHandlers[eventData.type] === 'function') {
          // Check authorisation
          const authorised = $tw.Bob.Federation.authenticateMessage(eventData);
          if(authorised) {
            eventData.decoded = authorised;
            $tw.Bob.Federation.messageHandlers[eventData.type](eventData);
          }
        } else {
          $tw.Bob.logger.error('No handler for federation message of type ', eventData.type, {level:3});
        }
      } catch (e) {
        $tw.Bob.logger.error("Federation WebSocket error: ", e, {level:1});
      }
    }

    // require the websockets module if we are running node
    const WebSocketServer = require('$:/plugins/OokTech/Bob/External/WS/ws.js').Server;
    /*
      Setup the websocket server if we aren't using an external one
    */
    function finishSetup () {
      $tw.settings['fed-wss'] = $tw.settings['fed-wss'] || {};
      if(!$tw.settings['fed-wss'].useExternalWSS) {
        $tw.federationWss = new WebSocketServer({noServer: true});
        // Set the onconnection function
        $tw.federationWss.on('connection', handleConnection);
        // I don't know how to set up actually closing a connection, so this
        // doesn't do anything useful yet
        $tw.federationWss.on('close', function(connection) {
          $tw.Bob.logger.log('closed remote connection ', connection, {level:2});
        });
      }
    }

    function handleConnection (client, request) {
      $tw.Bob.logger.log("New Remote Connection", {level: 2})
      $tw.Bob.Federation.remoteConnections[request.connection.remoteAddress] = {socket: client}
      client.on('message', $tw.Bob.Federation.handleMessage)
      $tw.Bob.Federation.updateConnections()
    }

    finishSetup();
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
