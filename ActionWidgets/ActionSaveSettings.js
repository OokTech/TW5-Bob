/*\
title: $:/plugins/OokTech/Bob/action-savesettings.js
type: application/javascript
module-type: widget

Action widget to save the settings to the server

<$action-savesettings/>

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const Widget = require("$:/core/modules/widgets/widget.js").widget;

const ActionSaveSettings = function(parseTreeNode,options) {
  this.initialise(parseTreeNode,options);
};

/*
Inherit from the base widget class
*/
ActionSaveSettings.prototype = new Widget();

/*
Render this widget into the DOM
*/
ActionSaveSettings.prototype.render = function(parent,nextSibling) {
  this.computeAttributes();
  this.execute();
};

/*
Compute the internal state of the widget
*/
ActionSaveSettings.prototype.execute = function() {
};

/*
Refresh the widget by ensuring our attributes are up to date
*/
ActionSaveSettings.prototype.refresh = function(changedTiddlers) {
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
ActionSaveSettings.prototype.invokeAction = function(triggeringWidget,event) {
  let self = this;
  const tiddler = $tw.wiki.getTiddler('$:/WikiSettings/split');
  const settings = JSON.stringify(buildSettings(tiddler), "", 2);
  const wikiName = $tw.wiki.getTiddlerText("$:/WikiName");
  const message = {
    "type": "updateSetting",
    "settingsString": settings,
    "wiki": wikiName
  }
  $tw.Bob.Shared.sendMessage(message, 0)
  return true; // Action was invoked
};

function buildSettings (tiddler) {
  let settings = {};
  if(tiddler) {
    if(tiddler.fields) {
      let object = (typeof tiddler.fields.text === 'string')?JSON.parse(tiddler.fields.text):tiddler.fields.text;
      Object.keys(object).forEach(function (field) {
        if(typeof object[field] === 'string' || typeof object[field] === 'number') {
          if(String(object[field]).startsWith('$:/WikiSettings/split')) {
            // Recurse!
            const newTiddler = $tw.wiki.getTiddler(object[field]);
            settings[field] = buildSettings(newTiddler);
          } else {
            // Actual thingy!
            settings[field] = object[field];
          }
        } else {
          settings[field] = "";
        }
      });
    }
  }
  return settings;
}

exports["action-savesettings"] = ActionSaveSettings;

})();
