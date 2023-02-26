/*\
title: $:/plugins/OokTech/Bob/Federation/NodeFederationHandlers.js
type: application/javascript
module-type: startup

These are basic handlers for federation between different Bob servers.
\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.platforms = ["node"];

exports.startup = function() {
  if($tw.node && $tw.settings.enableFederation === 'yes') {
    $tw.settings.federation = $tw.settings.federation || {};
    $tw.Bob.Federation = $tw.Bob.Federation || {};
    $tw.Bob.Federation.messageHandlers = $tw.Bob.Federation.messageHandlers || {};

    /*
      This is asking a remote server for an update about its current status
      including:

      - Server name
      - Available wikis
      - Available chats
      - (TODO) its public key
        - For this one the requesting server would send a random number and the
          reply would be a signed token where the payload is the random number
          and the public key.
    */
    function getAvailableWikis(data) {
      data = data || {};
      function getList(obj, prefix) {
        let output = []
        Object.keys(obj).forEach(function(item) {
          if(typeof obj[item] === 'string') {
            if($tw.syncadaptor.existsListed(prefix+item)) {
              if(item == '__path') {
                if(prefix.endsWith('/')) {
                  output.push(prefix.slice(0,-1));
                } else {
                  output.push(prefix);
                }
              } else {
                output.push(prefix+item);
              }
            }
          } else if(typeof obj[item] === 'object') {
            output = output.concat(getList(obj[item], prefix + item + '/'));
          }
        })
        return output;
      }
      // Get the wiki list of wiki names from the settings object
      const wikiList = getList($tw.settings.wikis, '')
      const viewableWikis = []
      wikiList.forEach(function(wikiName) {
        if($tw.Bob.AccessCheck(wikiName, {"decoded": data.decoded}, 'view', 'wiki')) {
          viewableWikis.push(wikiName);
        }
      })
      return wikiList || {};
    }
    function getAvailableChats() {
      return [];
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
      Respond when a multicast search message is received
    */
    $tw.Bob.Federation.messageHandlers.multicastSearch = function(data) {
      // This checks to see if we have the node the broadcast is from listed with
      // the same rinfo stuff as the broadcast, if so we can ignore it, if not
      // than we request info
      if(typeof $tw.Bob.Federation.connections[data._source_info.serverKey] === 'undefined' || $tw.Bob.Federation.connections[data._source_info.serverKey].active !== 'yes' || $tw.Bob.Federation.connections[data._source_info.serverKey].port !== data._source_info.port && $tw.Bob.Federation.connections[data._source_info.serverKey].address !== data._source_info.address) {
        $tw.Bob.Federation.connections[data._source_info.serverKey].active = 'yes';
        $tw.Bob.Federation.updateConnectionsInfo();
      }
    }

    /*
      Pings are for checking to see if a server is still alive, and for
      connecting to known servers without broadcasting
    */
    $tw.Bob.Federation.messageHandlers.ping = function(data) {
      // respond with a pong
      const message = {type: 'pong', nonce: data.rnonce};
      $tw.Bob.Federation.sendToRemoteServer(message, data._source_info);
      // ask for updated info if it has been long enough, or they aren't iisted
    }

    /*
      A pong is the response to a ping, it indicates that the other server is
      active.
    */
    $tw.Bob.Federation.messageHandlers.pong = function(data) {
      if($tw.Bob.Federation.connections[data._source_info.serverKey].active !== 'yes') {
        const message = {
          type:'requestServerInfo',
        };
        $tw.Bob.Federation.sendToRemoteServer(message, data._source_info);
        updateSyncing(data._source_info.serverKey);
      }
    }

    /*
      Ask a remote server for updated information about the server.
    */
    $tw.Bob.Federation.messageHandlers.requestServerInfo = function(data) {
      // Reply with the server info listed above
      const reply = {
        type: 'sendServerInfo',
        serverName: $tw.settings.federation.serverName,
        info: {
          name: $tw.settings.federation.serverName || 'Sever Name',
          allows_login: $tw.settings.federation.allows_login || 'no',
          available_wikis: $tw.ServerSide.getViewableWikiList(data),
          available_chats: getAvailableChats(data),
          port: $tw.settings.federation.udpPort,
          publicKey: 'c minor',
          staticUrl: 'no'
        },
        nonce: data.rnonce
      };
      $tw.Bob.Federation.sendToRemoteServer(reply, data._source_info);
    }

    function addServerInfo(data) {
      data = data || {};
      $tw.Bob.Federation.connections[data._source_info.serverKey] = $tw.Bob.Federation.connections[data._source_info.serverKey] || {};
      data.info = (data.message)?(data.message.info || data.info):data.info;
      if(data.info && data._source_info) {
        $tw.Bob.Federation.connections[data._source_info.serverKey].name = data.info.name;
        $tw.Bob.Federation.connections[data._source_info.serverKey].allows_login = data.info.allows_login || 'no';
        $tw.Bob.Federation.connections[data._source_info.serverKey].lastupdate = $tw.utils.stringifyDate(new Date());
        $tw.Bob.Federation.connections[data._source_info.serverKey].available_wikis = $tw.Bob.Federation.connections[data._source_info.serverKey].available_wikis || {};
        $tw.Bob.Federation.connections[data._source_info.serverKey].active = 'yes';
        console.log('recevied server info from ', data._source_info.serverKey)
        Object.keys(data.info.available_wikis).forEach(function(wikiName) {
          if(Object.keys($tw.Bob.Federation.connections[data._source_info.serverKey].available_wikis).indexOf(wikiName) === -1) {
            $tw.Bob.Federation.connections[data._source_info.serverKey].available_wikis[wikiName] = {
              allows_login: 'no',
              auto_sync: 'no',
              conflict_type: 'manual',
              name: wikiName,
              public: 'yes',
              sync: 'no',
              sync_filter: '[is[system]!is[system]]',
              sync_type: '',
              previous_sync: 0
            };
          } else {
            $tw.Bob.Federation.connections[data._source_info.serverKey].available_wikis[wikiName].previous_sync = $tw.Bob.Federation.connections[data._source_info.serverKey].available_wikis[wikiName].previous_sync || 0;
          }
        });
        $tw.Bob.Federation.connections[data._source_info.serverKey].available_chats = data.info.available_chats || [];
        $tw.Bob.Federation.connections[data._source_info.serverKey].port = data.info.port;
        $tw.Bob.Federation.connections[data._source_info.serverKey].address = data._source_info.address;
        $tw.Bob.Federation.connections[data._source_info.serverKey].publicKey = data.info.publicKey;
        $tw.Bob.Federation.connections[data._source_info.serverKey].staticUrl = data.info.staticUrl || 'no';
      }
      $tw.Bob.Federation.updateConnectionsInfo();
      $tw.Bob.Federation.updateConnections();
    }

    /*
      Add or update local information about a remote server when it is received
    */
    $tw.Bob.Federation.messageHandlers.sendServerInfo = function(data) {
      addServerInfo(data);
    }

    /*
      This checks the status of automatically syncing wikis and asks to sync if
      appropriate.
    */
    function updateSyncing(serverName) {
      // if the server has any wikis synced from the sending server and it has
      // been long enough ask for it to sync.

      // The time difference compares two tiddlywiki date fields, so the format
      // of the compared values is YYYYMMDDHHmmssmmm (4 digit year, 2 digit month, 2 digit day, 2 digit hour, 2 digit minute, 2 digit second, 3 digit millisecond)
      // so 10000 is 10 seconds, 1000000 is 10 minutes
      const syncWikis = Object.keys($tw.Bob.Federation.connections[serverName].available_wikis).filter(function(wikiName) {
        return $tw.Bob.Federation.connections[serverName].available_wikis[wikiName].auto_sync === 'yes' && $tw.Bob.Federation.connections[serverName].available_wikis[wikiName].sync_type !== 'push' && $tw.utils.stringifyDate(new Date()) - $tw.Bob.Federation.connections[serverName].available_wikis[wikiName].previous_sync > 1000000
      })
      // find any wikis that we want to autosync and that haven't been synced in long enough
      syncWikis.forEach(function(wikiName) {
        // request new things
        const message = {
          type: 'requestHashes',
          tid_param: $tw.Bob.Federation.connections[serverName].available_wikis[wikiName]
        }
        $tw.Bob.Federation.connections[serverName].available_wikis[wikiName].previous_sync = $tw.utils.stringifyDate(new Date());
        $tw.Bob.Federation.sendToRemoteServer(message, $tw.Bob.Federation.connections[serverName]);
      })
    }

    /*
      This requests tiddler hashes from a server in preparation for syncing

      data {
        filter: <some filter>,
        fromWiki: wiki name
      }
    */
    $tw.Bob.Federation.messageHandlers.requestHashes = function(data) {
      $tw.Bob.logger.log('receive requestHashes', {level: 4})
      if(data.tid_param) {
        setTimeout(function() {
          $tw.Bob.logger.log("update syncing", {level: 2})
          updateSyncing(data._source_info.serverKey);
        }, 10000);
        // Ask for hashes for the wikis
        // Request the hashes
        const test = $tw.syncadaptor.loadWiki(data.tid_param.name);
        if(!test) {
          $tw.Bob.logger.log('no wiki?', data, {level: 3});
          return;
        }
        // get list of tiddlers
        const titleList = $tw.Bob.Wikis[data.tid_param.name].wiki.filterTiddlers(data.tid_param.sync_filter);
        // get tiddler hashes
        const outputHashes = {};
        titleList.forEach(function(thisTitle) {
          outputHashes[encodeURIComponent(thisTitle)] = $tw.Bob.Shared.getTiddlerHash($tw.Bob.Wikis[data.tid_param.name].wiki.getTiddler(thisTitle));
        })
        // send them back
        const message = {
          type: 'sendHashes',
          hashes: outputHashes,
          nonce: data.rnonce,
          fromWiki: data.tid_param.name
        }
        $tw.Bob.logger.log('sending send hashes', {level: 4})
        $tw.Bob.Federation.sendToRemoteServer(message, data._source_info);
      }
    }

    /*
      This takes hashes of tiddlers from the remote wiki and compares them to the
      local wiki and requests any that are missing.
    */
    $tw.Bob.Federation.messageHandlers.sendHashes = function(data) {
      $tw.Bob.logger.log('receive sendHashes', data.hashes, {level: 4})
      if(data.hashes && data.fromWiki) {
        const tiddlersToRequest = [];
        const localName = $tw.Bob.Federation.connections[data.serverName].available_wikis[data.fromWiki].local_name || data.fromWiki;
        const test = $tw.syncadaptor.loadWiki(localName);
        if(!test) {
          const wikiData = {
            wikiName: localName
          }
          $tw.nodeMessageHandlers.createNewWiki(wikiData, nextBit);
        } else {
          nextBit();
        }
        function nextBit() {
          const test = $tw.syncadaptor.loadWiki(localName);
          Object.keys(data.hashes).forEach(function(rawTitle) {
            const tidTitle = decodeURIComponent(rawTitle);
            if(typeof tidTitle !== 'string') {
              return;
            }
            if(tidTitle.indexOf("]]") !== -1) {
              return;
            }
            // check if the tiddler exists locally
            const thisTid = $tw.Bob.Wikis[localName].wiki.getTiddler(tidTitle);
            if(thisTid) {
              // If the tiddler exists than check if the hashes match
              if(data.hashes[rawTitle] !== $tw.Bob.Shared.getTiddlerHash(thisTid)) {
                // If the hashes don't match add it to the list
                tiddlersToRequest.push(tidTitle);
              }
            } else {
              // If the tiddler doesn't exist than add it to the list
              tiddlersToRequest.push(tidTitle);
            }
          })
          $tw.Bob.logger.log('requesting ', tiddlersToRequest.length, ' tiddlers', {level: 4})
          tiddlersToRequest.forEach(function(tidTitle) {
            const message = {
              type: 'requestTiddlers',
              filter: '[[' + tidTitle + ']]',
              wikiName: data.fromWiki
            }
            $tw.Bob.Federation.sendToRemoteServer(message, data._source_info);
          })
        }
      }
    }

    /*
      This message is used to send the actual tiddler payload between servers.

      TODO figure out the best way to set this up so that tiddlers can be saved
      without the browser being open.

      data {
        tiddlers: {
          title1: tidObject 1,
          title2: tidObject 2,
          ...
        }
      }
    */
    $tw.Bob.Federation.messageHandlers.sendTiddlers = function(data) {
      $tw.Bob.logger.log('receive sendTiddlers', {level: 4})
      if(typeof data.tiddlers === 'object') {
        const localName = $tw.Bob.Federation.connections[data.serverName].available_wikis[data.wikiName].local_name || data.wikiName;
        $tw.syncadaptor.loadWiki(localName, function() {
          Object.values(data.tiddlers).forEach(function(tidFields) {
            if(!tidFields) {
              return;
            }
            // Save the tiddlers using the rules set for the wiki
            federationConflictSave(tidFields, data);
          })
        })
      }
    }

    /*
      This function checks the way conflicts are setup to be handled and saves
      the input tiddler accordingly, or discards it is appropriate.
    */
    function federationConflictSave(tidFields, data) {
      const localName = $tw.Bob.Federation.connections[data.serverName].available_wikis[data.wikiName].local_name || data.wikiName;
      const resolution = $tw.Bob.Federation.connections[data.serverName].available_wikis[data.wikiName].conflict_type;
      // Check if the tiddler exists
      const exists = $tw.Bob.Wikis[localName].wiki.getTiddler(tidFields.title);
      if(exists) {
        // We assume the tiddler is different, otherwise it wouldn't have been
        // requested.
        // Check the conflict resolution type and act accordingly
        if(resolution === 'localWins') {
          // If local wins we ignore remote changes
          return;
        } else if(resolution === 'remoteWins') {
          // If remote wins always use remote changes
          $tw.syncadaptor.saveTiddler({fields: tidFields}, localName);
        } else if(resolution === 'manual') {
          if(tidFields.title.startsWith('$:/SyncingConflict/')) {
            // If the tiddler is already a sync conflict tiddler from the other
            // wiki, ignore it.
            return;
          }
          // Save a conflict version and let the person decide
          tidFields.title = '$:/SyncingConflict/' + tidFields.title;
          $tw.syncadaptor.saveTiddler({fields: tidFields}, localName);
        }
      } else if(resolution === 'newestWins') {
        // Save the one with the newest modified field, if no modified field keep
        // the local one.
        // If only one has a modified field, keep that one.
        if(tidFields.modified && exists.fields.modified) {
          if(tidFields.modified > exists.fields.modified) {
            $tw.syncadaptor.saveTiddler({fields: tidFields}, localName);
          }
          // otherwise don't do anything
        } else if(tidFields.modified) {
          $tw.syncadaptor.saveTiddler({fields: tidFields}, localName);
        } else {
          // Either neither have a modified field or only the local one does,
          // either way just keep the local one.
          return;
        }
      } else if(resolution === 'oldestWins') {
        // Save the one with the oldest modified field, if no modified field keep
        // the local one.
        // If only one has a modified field keep the other one.
        if(tidFields.modified && exists.fields.modified) {
          if(tidFields.modified < exists.fields.modified) {
            $tw.syncadaptor.saveTiddler({fields: tidFields}, localName);
          }
          // otherwise don't do anything
        } else if(exists.fields.modified) {
          $tw.syncadaptor.saveTiddler({fields: tidFields}, localName);
        } else {
          // Either neither have a modified field or only the remote one does,
          // either way just keep the local one.
          return;
        }
      } else {
        // If the tiddler doesn't exist locally just add it.
        $tw.syncadaptor.saveTiddler({fields: tidFields}, localName);
      }
    }

    /*
      This requets specific tiddlers from a remote wiki using a filter.

      TODO figure out if the response to this should be split up into one message
      per tiddler instead of all of the tiddlers in one message.

      data:
      {
        wikiName: the name of the wiki to pull from,
        filter: requestFilter
      }
    */
    $tw.Bob.Federation.messageHandlers.requestTiddlers = function(data) {
      $tw.Bob.logger.log('receive requestTiddlers', {level: 4})
      data.wikiName = data.wikiName || 'RootWiki';
      data.filter = data.filter || '[!is[system]is[system]]';

      $tw.Bob.Federation.connections[data._source_info.url] = $tw.Bob.Federation.connections[data._source_info.url] || {};

      $tw.Bob.Federation.connections[data._source_info.url].socket = $tw.Bob.Federation.connections[data._source_info.url].socket || {};

      if(data._source_info && data.rnonce) {
        // Get the tiddlers
        const tiddlerTitles = $tw.Bob.Wikis[data.wikiName].wiki.filterTiddlers(data.filter);
        tiddlerTitles.forEach(function(tidTitle) {
          const tempTid = $tw.Bob.Wikis[data.wikiName].wiki.getTiddler(tidTitle);
          const tidObj = {};
          tidObj[encodeURIComponent(tidTitle)] = $tw.Bob.Shared.normalizeTiddler(tempTid).fields;//tempTid.fields;
          const message = {
            type: 'sendTiddlers',
            tiddlers: tidObj,
            nonce: data.rnonce,
            wikiName: data.wikiName
          }
          $tw.Bob.Federation.sendToRemoteServer(message, data._source_info);
        })
      }
    }

    /*
      This message asks a remote server to sync with the local server

      data {
        wikis: {
          wikiName1: filter1,
          wikiName2: filter2
        }
      }

      When receiving this message the receiving server will, if the
      authentication and everything is correct, request tiddlers from the sending
      server using the provided wikis and filters.
    */
    $tw.Bob.Federation.messageHandlers.requestRemoteSync = function(data) {
      // By this point the authentication has been done, so check to make sure
      // that the wikis are listed for syncing.
      Object.keys(data.wikis).forEach(function(wikiName) {
        const serverName = $tw.Bob.Federation.connections[data._source_info.url].name;
        // Get the tiddler name that has the information for the wiki
        const wikiInfoTid = $tw.Bob.Wikis[wikiName].wiki.getTiddler('$:/Bob/KnownServers/' + serverName + '/wikis/' + wikiName);
        if(wikiInfoTid) {
          // make sure that the wiki is set up to be synced
          if(['pull','bidirectional'].indexOf(wikiInfoTid.fields.sync_type)) {
            // Make the request for the tiddlers
            const message = {
              type: 'requestTiddlers',
              wikiName: wikiName,
              filter: data.wikis.wikiName
            }
            $tw.Bob.Federation.sendToRemoteServer(message, data._source_info);
          }
        }
      })
    }

    $tw.Bob.Federation.messageHandlers.chunk = function(data) {
      $tw.Bob.Federation.messageChunks = $tw.Bob.Federation.messageChunks || {};
      $tw.Bob.Federation.messageChunks[data.c] = $tw.Bob.Federation.messageChunks[data.c] || {};
      $tw.Bob.Federation.messageChunks[data.c][data.i] = Buffer.from(data.d);
      clearTimeout($tw.Bob.Federation.messageChunks[data.c].timer);
      if(Object.keys($tw.Bob.Federation.messageChunks[data.c]).length % 100 === 0) {
        $tw.Bob.logger.log('Receiving message chunks:', Object.keys($tw.Bob.Federation.messageChunks[data.c]).length + '/' + data.tot, {level: 3});
      }
      if(Object.keys($tw.Bob.Federation.messageChunks[data.c]).length === data.tot + 1) {
        clearTimeout($tw.Bob.Federation.messageChunks[data.c].timer);
        const outArray = Array(data.tot);
        for (let i = 0; i <= data.tot; i++) {
          outArray[i] = $tw.Bob.Federation.messageChunks[data.c][i];
        }
        const rebuilt = Buffer.concat(outArray.filter((x) => typeof x !== 'undefined'));
        $tw.Bob.Federation.handleMessage(rebuilt, data._source_info);
      } else {
        $tw.Bob.Federation.messageChunks[data.c].timer = setTimeout(requestResend, 500, data);
      }
    }

    function requestResend(data) {
      $tw.Bob.logger.log('request resend', {level: 4})
      const receivedArray = Object.keys($tw.Bob.Federation.messageChunks[data.c]);
      const message = {
        type: 'requestResend',
        received: receivedArray,
        mid: data.c
      };
      // Send the message
      $tw.Bob.Federation.sendToRemoteServer(message, data._source_info)
    }

    $tw.Bob.Federation.messageHandlers.requestResend = function(data) {
      $tw.Bob.logger.log('resend request received', {level: 4})
      // Make sure we have it saved
      $tw.Bob.Federation.chunkHistory = $tw.Bob.Federation.chunkHistory || {};
      if($tw.Bob.Federation.chunkHistory[data.mid]) {
        $tw.Bob.Federation.sendToRemoteServer(
          $tw.Bob.Federation.chunkHistory[data.mid].message,
          $tw.Bob.Federation.chunkHistory[data.mid].serverInfo,
          $tw.Bob.Federation.chunkHistory[data.mid].wiki,
          data.received);
      }
    }

    /*
      Sync servers takes a filter and syncs all of the tiddlers returned by the
      filter with a remote server.
      It should use the same process as the syncChanges message, possibly they
      should be combined.

      The data object has:
      {
        type: 'syncServer',
        wiki: wikiName,
        token: token,
        id: messageID,
        source_connection: connectionIndex,
        remoteUrl: remoteUrl,
        remoteWikis: [remoteWikiNames],
        sync_filter: sync_filter,
        sync_type: sync_type,
        conflict_type: conflict_type,
        remoteToken: remoteToken
      }

      this takes the tiddlers returned by the sync_filter in the wiki named in
      wikiName and syncs them with the server at remoteUrl using sync_type, any
      conflicts are handled using conflict_type. If the remote server requires an
      access token it has to be suppiled in remoteToken. If the remote wiki
      doesn't have the same name as the local wiki than it needs to be given as
      remoteWiki.

      remoteWikis is a list of wikki names to sync.

      sync_type can be:
        - pushOnly: local tiddlers are pushed to the remote server but no changes
        are pulled from the remote server.
        - pullOnly: changes on the remote server are fetched but no local
        tiddlers are sent.
        - bidirectional: local changes are sent and remote changes are pulled

      conflict_type can be:
        - localWins: if there are conflicts the local tiddlers are kept even if
        remote tiddlers have been changed, tiddlers that didn't exist previously
        are synced.
        - remoteWins: in the case of conflicts, remote tiddlers overwrite local
        tiddlers, only tiddlers that don't exist on the remote server are sent,
        if applicable.
        - (LATER) manual: every conflict is listed on the server that started the
        sync and a human has to manually resolve it. This reqires a message and
        interface for resolving conflicts.
        - (LATER) newestWins: in case of conflicts, the tiddlers with the most
        recent
        changes are kept regardless of which server it is from.
        - (LATER) oldestWins: least recently modified tiddlers are kept in case of
        conflicts.
    */
    $tw.Bob.Federation.messageHandlers.syncServer = function(data) {
      // We need at least the remote url or we can't act.
      if(data.remoteUrl) {
        // Try to connect to the remote server
        $tw.Bob.Federation.connections[data.remoteUrl] = $tw.Bob.Federation.connections[data.remoteUrl] || {}

        data.sync_filter = data.sync_filter || '[!is[system]]'
        data.sync_type = data.sync_type || 'bidirectional'
        data.conflict_type = data.conflict_type || 'newestWins'
        // Default to only syncing the current wiki
        data.remoteWikis = data.remoteWikis || data.wiki || 'RootWiki'

        $tw.Bob.Federation.connections[data.remoteUrl].socket = $tw.Bob.Federation.connections[data.remoteUrl].socket || {}
        $tw.Bob.Federation.connections[data.remoteUrl].pendingAction = 'sync'
        $tw.Bob.Federation.connections[data.remoteUrl].sync_filter = data.sync_filter
        $tw.Bob.Federation.connections[data.remoteUrl].sync_type = data.sync_type
        $tw.Bob.Federation.connections[data.remoteUrl].conflict_type = data.conflict_type
        $tw.Bob.Federation.connections[data.remoteUrl].remoteWikis = data.remoteWikis

        if($tw.Bob.Federation.connections[data.remoteUrl].socket.readyState !== 1) {
          // Get the url for the remote websocket
          const URL = require('url');
          const remoteUrl = new URL(data.remoteUrl);
          const WebSocket = require('$:/plugins/OokTech/Bob/External/WS/ws.js');
          const websocketProtocol = (remoteUrl.protocol.startsWith('https'))?'wss://':'ws://';
          // connect web socket
          const socket = new WebSocket(websocketProtocol + remoteUrl.host + remoteUrl.pathname);
          // Save the socket for future use
          $tw.Bob.Federation.connections[data.remoteUrl].socket = socket;
          socket.on('open', function() {
            startRemoteSync($tw.Bob.Federation.connections[data.remoteUrl]);
          })
          $tw.Bob.Federation.connections[data.remoteUrl].socket.on('message', function (message) {
            const messageData = JSON.parse(message);
            handleRemoteReply($tw.Bob.Federation.connections[data.remoteUrl], messageData);
          })
        } else {
          startRemoteSync($tw.Bob.Federation.connections[data.remoteUrl], data)
        }
      }
    }
    function startRemoteSync(remoteServerObject, data) {
      // Get a list of tiddlers from the local wiki that should be synced if
      // sync_type is bidirectional or pushOnly
      let pushList = []
      if(['bidirectional','pushOnly'].indexOf(data.sync_type) !== -1) {
        pushList = $tw.Bob.Wikis[data.wiki].filterTiddlers(data.sync_filter)
      }
      let tiddlerHashes = {}
      pushList.forEach(function(tidName) {
        tiddlerHashes[tidName] = $tw.Bob.Shared.getTiddlerHash(tidName)
      })
      // send a sync message with the filter and accompanying tiddler hashes.
      let message = {
        type: 'syncRequest',
        sync_type: data.sync_type,
        sync_filter: data.sync_filter,
        conflict_type: data.conflict_type
      }
      remoteServerObject.send(JSON.stringify(message), function ack(err) {if(err){console.log(err)}})
    }
    function handleRemoteReply(remoteServerObject, data) {
      if($tw.Bob.Federation.connections[data.remoteUrl].pendingAction == 'none') {
        return
      }
      // This receives the tiddlers that the remote server has and teh local
      // server doesn't
      // So save the received tiddlers
      remoteServerObject.remoteWikis.forEach(function(wikiName) {
        if(data[wikiName]) {
          Object.keys(data[wikiName]).forEach(function(tidName) {
            $tw.Bob.Wikis[wikiName].wiki.addTiddler(data[wikiName][tidName])
          })
        }
      })
    }
    function syncRequest(remoteServerObject, data) {
      let reply = {
        type:'remoteReply'
      }
      // The local server has already sent a list of hashes for local
      // tiddlers that match the sync filter. The remote replies with:
      //   A list of any tiddlers that the remote server is missing
      //   Any tiddlers that aren't listed in the sent hashes, because the
      //    local server doesn't have them.
      //   A list of remote tiddlers with conflicts If the sync is bi-directional
      //    or pullOnly
      if(data.missing) {
        // data.missing is in the form {wikiName: [tiddlerNames]}
        // These are the tiddlers that the remote server is missing
        // Gathere these tiddlers and send them back to the remote server
        // Make a list of all wikis the local server wants to sync, the remote
        // server could send much more than the local one wants and we want to
        // prevent malicious behaviour.
        remoteServerObject.remoteWikis.forEach(function(wikiName) {
          if(data.missing[wikiName]) {
            reply[wikiName] = {}
            // If the remote is missing tiddlers from a wiki retreive them and put them into an object.
            data.missing[wikiName].forEach(function(tidName) {
              // TODO Add some check to make sure that the remote is allowed to
              // get this tiddler.
              reply[wikiName][tidName] = $tw.Bob.Wikis[wikiName].wiki.getTiddler(tidName)
            })
          }
        })
      }
      if(data.tiddlers) {
        // data.tiddlers is in the form {wikiName1:[tiddlers],wikiName2:[tiddlers]}
        // These are tiddlers the local server is missing, add them to the local
        // wiki.
        remoteServerObject.remoteWikis.forEach(function(wikiName) {
          if(data.tiddlers[wikiName]) {
            data.tiddlers[wikiName].forEach(function(tidName) {
              // TODO add some check to make sure that we can have some way to
              // filter which tiddlers are actually saved.
              $tw.Bob.Wikis[wikiName].wiki.addTiddler(data.tiddlers[wikiName][tidName])
            })
          }
        })
        // Send reply
        // TODO figure this out
      }
      // Bi-directional sync with oldest or newest wins is gonig to require more
      // work
      if(data.conflicts) {
        // data.conflicts is in the form {wikiName1:[tiddlers],wikiName2:[tiddlers]}
        // These are tiddlers that have been changed on both servers
        // This may mean that it has to have a persistent record of changes.

        // TODO this bit
      }
    }
  }
}
})();
