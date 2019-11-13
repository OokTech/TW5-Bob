/*\
title: $:/plugins/OokTech/Bob/Federation/FederationWebsocketSetup.js
type: application/javascript
module-type: startup

A module that adds the framework for inter-server communication

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "federation-websockets-setup";
exports.platforms = ["node"];
exports.after = ["render"];
exports.synchronous = true;

if($tw.node && $tw.settings.enableFederation === 'yes') {
  const setup = function () {
    $tw.Bob = $tw.Bob || {};
    $tw.settings['fed-wss'] = $tw.settings['fed-wss'] || {};
    $tw.Bob.Federation = $tw.Bob.Federation || {}
    $tw.Bob.Federation.remoteConnections = $tw.Bob.Federation.remoteConnections || {};
    $tw.Bob.Federation.messageHandlers = $tw.Bob.Federation.messageHandlers || {};

    const URL = require('url');

    $tw.Bob.Federation.authenticateMessage = function (message) {
      return true
    }

    $tw.Bob.Federation.handleMessage = function (event) {
      $tw.Bob.logger.log('Received federated message ', event, {level:4});
      try {
        let eventData = JSON.parse(event);
        if (typeof eventData === 'string') {
          eventData = JSON.parse(eventData);
        }
        if (typeof this.url !== 'undefined') {
          const thisURL = URL.parse(this.url);
          eventData._source_info = {
            address: thisURL.hostname,
            port: thisURL.port,
            url: thisURL.hostname + ':' + thisURL.port
          };
        } else {
          eventData._source_info = this._socket._peername;
          eventData._source_info.url = this._socket._peername.address + ':' + this._socket._peername.port;
        }
        // Make sure we have a handler for the message type
        if(typeof $tw.Bob.Federation.messageHandlers[eventData.type] === 'function') {
          // Check authorisation
          const authorised = $tw.Bob.Federation.authenticateMessage(eventData);
          eventData.wiki = checkNonce(eventData)
          // TODO fix this dirty hack. We need a better way to list which
          // messages don't require a nonce.
          if(authorised && (eventData.wiki || eventData.type.startsWith('request'))) {
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

    function checkNonce(data) {
      if (!data.nonce) {
        return false;
      }
      let theWiki = undefined
      let server = undefined
      const match = $tw.Bob.Federation.nonce.filter(function(thisOne) {return thisOne.nonce === data.nonce})
      if (match.length > 0) {
        theWiki = (match[0].wiki)?match[0].wiki:undefined;
        server = match[0].server;
        $tw.Bob.Federation.nonce = $tw.Bob.Federation.nonce.filter(function(thisOne) {return thisOne.nonce !== data.nonce});
      }
      if (typeof theWiki === 'undefined' && typeof server === 'undefined') {
        return false;
      }
      return theWiki || server;
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

    /*
      This runs when there is a new connection and sets up the message handler
    */
    function handleConnection (client, request) {
      $tw.Bob.logger.log("New Remote Connection", {level: 2});
      $tw.Bob.Federation.remoteConnections[request.connection.remoteAddress + ':' + request.connection.remotePort] = {socket: client};
      client.on('message', $tw.Bob.Federation.handleMessage);
      $tw.Bob.Federation.updateConnections();
    }

    /*
      Update the list of connections and send the updated list to the browsers
      TODO figure out what sort of limits we need to make on who can see what
      connections
      TODO figure out how we are going to put reasonable names on these things
      because this is designed to work when the ip or url of a connection
      changes
    */
    $tw.Bob.Federation.updateConnections = function () {
      $tw.Bob.logger.log('Update federated connections', {level:3});
      $tw.Bob.logger.log('Connections list:', Object.keys($tw.Bob.Federation.remoteConnections), {level:4});
      const connections = {};
      Object.keys($tw.Bob.Federation.remoteConnections).forEach(function(connectionKey) {
        connections[connectionKey] = {
          name: $tw.Bob.Federation.remoteConnections[connectionKey].name,
          canLogin: $tw.Bob.Federation.remoteConnections[connectionKey].canLogin,
          availableWikis: $tw.Bob.Federation.remoteConnections[connectionKey].availableWikis || [],
          availableChats: $tw.Bob.Federation.remoteConnections[connectionKey].availableChats || [],
          port: $tw.Bob.Federation.remoteConnections[connectionKey].port,
          publicKey:  $tw.Bob.Federation.remoteConnections[connectionKey].publicKey,
          staticUrl:$tw.Bob.Federation.remoteConnections[connectionKey].staticUrl
        };
      })
      const message = {
        type: 'updateConnections',
        connections: connections
      };
      $tw.Bob.SendToBrowsers(message);
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
