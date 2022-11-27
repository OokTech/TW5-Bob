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
//exports.after = ["websocket-server"];
exports.synchronous = true;

exports.startup = function() {
  if($tw.node && $tw.settings.enableFederation === 'yes') {
    const dgram = require('dgram');
    const setup = function () {
      $tw.Bob = $tw.Bob || {};
      $tw.settings.federation = $tw.settings.federation || {};
      $tw.Bob.Federation = $tw.Bob.Federation || {};
      $tw.Bob.Federation.connections = loadConnections();
      $tw.Bob.Federation.messageHandlers = $tw.Bob.Federation.messageHandlers || {};

      /*
        Save the connections.json file in the settings folder
      */
      $tw.Bob.Federation.updateConnectionsInfo = function() {
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
      $tw.Bob.Federation.socket.bind($tw.settings.federation.udpPort)
      $tw.Bob.Federation.socket.on('listening', ()=>{
        $tw.Bob.Federation.updateConnections()
        $tw.Bob.logger.log('listening on udp port', $tw.settings.federation.udpPort, {level: 2})
        if($tw.settings.federation.enableMulticast === 'yes') {
          $tw.settings.federation.multicastAddress = $tw.settings.federation.multicastAddress || '255.255.255.255';
          $tw.Bob.logger.log('using multicast address ', $tw.settings.federation.multicastAddress,{level: 2});
          $tw.Bob.Federation.socket.setTTL(128);
          /*
          $tw.Bob.Federation.socket.setBroadcast(true);
          $tw.Bob.Federation.socket.setMulticastLoopback(false);
          const interfaces = require('os').networkInterfaces();
          Object.keys(interfaces).forEach(function(thisInterfaceName) {
            if(!thisInterfaceName.startsWith('lo')) { // ignore the loopback things
              const interfaceInfo = interfaces[thisInterfaceName]
              interfaceInfo.forEach(function(info) {
                console.log(thisInterfaceName, info.address)
                if(info.family === 'IPv4') {
                  $tw.Bob.Federation.socket.setMulticastInterface(info.address);
                  $tw.Bob.Federation.socket.addMembership($tw.settings.federation.multicastAddress, info.address);
                }
              })
            }
          })
          */

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
              if(err) {
                $tw.Bob.logger.error(err, {level: 3})
              }
            })
          }
        }
      })
      $tw.Bob.Federation.socket.on('message', (message, rinfo)=>{
        $tw.Bob.Federation.handleMessage(message, rinfo);
      });
      $tw.Bob.Federation.socket.on('error', (err) => {
        $tw.Bob.logger.error(err, {level: 3})
      });

      const nonNonce = ['multicastSearch', 'requestServerInfo', 'requestHashes', 'requestTiddlers', 'requestRemoteSync', 'ping', 'chunk', 'chatMessage', 'chatHistory', 'requestResend'];

      $tw.Bob.Federation.handleMessage = function (message, rinfo) {
        if(!rinfo || !message) {
          return;
        }
        $tw.Bob.logger.log('Received federated message ', message, {level:4});
        try {
          let messageData = JSON.parse(message);
          if(typeof messageData === 'string') {
            messageData = JSON.parse(messageData);
          }
          messageData._source_info = rinfo;
          messageData._source_info.serverKey = getServerKey(messageData);
          if(!messageData._source_info.serverKey) {
            return;
          }
          handleConnection(messageData);
          // Make sure we have a handler for the message type
          if(typeof $tw.Bob.Federation.messageHandlers[messageData.type] === 'function') {
            // Check authorisation
            const authorised = $tw.Bob.Federation.authenticateMessage(messageData);
            messageData.wiki = checkNonce(messageData);
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
        if(!data.nonce) {
          return false;
        }
        let theWiki = undefined
        let server = undefined
        const match = $tw.Bob.Federation.nonce.filter(function(thisOne) {return thisOne.nonce === data.nonce})
        if(match.length > 0) {
          theWiki = (match[0].wiki)?match[0].wiki:undefined;
          server = match[0].server;
          $tw.Bob.Federation.nonce = $tw.Bob.Federation.nonce.filter(function(thisOne) {return thisOne.nonce !== data.nonce});
        }
        if(typeof theWiki === 'undefined' && typeof server === 'undefined') {
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
          if($tw.settings.federation.broadcast === 'yes') {
            $tw.Bob.Federation.multicastSearch()
          }
          if($tw.settings.federation.checkConnections !== 'no') {
            pingConnections('all');
          }
        }, $tw.settings.federation.rebroadcastInterval);
      }

      /*
        Try and send a ping to every listed connection.
        Optionally taking a type input to specify which connections to check

        type can be:
        active - ping only connections marked as active
        inactive - ping only connections marked as inactive
        all - ping all listed connections
        [serverKey] - send a ping to each server listed in the array
      */
      function pingConnections(type='inactive') {
        const message = {type: 'ping'}
        if(Array.isArray(type)) {
          type.forEach(function(name) {
            if(!$tw.Bob.Federation.connections[name] || !$tw.Bob.Federation.connections[name].port || !$tw.Bob.Federation.connections[name].address) {
              return;
            }
            const serverInfo = {
              port: $tw.Bob.Federation.connections[name].port,
              address: $tw.Bob.Federation.connections[name].address
            }
            $tw.Bob.Federation.sendToRemoteServer(message, serverInfo);
          })
        } else if(type === 'all') {
          Object.keys($tw.Bob.Federation.connections).forEach(function(name) {
            if(!$tw.Bob.Federation.connections[name] || !$tw.Bob.Federation.connections[name].port || !$tw.Bob.Federation.connections[name].address) {
              return;
            }
            const serverInfo = {
              port: $tw.Bob.Federation.connections[name].port,
              address: $tw.Bob.Federation.connections[name].address
            }
            $tw.Bob.Federation.sendToRemoteServer(message, serverInfo);
          })
        } else if(type === 'active') {
          Object.keys($tw.Bob.Federation.connections).forEach(function(name) {
            if(!$tw.Bob.Federation.connections[name] || !$tw.Bob.Federation.connections[name].port || !$tw.Bob.Federation.connections[name].address) {
              return;
            }
            if($tw.Bob.Federation.connections[name].active === 'yes') {
              const serverInfo = {
                port: $tw.Bob.Federation.connections[name].port,
                address: $tw.Bob.Federation.connections[name].address
              }
              $tw.Bob.Federation.sendToRemoteServer(message, serverInfo);
            }
          })
        } else if(type === 'inactive') {
          Object.keys($tw.Bob.Federation.connections).forEach(function(name) {
            if(!$tw.Bob.Federation.connections[name] || !$tw.Bob.Federation.connections[name].port || !$tw.Bob.Federation.connections[name].address) {
              return;
            }
            if($tw.Bob.Federation.connections[name].active === 'no') {
              const serverInfo = {
                port: $tw.Bob.Federation.connections[name].port,
                address: $tw.Bob.Federation.connections[name].address
              }
              $tw.Bob.Federation.sendToRemoteServer(message, serverInfo);
            }
          })
        }
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
          // We mark all connections as inactive when starting so the server
          // tries to establish connections with all of them.
          const connections = JSON.parse(fs.readFileSync(connectionsFilePath).toString('utf8'));
          Object.keys(connections).forEach(function(connectionName) {
            connections[connectionName].active = 'no';
          })
          return connections
        } catch (e) {
          $tw.Bob.logger.error('problem loading connections', e)
          return {};
        }
      }

      /*
        This returns the server key used as the unique identifier for a server
      */
      function getServerKey(messageData) {
        return messageData.serverName
        /*
        if(messageData.serverName) {
          return messageData.serverName
        }
        if(messageData._source_info) {
          return messageData.serverName || messageData._source_info.address + ':' + messageData._source_info.port;
        } else if(messageData._target_info) {
          return messageData.serverName || messageData._target_info.address + ':' + messageData._source_info.port;
        } else {
          // This should never happen
          return false;
        }
        */
      }

      /*
        This runs when there is a new connection and sets up the message handler
      */
      function handleConnection(messageData) {
        // If this is a new connection save it, otherwise just make sure that our
        // stored data is up to date.
        if(Object.keys($tw.Bob.Federation.connections).indexOf(messageData._source_info.serverKey) === -1) {
          $tw.Bob.logger.log("New Remote Connection", messageData._source_info.serverKey, {level: 2});
          if(typeof $tw.Bob.Federation.connections[messageData._source_info.serverKey] === 'undefined' && messageData.type !== 'sendServerInfo') {
            // Add temp info
            $tw.Bob.Federation.connections[messageData._source_info.serverKey] = $tw.Bob.Federation.connections[messageData._source_info.serverKey] || {};
            $tw.Bob.Federation.connections[messageData._source_info.serverKey].address = messageData._source_info.address;
            $tw.Bob.Federation.connections[messageData._source_info.serverKey].port = messageData._source_info.port;
            // Request server info for the new one
            $tw.Bob.Federation.sendToRemoteServer({type:'requestServerInfo', port:$tw.settings.federation.udpPort}, messageData._source_info)
            $tw.Bob.Federation.updateConnectionsInfo();
          }
        } else {
          // Check to make sure we have the up-to-date address and port
          if($tw.Bob.Federation.connections[messageData._source_info.serverKey].address !== messageData._source_info.address || $tw.Bob.Federation.connections[messageData._source_info.serverKey].port !== messageData._source_info.port) {
            $tw.Bob.Federation.connections[messageData._source_info.serverKey].address = messageData._source_info.address;
            $tw.Bob.Federation.connections[messageData._source_info.serverKey].port = messageData._source_info.port;
            $tw.Bob.Federation.updateConnectionsInfo();
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
}
})();
