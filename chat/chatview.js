/*\
title: $:/plugins/OokTech/Bob/Federation/chatview.js
type: application/javascript
module-type: widget

A widget that creates a view of a chat hisotry.

TODO get something to indicate if different messages have been seen or not.

Probably go through each div and see if it has been completely inside the
visible part of the text.

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
  const historyTiddlerThing = this.wiki.getTiddler(this.historyTiddler);
  let chatHistoryObject = {};
  if(historyTiddlerThing) {
    try {
      chatHistoryObject = JSON.parse(historyTiddlerThing.fields.text);
    } catch (e) {

    }
  }
  const format = this.format || '0hh:0mm:0ss';
  // For each line in the history append a div with that message in it.
  Object.keys(chatHistoryObject).slice().sort().forEach(function(messageTimestamp, messageIndex) {
    if(!chatHistoryObject[messageTimestamp].message) {
      return;
    }
    const dateDisplay = $tw.utils.formatDateString($tw.utils.parseDate(messageTimestamp),format);
    const newElement = document.createElement('div');
    newElement.innerHTML = `<span
        class='chatDateDisplay'
      >
        ${dateDisplay}
      </span>
      <span
        class='chatNameDisplay'
      >
        ${chatHistoryObject[messageTimestamp].from || 'Nameless Interloper'}:
      </span>
      <span
        class='chatMessageDisplay'
      >
        ${chatHistoryObject[messageTimestamp].message}
      </span>`;
    if(messageIndex % 2 === 0) {
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
  const isScrolledToBottom = this.scrollPosition + containerDiv.clientHeight >= containerDiv.scrollHeight - 50;
  if(this.scrollPosition === 0) {
    this.scrollPosition = containerDiv.scrollHeight;
  }

  if(isScrolledToBottom) {
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
  this.format = this.getAttribute('format', '0hh:0mm:0ss');
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
