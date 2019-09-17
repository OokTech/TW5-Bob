/*\
title: $:/plugins/OokTech/Bob/Federation/chatview.js
type: application/javascript
module-type: widget

A widget that creates a view of a chat hisotry.

\*/

(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const Widget = require("$:/core/modules/widgets/widget.js").widget;

const ChatView = function(parseTreeNode,options) {
  this.initialise(parseTreeNode,options);
};

/*
Inherit from the base widget class
*/
ChatView.prototype = new Widget();

/*
Render this widget into the DOM
*/
ChatView.prototype.render = function(parent,nextSibling) {
  this.parentDomNode = parent;
  this.computeAttributes();
  this.execute();

  this.id = this.id || Math.random()*1000;
  // The full container div
  const containerDiv = this.document.createElement('div');
  containerDiv.classList.add(this.class);
  containerDiv.id = this.id;
  // The tiddler should be a json tiddler so we get the json object here
  const historyTiddlerThing = this.wiki.getTiddler(this.historyTiddler)
  let chatHistoryObject = {};
  if (historyTiddlerThing) {
    try {
      chatHistoryObject = JSON.parse(historyTiddlerThing.fields.text);
    } catch {

    }
  }
  const self = this;
  // For each line in the history append a div with that message in it.
  Object.keys(chatHistoryObject).slice().sort().forEach(function(messageTimestamp, messageIndex) {
    const dateDisplay = $tw.utils.parseDate(messageTimestamp).getDay() + '/' + ($tw.utils.parseDate(messageTimestamp).getMonth() + 1) + '/' + ($tw.utils.parseDate(messageTimestamp).getFullYear()%100) + '-' + $tw.utils.parseDate(messageTimestamp).getHours() + ':' + $tw.utils.pad($tw.utils.parseDate(messageTimestamp).getMinutes(),2) + ':' + $tw.utils.pad($tw.utils.parseDate(messageTimestamp).getSeconds(),2);
    const newElement = document.createElement('div');
    newElement.innerHTML = `${dateDisplay}: ${chatHistoryObject[messageTimestamp]}`;
    if (messageIndex % 2 === 0) {
      newElement.classList.add('defaultChatHistoryViewEvenMessages');
    } else {
      newElement.classList.add('defaultChatHistoryViewOddMessages');
    }
    containerDiv.appendChild(newElement);
  })

  parent.insertBefore(containerDiv,nextSibling);
  this.renderChildren(containerDiv,null);

  // This determines if the div is scrolled to the bottom, if so than
  // the text scrolls up, if not than the div position is maintained so
  // it doesn't move what you are looking at out of frame.
  const isScrolledToBottom = this.scrollPosition + containerDiv.clientHeight >= containerDiv.scrollHeight - 25;
  if (this.scrollPosition === 0) {
    this.scrollPosition = containerDiv.scrollHeight;
  }

  if (isScrolledToBottom) {
    containerDiv.scrollTop = containerDiv.scrollHeight;
  } else {
    containerDiv.scrollTop = this.scrollPosition;
  }
  this.domNodes.push(containerDiv);
};

/*
Compute the internal state of the widget
*/
ChatView.prototype.execute = function() {
  //Get widget attributes.
  this.historyTiddler = this.getAttribute('tiddler', '$:/chat/DefaultChat');
  this.historyLimit = this.getAttribute('limit', 100);
  this.class = this.getAttribute('class', 'defaultChatHistoryView');
  this.scrollPosition = this.scrollPosition || 0;
};

/*
Refresh the widget by ensuring our attributes are up to date
*/
ChatView.prototype.refresh = function(changedTiddlers) {
  const changedAttributes = this.computeAttributes();
  if(Object.keys(changedAttributes).length > 0 || changedTiddlers[this.historyTiddler]) {
    const containerDiv = this.document.getElementById(this.id);
    this.scrollPosition = containerDiv.scrollTop;
    this.refreshSelf();
    return true;
  }
  return true;
};

exports["chatview"] = ChatView;

})();
