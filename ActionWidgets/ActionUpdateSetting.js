/*\
title: $:/plugins/OokTech/Bob/action-updatesetting.js
type: application/javascript
module-type: widget

Action widget to add or change one or more values in settings.json

<$action-updatesetting setting1=value1 setting2=value2/>

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const Widget = require("$:/core/modules/widgets/widget.js").widget;

const ActionUpdateSetting = function(parseTreeNode,options) {
  this.initialise(parseTreeNode,options);
};

/*
Inherit from the base widget class
*/
ActionUpdateSetting.prototype = new Widget();

/*
Render this widget into the DOM
*/
ActionUpdateSetting.prototype.render = function(parent,nextSibling) {
  this.computeAttributes();
  this.execute();
};

/*
Compute the internal state of the widget
*/
ActionUpdateSetting.prototype.execute = function() {
};

/*
Refresh the widget by ensuring our attributes are up to date
*/
ActionUpdateSetting.prototype.refresh = function(changedTiddlers) {
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
ActionUpdateSetting.prototype.invokeAction = function(triggeringWidget,event) {
  const wikiName = $tw.wiki.getTiddlerText("$:/WikiName");
  let update = {};
  let remove = false;
  $tw.utils.each(this.attributes,function(name,attribute) {
    if(attribute.startsWith("$")) {
      if(attribute === "$remove") {
        remove = name;
      }
    } else {
      try {
        update[attribute] = JSON.parse(name);
      } catch (e) {
        update[attribute] = name;
      }
    }
  });
  const message = {
    "type": "updateSetting",
    "updateString": update,
    "remove": remove,
    "wiki": wikiName
  };
  $tw.Bob.Shared.sendMessage(message, 0);
  return true; // Action was invoked
};

exports["action-updatesetting"] = ActionUpdateSetting;

})();
