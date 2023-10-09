/*\
title: $:/plugins/OokTech/Bob/action-websocketmessage.js
type: application/javascript
module-type: widget

Action widget to send a websocket message to the node process

<$action-websocketmessage $type=type $param=value/>

Any other key=value pairs will be added to the JSON message sent

ex:

<$action-websocketmessage $type=git $param=pull branch=foo/>

sends:

{
  "type": "git",
  "value": "pull",
  "branch": foo
}

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const Widget = require("$:/core/modules/widgets/widget.js").widget;

const ActionWebSocketMessage = function(parseTreeNode,options) {
  this.initialise(parseTreeNode,options);
};

/*
Inherit from the base widget class
*/
ActionWebSocketMessage.prototype = new Widget();

/*
Render this widget into the DOM
*/
ActionWebSocketMessage.prototype.render = function(parent,nextSibling) {
  this.computeAttributes();
  this.execute();
};

/*
Compute the internal state of the widget
*/
ActionWebSocketMessage.prototype.execute = function() {
  this.type = this.getAttribute('$type', undefined);
  this.param = this.getAttribute('$param', undefined);
  this.tiddler = this.getAttribute('$tiddler', undefined);
};

/*
Refresh the widget by ensuring our attributes are up to date
*/
ActionWebSocketMessage.prototype.refresh = function(changedTiddlers) {
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
ActionWebSocketMessage.prototype.invokeAction = function(triggeringWidget,event) {
  // Create the empty message object
  let message = {
    'sessionId': sessionStorage.getItem('sessionId')
  };
  // Add in the message type and param, if they exist
  message.type = this.type;
  message.param = this.param;
  if(this.tiddler) {
    message.tid_param = $tw.wiki.getTiddler(this.tiddler).fields;
  }

  // This is needed for when you serve multiple wikis
  const wikiName = $tw.wiki.getTiddlerText("$:/WikiName");
  message.wiki = wikiName?wikiName:'';

  // For any other attributes passed to the widget add them to the message as
  // key: value pairs
  $tw.utils.each(this.attributes,function(attribute,name) {
    //if(name.charAt(0) !== "$") {
    if(['$type', '$param', '$tiddler'].indexOf(name) === -1) {
      message[name] = attribute;
    }
  });
  // We need a message type at a minimum to send anything
  if(message.type) {
    // Send the message
    $tw.Bob.Shared.sendMessage(message, 0)
  }

  return true; // Action was invoked
};

exports["action-websocketmessage"] = ActionWebSocketMessage;

})();
