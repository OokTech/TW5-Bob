/*\
title: $:/plugins/OokTech/Bob/action-downloadwiki.js
type: application/javascript
module-type: widget

An action widget to download the current wiki with optinal filters on the
output tiddlers.

<$action-downloadwiki excludeFilter='excludeFilter' ignoreDefaultExclude=false/>

you can optionally give an include or exclude filter that lists tiddlers to
include/exclude from the built wiki. If none are given than all tiddlers in the
wiki are exported with the execption of the default exclude list (Bob and other
plugins that don't do anything for single file wikis.)

alternatively you can give an include filter that lists all of the tiddlers to
include in the output wiki. If an include filter is given than the exclude
filter input is ignored if it exists.

If you have some specific reason you can set ignoreDefaultExclude to true and
it will ignore the default set of tiddlers to exclude.

Unless ignoreDefaultExclude is set than the default exclude list is used for
both include and exclude filters.

|!Parameter |!Description |
|!includeFilter |An optional filter that returns all tiddlers to inclued in the output wiki. If nothing is given than the whole wiki is included. |
|!excludeFilter |An optional filter that returns tiddlers to exclude from the downloaded wiki. If this lists a tiddler that is also returned by the includeFilter than the excludeFilter takes presidence. Defaults to an empty list so nothing is excluded. |
|!ignoreDefaultExclude |If this is set to `true` than the default exclude list is ignored. The default exclude list includes the Bob plugin and other things that either break single file wikis or do nothing in single file wikis, so don't set this unless you have a specific reason. |

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const Widget = require("$:/core/modules/widgets/widget.js").widget;

const ActionDownloadWiki = function(parseTreeNode,options) {
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
  this.includeFilter = this.getAttribute('includeFilter',undefined)
  this.ignoreDefaultExclude = this.getAttribute('ignoreDefaultExclude', false)
  this.defaultName = this.getAttribute('defaultName', 'index.html')
  this.core = this.getAttribute('core', '$:/core')
};

/*
Refresh the widget by ensuring our attributes are up to date
*/
ActionDownloadWiki.prototype.refresh = function(changedTiddlers) {
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
ActionDownloadWiki.prototype.invokeAction = function(triggeringWidget,event) {
  // Otherwise we want to ignore the server-specific plugins to keep things
  // small.
  let excludeList = ['$:/plugins/OokTech/Bob', '$:/plugins/tiddlywiki/filesystem', '$:/plugins/tiddlywiki/tiddlyweb'];
  if(this.excludeFilter) {
    excludeList = $tw.wiki.filterTiddlers(this.excludeFilter)
  }

  if(this.ignoreDefaultExclude !== 'true') {
    const defaultExclude = $tw.wiki.filterTiddlers('[prefix[$:/plugins/OokTech/Bob/]][[$:/plugins/OokTech/Bob]][prefix[$:/WikiSettings]][prefix[$:/Bob/]][[$:/ServerIP]][[$:/plugins/tiddlywiki/filesystem]][[$:/plugins/tiddlywiki/tiddlyweb]]');
    excludeList = excludeList.concat(defaultExclude);
  }

  let options = {};
  let tempWiki = new $tw.Wiki();
  // Load the boot tiddlers
  tempWiki.addTiddler($tw.wiki.getTiddler(this.core))
  tempWiki.addTiddler($tw.wiki.getTiddler('$:/boot/boot.css'))
  tempWiki.addTiddler($tw.wiki.getTiddler('$:/boot/boot.js'))
  tempWiki.addTiddler($tw.wiki.getTiddler('$:/boot/bootprefix.js'))
  tempWiki.addTiddler($tw.wiki.getTiddler('$:/themes/tiddlywiki/vanilla'))
  let includeList
  if(this.includeFilter) {
    includeList = $tw.wiki.filterTiddlers(this.includeFilter)
  } else {
    includeList = $tw.wiki.allTitles()
  }
  includeList.filter(function(item) {return excludeList.indexOf(item) === -1}).forEach(function(title) {
    tempWiki.addTiddler($tw.wiki.getTiddler(title))
  })

  tempWiki.registerPluginTiddlers("plugin", [this.core]);
  // Unpack plugin tiddlers
  tempWiki.readPluginInfo();
  tempWiki.unpackPluginTiddlers();

  const text = tempWiki.renderTiddler("text/plain", "$:/core/save/all", options);

  let a = document.createElement('a');
  // This is the suggested file name for the download on systems that support
  // it.
  a.download = this.defaultName;
  const thisStr = 'data:text/html;base64,'+window.btoa(unescape(encodeURIComponent(text)));
  a.setAttribute('href', thisStr);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);


  return true; // Action was invoked
}

exports["action-downloadwiki"] = ActionDownloadWiki;

})();
