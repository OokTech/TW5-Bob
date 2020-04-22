/*\
title: $:/plugins/OokTech/Bob/action-setcookie.js
type: application/javascript
module-type: widget

Action widget that sets a browser cookie

Set the value to "" to clear the cookie.

<$action-setcookie name=cookieName value=cookieValue/>

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const Widget = require("$:/core/modules/widgets/widget.js").widget;

const ActionSetCookie = function(parseTreeNode,options) {
  this.initialise(parseTreeNode,options);
};

/*
Inherit from the base widget class
*/
ActionSetCookie.prototype = new Widget();

/*
Render this widget into the DOM
*/
ActionSetCookie.prototype.render = function(parent,nextSibling) {
  this.computeAttributes();
  this.execute();
};

/*
Compute the internal state of the widget
*/
ActionSetCookie.prototype.execute = function() {
  this.name = this.getAttribute('name', '');
  this.value = this.getAttribute('value', '');
};

/*
Refresh the widget by ensuring our attributes are up to date
*/
ActionSetCookie.prototype.refresh = function(changedTiddlers) {
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
ActionSetCookie.prototype.invokeAction = function(triggeringWidget,event) {
  $tw.setcookie(this.name, this.value);
  return true; // Action was invoked
};

exports["action-setcookie"] = ActionSetCookie;

})();
