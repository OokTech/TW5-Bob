/*\
title: $:/plugins/OokTech/Bob/BrowserWSAdaptor.js
type: application/javascript
module-type: syncadaptor

A sync adaptor for syncing changes using websockets with Bob

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

function BrowserWSAdaptor(options) {
  this.wiki = options.wiki;
}

// REQUIRED
// The name of the syncer
BrowserWSAdaptor.prototype.name = "browserwsadaptor"

// REQUIRED
// Tiddler info, can be left like this but must be present
BrowserWSAdaptor.prototype.getTiddlerInfo = function() {
  return {}
}

// REQUIRED
// This does whatever is necessary to actually store a tiddler
BrowserWSAdaptor.prototype.saveTiddler = function (tiddler, callback) {
  console.log('save', tiddler.fields.title)
  function handleAck(ackId) {
    console.log('ack', ackId, id)
    console.log('save tiddler handle ack')
    if (ackId === id) {
      callback(null, null)
      //this.removeEventListener(handleAck)
    }
  }
  if (!this.shouldSync(tiddler.fields.title) || !tiddler) {
    callback(null);
  }
  const token = localStorage.getItem('ws-token')
  let tempTid = {fields:{}};
  Object.keys(tiddler.fields).forEach(function (field) {
      if(field !== 'created' && field !== 'modified') {
        tempTid.fields[field] = tiddler.fields[field];
      } else {
        tempTid.fields[field] = $tw.utils.stringifyDate(tiddler.fields[field]);
      }
    }
  );
  const message = {
    type: 'saveTiddler',
    tiddler: tempTid,
    wiki: $tw.wikiName,
    token: token
  };
  const id = sendToServer(message);
  $tw.rootWidget.addEventListener('handle-ack', function(e) {
    handleAck(e.detail)
  })
}

// REQUIRED
// This does whatever is necessary to load a tiddler.
// Used for lazy loading
BrowserWSAdaptor.prototype.loadTiddler = function (title, callback) {
  callback(null, null);
}

// REQUIRED
// This does whatever is necessary to delete a tiddler
BrowserWSAdaptor.prototype.deleteTiddler = function (title, callback, options) {
  function handleAck(e) {
    console.log('ack', e)
    console.log('received ack')
    if (e === id) {
      callback(null, null)
      this.removeEventListener(handleAck)
    }
  }
  if (!this.shouldSync(title)) {
    callback(null);
  }
  // We have an additional check for tiddlers that start with
  // $:/state because popups get deleted before the check is done.
  // Without this than every time there is a popup the dirty
  // indicator turns on
  const token = localStorage.getItem('ws-token');
  const message = {
    type: 'deleteTiddler',
    tiddler:{
      fields:{
        title:title
      }
    },
    wiki: $tw.wikiName,
    token: token
  };
  const id = sendToServer(message);
  $tw.rootWidget.addEventListener('handle-ack', function(e) {
    handleAck(e.detail)
  })
}

BrowserWSAdaptor.prototype.shouldSync = function(tiddlerTitle) {
  // assume that we are never syncing state and temp tiddlers.
  // This may change later.
  if (tiddlerTitle.startsWith('$:/state/') || tiddlerTitle.startsWith('$:/temp/')) {
    return false;
  }
  // If the changed tiddler is the one that holds the exclude filter
  // than update the exclude filter.
  if(tiddlerTitle === '$:/plugins/OokTech/Bob/ExcludeSync') {
    $tw.Bob.ExcludeFilter = $tw.wiki.getTiddlerText('$:/plugins/OokTech/Bob/ExcludeSync');
  }
  const list = $tw.wiki.filterTiddlers($tw.Bob.ExcludeFilter);
  if(list.indexOf(tiddlerTitle) === -1) {
    return true;
  } else {
    return false;
  }
}

/*
// OPTIONAL
// Returns true if the syncer is ready, otherwise false
// This can be updated at any time, it gets checked when a syncing task is
// being run so its value can change over time.
BrowserWSAdaptor.prototype.isReady = function() {
  console.log('is ready')
  return true
}

// OPTIONAL
// This checks the login state
// it can be used to give an async way to check the status and update the
// isReady state. The tiddlyweb adaptor does this.
BrowserWSAdaptor.prototype.getStatus = function(callback) {

}

// OPTIONAL
// A login thing, need specifics
BrowserWSAdaptor.prototype.login = function (username, password, callback) {

}

// OPTIONAL
// A logout thing, need specifics
BrowserWSAdaptor.prototype.logout = function (callback) {

}
*/

// OPTIONAL
// Loads skinny tiddlers, need specifics
if ($tw.settings['ws-server']) {
if ($tw.settings['ws-server'].rootTiddler === "$:/core/save/lazy-all") {
  BrowserWSAdaptor.prototype.getSkinnyTiddlers = function (callback) {
    function handleAck(e) {
      console.log('ack', e)
      if (e === id) {
        callback(null,tiddlers);
        this.removeEventListener(handleAck)
      }
    }
    function sendThing() {
      function setSendThingTimeout() {
        setTimeout(function() {
          if ($tw.connections) {
            if($tw.connections[0].socket.readyState === 1) {
              id = sendToServer(message)
              $tw.rootWidget.addEventListener('handle-ack', function(e) {
                handleAck(e.detail)
              })
            } else {
              setSendThingTimeout()
            }
          } else {
            setSendThingTimeout()
          }
        }, 100)
      }
      if ($tw.connections) {
        if($tw.connections[0].socket.readyState === 1) {
          id = sendToServer(message)
          $tw.rootWidget.addEventListener('handle-ack', function(e) {
            handleAck(e.detail)
          })
        } else {
          setSendThingTimeout()
        }
      } else {
        setSendThingTimeout()
      }
    }
    console.log('get skinny')
    const message = {
      type: 'getSkinnyTiddlers',
      wiki: $tw.wikiName
    }
    let id
    sendThing()
    //const id = sendToServer(message)
    /*
    var self = this;
    $tw.utils.httpRequest({
      url: this.host + "recipes/" + this.recipe + "/tiddlers.json",
      callback: function(err,data) {
        // Check for errors
        if(err) {
          return callback(err);
        }
        // Process the tiddlers to make sure the revision is a string
        var tiddlers = JSON.parse(data);
        for(var t=0; t<tiddlers.length; t++) {
          tiddlers[t] = self.convertTiddlerFromTiddlyWebFormat(tiddlers[t]);
        }
        // Invoke the callback with the skinny tiddlers
        callback(null,tiddlers);
      }
    });
    */
  }
}
}

const sendToServer = function (message) {
  const tiddlerText = $tw.wiki.getTiddlerText('$:/plugins/OokTech/Bob/Unsent', '');
  //if ($tw.Bob.MessageQueue.filter(function(item){return (typeof item.ctime) === 'undefined'}).length > 0 && tiddlerText !== '') {
  /*
  if ($tw.Bob.MessageQueue.length > 0 && tiddlerText !== '') {
    // Turn on the dirty indicator
    $tw.utils.toggleClass(document.body,"tc-dirty",true);
  }
  */
  // If the connection is open, send the message
  if($tw.connections[0].socket.readyState === 1) {
    const messageData = $tw.Bob.Shared.sendMessage(message, 0);
    return messageData.id;
  } else {
    // If the connection is not open than store the message in the queue
    const tiddler = $tw.wiki.getTiddler('$:/plugins/OokTech/Bob/Unsent');
    let queue = [];
    let start = Date.now();
    if(tiddler) {
      if(typeof tiddler.fields.text === 'string') {
        queue = JSON.parse(tiddler.fields.text);
      }
      if(tiddler.fields.start) {
        start = tiddler.fields.start;
      }
    }
    // Check to make sure that the current message is eligible to be saved
    const messageData = $tw.Bob.Shared.createMessageData(message)
    if($tw.Bob.Shared.messageIsEligible(messageData, 0, queue)) {
      // Prune the queue and check if the current message makes any enqueued
      // messages redundant or overrides old messages
      queue = $tw.Bob.Shared.removeRedundantMessages(messageData, queue);
      // Don't save any messages that are about the unsent list or you get
      // infinite loops of badness.
      if(messageData.title !== '$:/plugins/OokTech/Bob/Unsent') {
        queue.push(messageData);
      }
      const tiddler2 = {
        title: '$:/plugins/OokTech/Bob/Unsent',
        text: JSON.stringify(queue, '', 2),
        type: 'application/json',
        start: start
      };
      $tw.wiki.addTiddler(new $tw.Tiddler(tiddler2));
    }
  }
}

// Replace this with whatever conditions are required to use your adaptor
if ($tw.browser) {
  exports.adaptorClass = BrowserWSAdaptor
}

})();