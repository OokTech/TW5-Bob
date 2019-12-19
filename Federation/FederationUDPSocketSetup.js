/*\
title: $:/plugins/OokTech/Bob/Federation/FederationUDPSocketSetup.js
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
exports.after = ["websocket-server"];
exports.synchronous = true;

if($tw.node && $tw.settings.enableFederation === 'yes') {
  const dgram = require('dgram');
  const setup = function () {
    $tw.Bob = $tw.Bob || {};
    $tw.settings.federation = $tw.settings.federation || {};
    $tw.Bob.Federation = $tw.Bob.Federation || {};
    $tw.Bob.Federation.connections = $tw.Bob.Federation.connections || loadConnections();
    $tw.Bob.Federation.messageHandlers = $tw.Bob.Federation.messageHandlers || {};

    $tw.Bob.Federation.authenticateMessage = function (message) {
      return true;
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
      $tw.Bob.logger.log('Connections list:', Object.keys($tw.Bob.Federation.connections), {level:4});
      /*
      const connections = {};
      Object.keys($tw.Bob.Federation.connections).forEach(function(connectionKey) {
        connections[connectionKey] = {
          name: $tw.Bob.Federation.connections[connectionKey].name,
          canLogin: $tw.Bob.Federation.connections[connectionKey].canLogin,
          availableWikis: $tw.Bob.Federation.connections[connectionKey].availableWikis || [],
          availableChats: $tw.Bob.Federation.connections[connectionKey].availableChats || [],
          port: $tw.Bob.Federation.connections[connectionKey].port,
          publicKey:  $tw.Bob.Federation.connections[connectionKey].publicKey,
          staticUrl:$tw.Bob.Federation.connections[connectionKey].staticUrl
        };
      })
      */
      const message = {
        type: 'updateConnections',
        connections: $tw.Bob.Federation.connections
      };
      $tw.Bob.SendToBrowsers(message);
    }

    // Create the UDP socket to use
    $tw.Bob.Federation.socket = dgram.createSocket({type:'udp4', reuseAddr: true});
    $tw.settings.federation.udpPort = $tw.settings.federation.udpPort || '3232';
    $tw.settings.federation.serverName = $tw.settings.federation.serverName || 'Server of Eternal Mystery';
    $tw.Bob.Federation.socket.bind($tw.settings.federation.udpPort, ()=>{
      $tw.Bob.Federation.updateConnections()
      console.log('listening on udp port', $tw.settings.federation.udpPort)
      if ($tw.settings.federation.enableMulticast === 'yes') {
        $tw.settings.federation.multicastAddress = $tw.settings.federation.multicastAddress || '230.0.0.114';
        console.log('using multicast address ', $tw.settings.federation.multicastAddress);
        $tw.Bob.Federation.socket.addMembership($tw.settings.federation.multicastAddress);
        $tw.Bob.Federation.socket.setBroadcast(true);
        $tw.Bob.Federation.socket.setMulticastLoopback(false);

        // Broadcast a message informing other nodes that this one is on the
        // local net pubKey and signed will be used later, the public key and a
        // signed token showing that the server has the private key
        $tw.Bob.Federation.multicastSearch = function() {
          const message = {
            type: 'multicastSearch',
            serverName: $tw.settings.federation.serverName,
            pubKey: '',
            signed: ''
          }
          const messageBuffer = Buffer.from(JSON.stringify(message))
          $tw.Bob.Federation.socket.send(messageBuffer, 0, messageBuffer.length, $tw.settings.federation.udpPort, $tw.settings.federation.multicastAddress, function(err) {
            if (err) {
              console.log(err)
            }
          })
        }
      }
    })
    $tw.Bob.Federation.socket.on('message', (message, rinfo)=>{
      console.log('got udp socket message')
      $tw.Bob.Federation.handleMessage(message, rinfo);
    });

    const nonNonce = ['wiki-multicast', 'requestServerInfo', 'requestHashes', 'requestTiddlers', 'requestRemoteSync']

    $tw.Bob.Federation.handleMessage = function (message, rinfo) {
      $tw.Bob.logger.log('Received federated message ', message, {level:4});
      try {
        let messageData = JSON.parse(message);
        if (typeof messageData === 'string') {
          messageData = JSON.parse(messageData);
        }
        messageData._source_info = rinfo;
        handleConnection(messageData);
        // Make sure we have a handler for the message type
        if(typeof $tw.Bob.Federation.messageHandlers[messageData.type] === 'function') {
          // Check authorisation
          const authorised = $tw.Bob.Federation.authenticateMessage(messageData, rinfo);
          messageData.wiki = checkNonce(messageData)
          // TODO fix this dirty hack. We need a better way to list which
          // messages don't require a nonce.
          if(authorised && (messageData.wiki || nonNonce.indexOf(messageData.type) !== -1)) {
            messageData.decoded = authorised;
            $tw.Bob.Federation.messageHandlers[messageData.type](messageData);
          }
        } else {
          $tw.Bob.logger.error('No handler for federation message of type ', messageData.type, {level:3});
        }
      } catch (e) {
        $tw.Bob.logger.error("Error receiving udp message: ", e, {level:1});
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

    /*
      Setup the websocket server if we aren't using an external one
    */
    function finishSetup () {
      $tw.settings.federation.rebroadcastInterval = $tw.settings.federation.rebroadcastInterval || 5000;
      setInterval(function() {
        if ($tw.settings.federation.broadcast === 'yes') {
          $tw.Bob.Federation.multicastSearch()
        }
      }, $tw.settings.federation.rebroadcastInterval);
    }

    /*
      This loads the informaiton we have about potential connections
    */
    function loadConnections() {
      const fs = require('fs');
      const path = require('path');
      const connectionsFilePath = path.join($tw.boot.wikiPath, 'settings', 'connections.json');
      const userSettingsFolder = path.join($tw.boot.wikiPath, 'settings');
      if(!fs.existsSync(userSettingsFolder)) {
        return {};
      }
      try {
        const connections = fs.readFileSync(connectionsFilePath);
        return JSON.parse(connections.toString('utf8'));
      } catch (e) {
        return {};
      }
    }

    /*
      Save the connections.json file in the settings folder
    */
    function updateConnectionsInfo() {
      const fs = require('fs');
      const path = require('path');
      const connectionsFilePath = path.join($tw.boot.wikiPath, 'settings', 'connections.json');
      const userSettingsFolder = path.join($tw.boot.wikiPath, 'settings');
      if(!fs.existsSync(userSettingsFolder)) {
        // Create the settings folder
        fs.mkdirSync(userSettingsFolder);
      }
      const connections = JSON.stringify($tw.Bob.Federation.connections, "", 2);
      fs.writeFile(connectionsFilePath, connections, {encoding: "utf8"}, function (err) {
        if(err) {
          const message = {
            alert: 'Error saving connections:' + err,
            connections: [data.source_connection]
          };
          $tw.ServerSide.sendBrowserAlert(message);
          $tw.Bob.logger.error(err, {level:1});
        } else {
          $tw.Bob.logger.log('Updated connections file', {level:1})
          $tw.Bob.Federation.updateConnections()
        }
      });
    }

    /*
      This returns the server key used as the unique identifier for a server
    */
    function getServerKey(messageData, rinfo) {
      return messageData.serverName || rinfo.address + ':' + rinfo.port;
    }

    /*
      This runs when there is a new connection and sets up the message handler
    */
    function handleConnection(messageData) {
      const serverKey = getServerKey(messageData);
      // If this is a new connection save it, otherwise just make sure that our
      // stored data is up to date.
      if (Object.keys($tw.Bob.Federation.connections).indexOf(serverKey) === -1) {
        $tw.Bob.logger.log("New Remote Connection", serverKey, {level: 2});
        if (typeof $tw.Bob.Federation.connections[serverKey] === 'undefined') {
          // Request server info for the new one
          console.log('send info request')
          $tw.Bob.Federation.sendToRemoteServer({type:'requestServerInfo', port:$tw.settings.federation.udpPort}, messageData._source_info.address + ':' + messageData._source_info.port)
        }
      } else {
        // Check to make sure we have the up-to-date address and port
        if ($tw.Bob.Federation.connections[serverKey].address !== messageData._source_info.address || $tw.Bob.Federation.connections[serverKey].port !== messageData._source_info.port) {
          $tw.Bob.Federation.connections[serverKey].address = messageData._source_info.address;
          $tw.Bob.Federation.connections[serverKey].port = messageData._source_info.port;
          updateConnectionsInfo();
        }
      }
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
