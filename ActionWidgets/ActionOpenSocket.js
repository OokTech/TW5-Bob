/*\
title: $:/plugins/OokTech/Bob/action-opensocket.js
type: application/javascript
module-type: widget

Action widget that creates a new websocket connection to another server

<$action-opensocket $url=<<someURL>> blah=halb/>

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const Widget = require("$:/core/modules/widgets/widget.js").widget;

const ActionOpenSocket = function(parseTreeNode,options) {
  this.initialise(parseTreeNode,options);
};

/*
Inherit from the base widget class
*/
ActionOpenSocket.prototype = new Widget();

/*
Render this widget into the DOM
*/
ActionOpenSocket.prototype.render = function(parent,nextSibling) {
  this.computeAttributes();
  this.execute();
};

/*
Compute the internal state of the widget
*/
ActionOpenSocket.prototype.execute = function() {
  this.remoteURL = this.getAttribute('$url', '');
};

/*
Refresh the widget by ensuring our attributes are up to date
*/
ActionOpenSocket.prototype.refresh = function(changedTiddlers) {
  const changedAttributes = this.computeAttributes();
  if(Object.keys(changedAttributes).length) {
    this.refreshSelf();
    return true;
  }
  return this.refreshChildren(changedTiddlers);
};

/*
Invoke the action associated with this widget
*/
ActionOpenSocket.prototype.invokeAction = function(triggeringWidget,event) {
  $tw.RemoteConnection  = $tw.RemoteConnection || {};
  if(this.remoteURL) {
    $tw.RemoteConnection.socket = new WebSocket(this.remoteURL);
    $tw.RemoteConnection.socket.onopen = openSocket;
    $tw.RemoteConnection.socket.onmessage = parseMessage;
    $tw.RemoteConnection.socket.binaryType = "arraybuffer";
  }
  return true; // Action was invoked
};

function openSocket(event) {
  console.log(event.target)
  event.target.send('HI!', function (ack) {
    console.log('error in sending in openSocket function')
  })
}

function parseMessage() {

}

exports["action-opensocket"] = ActionOpenSocket;

})();
