/*\
title: $:/plugins/OokTech/MultiUser/WS/ws.js
type: application/javascript
module-type: library

This is the ws npm module that adds websockets to the node process.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */


/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const WebSocket = require('$:/plugins/OokTech/MultiUser/WS/WebSocket');

WebSocket.Server = require('$:/plugins/OokTech/MultiUser/WS/WebSocketServer');
WebSocket.Receiver = require('$:/plugins/OokTech/MultiUser/WS/Receiver');
WebSocket.Sender = require('$:/plugins/OokTech/MultiUser/WS/Sender');

module.exports = WebSocket;

})();
