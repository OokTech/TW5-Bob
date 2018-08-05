/*\
title: $:/plugins/OokTech/Bob/action-reconnectwebsocket.js
type: application/javascript
module-type: widget

Action widget that reconnects to a wiki server

<$action-reconnectwebsocket/>

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var ActionReconnect = function(parseTreeNode,options) {
  this.initialise(parseTreeNode,options);
};

/*
Inherit from the base widget class
*/
ActionReconnect.prototype = new Widget();

/*
Render this widget into the DOM
*/
ActionReconnect.prototype.render = function(parent,nextSibling) {
  this.computeAttributes();
  this.execute();
};

/*
Compute the internal state of the widget
*/
ActionReconnect.prototype.execute = function() {
  this.sync = this.getAttribute('sync', 'false');
};

/*
Refresh the widget by ensuring our attributes are up to date
*/
ActionReconnect.prototype.refresh = function(changedTiddlers) {
  var changedAttributes = this.computeAttributes();
  if(Object.keys(changedAttributes).length) {
    this.refreshSelf();
    return true;
  }
  return this.refreshChildren(changedTiddlers);
};

/*
Invoke the action associated with this widget
*/
ActionReconnect.prototype.invokeAction = function(triggeringWidget,event) {
  $tw.Bob.Reconnect(this.sync);
  return true; // Action was invoked
};

exports["action-reconnectwebsocket"] = ActionReconnect;

})();
