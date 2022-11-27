/*\
title: $:/plugins/OokTech/Bob/Federation/FederationSetup.js
type: application/javascript
module-type: startup

A module that adds the framework for inter-server communication

channel     -> interface adaptor              -> this module -> message handlers
raw message -> transfrom into universal model -> same        -> same

it gets messages in a known format from any message source (udp, websockets, anything else)
chunking and encryption are handled by the interface adaptor?

- it then puts them through things to check if the message is allowed to be used
  - the sender has the permissions to run whatever the message does
  - send an ack, if appropriate
  - it isn't a duplicate or rejected for some other reason
- it then checks if there is a handler for the message type
  - if not drop it (maybe reply with an error?)
  - if so pass it off to the handler


message format:

{
  s: senderInfo,
  t: messageType,
  i: messageId
  d: messageData
}

s - senderInfo has to be some identifier that we can use for any type of sender, so probably a unique id that can look up information from our list of known servers
t - messageType is the message type and determines which handler will be used
i - messageId is a unique message id used for acks and resends
d - messageData is whatever is determined by the message type and used by the message handler

if we do end up having keys for encryption and identification that part is going to be handled by the individual interface adaptors

\*/
(function(){

    /*jslint node: true, browser: true */
    /*global $tw: false */
    "use strict";

    exports.name = "federation-setup";
    exports.platforms = ["node"];
    //exports.after = ["websocket-server"];
    exports.synchronous = true;

    exports.startup = function() {
      if($tw.node && $tw.settings.enableFederation === 'yes') {
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
          $tw.settings.federation.serverName = $tw.settings.federation.serverName || 'Server of Eternal Mystery';


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
