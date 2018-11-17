/*\
title: $:/plugins/OokTech/Bob/action-downloadwiki.js
type: application/javascript
module-type: widget

Action widget to take an input html file and split it into a node wiki

<$action-downloadwiki excludeFilter='excludeFilter' ignoreDefaultExclude=false/>

you can give an exclude filter that lists tiddlers to exclude from the built
wiki.

If you have some specific reason you can set ignoreDefaultExclude to true and
it will ignore the default set of tiddlers to exclude.
\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var ActionDownloadWiki = function(parseTreeNode,options) {
	this.initialise(parseTreeNode,options);
};

/*
Inherit from the base widget class
*/
ActionDownloadWiki.prototype = new Widget();

/*
Render this widget into the DOM
*/
ActionDownloadWiki.prototype.render = function(parent,nextSibling) {
	this.computeAttributes();
	this.execute();
};

/*
Compute the internal state of the widget
*/
ActionDownloadWiki.prototype.execute = function() {
	this.excludeFilter = this.getAttribute('excludeFilter',undefined)
  this.ignoreDefaultExclude = this.getAttribute('ignoreDefaultExclude', false)
};

/*
Refresh the widget by ensuring our attributes are up to date
*/
ActionDownloadWiki.prototype.refresh = function(changedTiddlers) {
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
ActionDownloadWiki.prototype.invokeAction = function(triggeringWidget,event) {
  // Otherwise we want to ignore the server-specific plugins to keep things
  // small.
  var excludeList = ['$:/plugins/OokTech/Bob', '$:/plugins/tiddlywiki/filesystem', '$:/plugins/tiddlywiki/tiddlyweb'];
  if (this.excludeFilter) {
    excludeList = $tw.wiki.filterTiddlers(this.excludeFilter)
  }

  if (this.ignoreDefaultExclude !== 'true') {
    var defaultExclude = $tw.wiki.filterTiddlers('[prefix[$:/plugins/OokTech/Bob/]][[$:/plugins/OokTech/Bob]][prefix[$:/WikiSettings]][prefix[$:/Bob/]][[$:/ServerIP]][[$:/plugins/tiddlywiki/filesystem]][[$:/plugins/tiddlywiki/tiddlyweb]]');
    excludeList = excludeList.concat(defaultExclude);
  }

  var options = {};
  var tempWiki = new $tw.Wiki();
  // Load the boot tiddlers
  tempWiki.addTiddler($tw.wiki.getTiddler('$:/core'))
  $tw.wiki.allTitles().filter(function(item) {return excludeList.indexOf(item) === -1}).forEach(function(title) {
    tempWiki.addTiddler($tw.wiki.getTiddler(title))
  })

  tempWiki.registerPluginTiddlers("plugin", ["$:/core"]);
  // Unpack plugin tiddlers
  tempWiki.readPluginInfo();
  tempWiki.unpackPluginTiddlers();

  var text = tempWiki.renderTiddler("text/plain", "$:/core/save/all", options);

  let a = document.createElement('a');
  a.download = 'index.html';
  var thisStr = 'data:text/html;base64,'+window.btoa(unescape(encodeURIComponent(text)));
  a.setAttribute('href', thisStr);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);


  return true; // Action was invoked
}

exports["action-downloadwiki"] = ActionDownloadWiki;

})();
