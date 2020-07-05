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

const delayRecord = {};

const sendToServer = function (message, callback) {
  const connectionIndex = 0;
  // If the connection is open, send the message
  if($tw.connections[connectionIndex].socket.readyState === 1) {
    // We need to add back in some of our old queue logic here to make sure we aren't spamming save tiddler messages on every keystroke.
    // We have the callback passed in so that we can add a delay here before sending save messages so we don't send them too quickly, it is the same as the typing delay for the draft refresh stuff in the core.
    //if(false && message.type === 'saveTiddler') {
    if(message.type === 'saveTiddler') {
      delayRecord[message.tiddler.fields.title] = delayRecord[message.tiddler.fields.title] || {};
      if(typeof delayRecord[message.tiddler.fields.title].cb === 'function') {
        // Clear the callback so we don't mess up the dirty status.
        delayRecord[message.tiddler.fields.title].cb(null, null);
      }
      clearTimeout(delayRecord[message.tiddler.fields.title].timeout);
      delayRecord[message.tiddler.fields.title].cb = callback
      delayRecord[message.tiddler.fields.title].message = message
      delayRecord[message.tiddler.fields.title].timeout = setTimeout( function() {
        try {
          $tw.Bob.Shared.sendMessage(delayRecord[message.tiddler.fields.title].message, 0);
          delayRecord[message.tiddler.fields.title].cb(null, null);
          delayRecord[message.tiddler.fields.title] = undefined;
        } catch (e) {
          // nothing here
        }

      }, 150);
      return false;
    } else {
      const messageData = $tw.Bob.Shared.sendMessage(message, 0);
      return messageData.id;
    }
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

function BrowserWSAdaptor(options) {
  this.wiki = options.wiki;
  this.idList = [];

  $tw.browserMessageHandlers = $tw.browserMessageHandlers || {};
  // Ensure that the needed objects exist
  $tw.Bob = $tw.Bob || {};
  // Import shared commands
  $tw.Bob.Shared = require('$:/plugins/OokTech/Bob/SharedFunctions.js');
  $tw.Bob.ExcludeFilter = $tw.wiki.getTiddlerText('$:/plugins/OokTech/Bob/ExcludeSync');
  // In the browser there is only one connection, so set the connection index
  const connectionIndex = 0;

  // Do all actions on startup.
  $tw.Bob.setup = function(reconnect) {
    $tw.setcookie = function(cookieName, cookieValue) {
      if (cookieName && cookieValue) {
        document.cookie = cookieName + "=" + cookieValue;
      } else if (cookieName) {
        // Clear the cookie if no value given.
        document.cookie = cookieName + "= ; expires = Thu, 01 Jan 1970 00:00:00 GMT";
      }
    }
    // Add a message that the wiki isn't connected yet
    const text = "<div style='position:fixed;bottom:0px;width:100%;background-color:red;height:1.5em;max-height:100px;text-align:center;vertical-align:center;color:white;'>''WARNING: The connection to server hasn't been established yet.''</div>";
    const warningTiddler = {
      title: '$:/plugins/OokTech/Bob/Server Warning',
      text: text,
      tags: '$:/tags/PageTemplate'
    };
    $tw.wiki.addTiddler(new $tw.Tiddler(warningTiddler));
    if(reconnect) {
      $tw.connections = null;
    }
    // Get the name for this wiki for websocket messages
    const tiddler = $tw.wiki.getTiddler("$:/WikiName");
    if(tiddler) {
      $tw.wikiName = tiddler.fields.text;
    } else {
      $tw.wikiName = '';
    }

    const IPAddress = window.location.hostname;
    const WSSPort = window.location.port;
    const WSScheme = window.location.protocol=="https:"?"wss://":"ws://";

    $tw.connections = $tw.connections || [];
    $tw.connections[connectionIndex] = $tw.connections[connectionIndex] || {};
    $tw.connections[connectionIndex].index = connectionIndex;
    try{
      const r = new RegExp("\\/"+ $tw.wikiName + "\\/?$");
      $tw.connections[connectionIndex].socket = new WebSocket(WSScheme + IPAddress +":" + WSSPort + window.location.pathname.replace(r,'') );
    } catch (e) {
      console.log(e)
      $tw.connections[connectionIndex].socket = {};
    }
    $tw.connections[connectionIndex].socket.onopen = openSocket;
    $tw.connections[connectionIndex].socket.onmessage = parseMessage;
    $tw.connections[connectionIndex].socket.binaryType = "arraybuffer";

    if(!reconnect) {
      addHooks();
    }
  }
  /*
    When the socket is opened the heartbeat process starts. This lets us know
    if the connection to the server gets interrupted.
  */
  const openSocket = function() {
    console.log('Opened socket');
    const token = localStorage.getItem('ws-token');
    // Login with whatever credentials you have
    const data = {
      type: 'setLoggedIn',
      wiki: $tw.wikiName,
      heartbeat: true,
      token: token
    };
    $tw.Bob.Shared.sendMessage(data, 0);

    // For some reason the settings tiddlers are not always created in some
    // wikis, so this tries every second until it succeds at creating them.
    function tryAgain() {
      setTimeout(function() {
        const tid = $tw.wiki.getTiddler("$:/WikiSettings/split")
        if (!tid) {
          const data = {
            type: 'setLoggedIn',
            wiki: $tw.wikiName,
            heartbeat: true,
            token: token
          };
          $tw.Bob.Shared.sendMessage(data, 0);
          tryAgain()
        } else {
          try {
            const temp = JSON.parse(tid.fields.text);
            if(temp.persistentUsernames === "yes") {
              const savedName = $tw.Bob.getCookie(document.cookie, "userName");
              if(savedName) {
                $tw.wiki.addTiddler(new $tw.Tiddler({title: "$:/status/UserName", text: savedName}));
              }
            }
          } catch (e) {
            // Bleh
          }
        }
      },1000)
    }

    tryAgain()
  }
  /*
    This is a wrapper function, each message from the websocket server has a
    message type and if that message type matches a handler that is defined
    than the data is passed to the handler function.
  */
  const parseMessage = function(event) {
    const eventData = JSON.parse(event.data);
    if(eventData.type) {
      if(typeof $tw.browserMessageHandlers[eventData.type] === 'function') {
        $tw.browserMessageHandlers[eventData.type](eventData);
      }
    }
  }

  /*
    This adds actions for the different event hooks. Each hook sends a
    message to the node process.

    Some unused hooks have commented out skeletons for adding those hooks in
    the future if they are needed.
  */
  const addHooks = function() {
    if(!$tw.wikiName) {
      $tw.wikiName = '';
    }
    $tw.hooks.addHook("th-editing-tiddler", function(event) {
      // Special handling for unedited shadow tiddlers
      const token = localStorage.getItem('ws-token');
      if($tw.wiki.isShadowTiddler(event.tiddlerTitle) && !$tw.wiki.tiddlerExists(event.tiddlerTitle)) {
        // Wait for the document to have focus again and then check for the existence of a draft tiddler for the shadow, if one doesn't exist cancel the edit lock
        setTimeout(function(tid) {
          if(document.hasFocus()) {
            if(!$tw.wiki.findDraft(tid)) {
              console.log("here")
              // Cancel the edit lock
              const message = {
                type: 'cancelEditingTiddler',
                tiddler:{
                  fields:{
                    title: tid
                  }
                },
                wiki: $tw.wikiName,
                token: token
              };
              sendToServer(message);
            }
          }
        }, 200, event.tiddlerTitle)
      }
      const message = {
        type: 'editingTiddler',
        tiddler: {
          fields: {
            title: event.tiddlerTitle
          }
        },
        wiki: $tw.wikiName,
        token: token
      };
      sendToServer(message);
      // do the normal editing actions for the event
      return true;
    });
    $tw.hooks.addHook("th-cancelling-tiddler", function(event) {
      const token = localStorage.getItem('ws-token');
      const draftTitle = event.param || event.tiddlerTitle;
      const draftTiddler = $tw.wiki.getTiddler(draftTitle);
      const originalTitle = draftTiddler && draftTiddler.fields["draft.of"];
      const message = {
        type: 'cancelEditingTiddler',
        tiddler:{
          fields:{
            title: originalTitle
          }
        },
        wiki: $tw.wikiName,
        token: token
      };
      sendToServer(message);
      // Do the normal handling
      return event;
    });

    $tw.Bob.Reconnect = function (sync) {
      if($tw.connections[0].socket.readyState !== 1) {
        $tw.Bob.setup();
        if(sync) {
          $tw.Bob.syncToServer();
        }
      }
    }
    $tw.Bob.syncToServer = function () {
      // Use a timeout to ensure that the websocket is ready
      if($tw.connections[0].socket.readyState !== 1) {
        setTimeout($tw.Bob.syncToServer, 100)
        console.log('waiting')
      } else {
        /*
        // The process here should be:

          Send the full list of changes from the browser to the server in a
          special message
          The server determines if any conflicts exist and marks the tiddlers as appropriate
          If there are no conflicts than it just applies the changes from the browser/server
          If there are than it marks the tiddler as needing resolution and both versions are made available
          All connected browsers now see the tiddlers marked as in conflict and resolution is up to the people

          This message is sent to the server, once the server receives it it respons with a special ack for it, when the browser receives that it deletes the unsent tiddler

          What is a conflict?

          If both sides say to delete the same tiddler there is no conflict
          If one side says save and the othre delete there is a conflict
          if both sides say save there is a conflict if the two saved versions
          aren't the same.
        */
        // Get the tiddler with the info about local changes
        const tiddler = $tw.wiki.getTiddler('$:/plugins/OokTech/Bob/Unsent');
        let tiddlerHashes = {};
        const allTitles = $tw.wiki.allTitles()
        const list = $tw.wiki.filterTiddlers($tw.Bob.ExcludeFilter);
        allTitles.forEach(function(tidTitle) {
          if(list.indexOf(tidTitle) === -1) {
            const tid = $tw.wiki.getTiddler(tidTitle);
            tiddlerHashes[tidTitle] = $tw.Bob.Shared.getTiddlerHash(tid);
          }
        })
        // Ask the server for a listing of changes since the browser was
        // disconnected
        const token = localStorage.getItem('ws-token');
        const message = {
          type: 'syncChanges',
          since: tiddler.fields.start,
          changes: tiddler.fields.text,
          hashes: tiddlerHashes,
          wiki: $tw.wikiName,
          token: token
        };
        sendToServer(message);
        $tw.wiki.deleteTiddler('$:/plugins/OokTech/Bob/Unsent')
      }
    }
    /*
      Below here are skeletons for adding new actions to existing hooks.
      None are needed right now but the skeletons may help later.

      Other available hooks are:
      th-importing-tiddler
      th-relinking-tiddler
      th-renaming-tiddler
    */
    /*
      This handles the hook for importing tiddlers.
    */
    $tw.hooks.addHook("th-importing-tiddler", function (tiddler) {
      if ($tw.wiki.getTextReference('$:/WikiSettings/split##saveMediaOnServer') !== 'no' && $tw.wiki.getTextReference('$:/WikiSettings/split##enableFileServer') === 'yes') {
        function updateProgress(e) {
          // TODO make this work in different browsers
          /*
          if (e.lengthComputable) {
            var percentComplete = e.loaded/e.total*100;
          } else {
            var percentComplete = -1;
          }
          console.log(percentComplete);
          */
        }
        function transferComplete(e) {
          console.log('Complete!!');
        }
        function transferFailed(e) {
          console.log('Failed!');
        }
        function transferCanceled(e) {
          console.log('Cancelled!')
        }
        // Figure out if the thing being imported is something that should be
        // saved on the server.
        //const mimeMap = $tw.settings.mimeMap || {
        const mimeMap = $tw.settings.mimeMap || {
          '.aac': 'audio/aac',
          '.avi': 'video/x-msvideo',
          '.csv': 'text/csv',
          '.doc': 'application/msword',
          '.epub': 'application/epub+zip',
          '.gif': 'image/gif',
          '.html': 'text/html',
          '.htm': 'text/html',
          '.ico': 'image/x-icon',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.mp3': 'audio/mpeg',
          '.mpeg': 'video/mpeg',
          '.oga': 'audio/ogg',
          '.ogv': 'video/ogg',
          '.ogx': 'application/ogg',
          '.pdf': 'application/pdf',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.weba': 'audio/weba',
          '.webm': 'video/webm',
          '.wav': 'audio/wav'
        };
        if (Object.values(mimeMap).indexOf(tiddler.fields.type) !== -1 && !tiddler.fields._canonical_uri) {
          // Check if this is set up to use HTTP post or websockets to save the
          // image on the server.
          const request = new XMLHttpRequest();
          request.upload.addEventListener('progress', updateProgress);
          request.upload.addEventListener('load', transferComplete);
          request.upload.addEventListener('error', transferFailed);
          request.upload.addEventListener('abort', transferCanceled);

          let wikiPrefix = $tw.wiki.getTiddlerText('$:/WikiName') || '';
          const uploadURL = '/api/upload';
          request.open('POST', uploadURL, true);
          // cookies are sent with the request so the authentication cookie
          // should be there if there is one.
          const thing = {
            tiddler: tiddler,
            wiki: $tw.wiki.getTiddlerText('$:/WikiName')
          }
          request.setRequestHeader('x-wiki-name',wikiPrefix);
          request.onreadystatechange = function() {
            if (request.readyState === XMLHttpRequest.DONE) {
              if (request.status === 200) {
                // Things should be ok
                // The server should send a browser message saying that the
                // upload was successful.
              } else {
                // There is a problem
                // Make a tiddler that has the tag $:/tags/Alert that has the text of
                // the alert.
                const fields = {
                  component: 'Server Message',
                  title: "Upload Error",
                  text: "File failed to upload to server. Try quitting and restarting Bob."+"<br/><$button>Clear Alerts<$action-deletetiddler $filter='[tag[$:/tags/Alert]component[Server Message]]'/></$button>",
                  tags: '$:/tags/Alert'
                }
                $tw.wiki.addTiddler(new $tw.Tiddler(fields, $tw.wiki.getCreationFields()));
              }
            }
          }
          request.send(JSON.stringify(thing));
          // Change the tiddler fields and stuff
          const fields = {};
          wikiPrefix = $tw.wiki.getTiddlerText('$:/WikiName') || '';
          wikiPrefix = wikiPrefix === '' ? '' : '/' + wikiPrefix;
          $tw.settings.fileURLPrefix = $tw.settings.fileURLPrefix || 'files';
          const uri = wikiPrefix + '/' + $tw.settings.fileURLPrefix + '/' + tiddler.fields.title;
          fields.title = tiddler.fields.title;
          fields.type = tiddler.fields.type;
          fields._canonical_uri = uri;
          return new $tw.Tiddler(fields);
        } else {
          return tiddler;
        }
      } else {
        return tiddler;
      }
    });
  }
  // Only set up the websockets if we aren't in an iframe or opened as a file.
  if (window.location === window.parent.location && window.location.hostname) {
    // Send the message to node using the websocket
    $tw.Bob.setup();
  }
}

// REQUIRED
// The name of the syncer
BrowserWSAdaptor.prototype.name = "browserwsadaptor"

BrowserWSAdaptor.prototype.supportsLazyLoading = true

// REQUIRED
// Tiddler info, can be left like this but must be present
BrowserWSAdaptor.prototype.getTiddlerInfo = function() {
  return {}
}

// REQUIRED
// This does whatever is necessary to actually store a tiddler
BrowserWSAdaptor.prototype.saveTiddler = function (tiddler, callback) {
  const self = this;
  function handleAck(ackId) {
    const ind = self.idList.indexOf(ackId);
    if (ind > -1) {
      self.idList.splice(ind, 1)
      callback(null, null)
    }
  }
  if (!this.shouldSync(tiddler.fields.title) || !tiddler) {
    callback(null, null);
  } else {
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
    const id = sendToServer(message, callback);
    if(id) {
      this.idList.push(id)
      $tw.rootWidget.addEventListener('handle-ack', function(e) {
        handleAck(e.detail)
      })
    }
  }
}

// REQUIRED
// This does whatever is necessary to load a tiddler.
// Used for lazy loading
BrowserWSAdaptor.prototype.loadTiddler = function (title, callback) {
  function handleLoadedTiddler(tiddler) {
    callback(null, tiddler.fields)
  }
  if (title.slice(0,3) === '$:/') {
    callback(null, null)
  } else {
    const token = localStorage.getItem('ws-token')
    const message = {
      type:'getFullTiddler',
      title: title,
      token: token,
      wiki: $tw.wikiName
    }
    const id = sendToServer(message)
    $tw.rootWidget.addEventListener('loaded-tiddler', function(e) {
      handleLoadedTiddler(e.detail)
    })
  }
}

// REQUIRED
// This does whatever is necessary to delete a tiddler
BrowserWSAdaptor.prototype.deleteTiddler = function (title, callback, options) {
  const self = this;
  function handleAck(ackId) {
    const ind = self.idList.indexOf(ackId)
    if (ind > -1) {
      self.idList.splice(ind, 1)
      callback(null, null)
    }
  }
  if (!this.shouldSync(title)) {
    callback(null);
  } else {
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
    this.idList.push(id)
    $tw.rootWidget.addEventListener('handle-ack', function(e) {
      handleAck(e.detail)
    })
  }
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
BrowserWSAdaptor.prototype.getUpdatedTiddlers = function() {

}
*/

// OPTIONAL
// Returns true if the syncer` is ready, otherwise false
// This can be updated at any time, it gets checked when a syncing task is
// being run so its value can change over time.
BrowserWSAdaptor.prototype.isReady = function() {
  return true
}
/*
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
let thisTimerTemp = undefined
function setupSkinnyTiddlerLoading() {
  if(!$tw.wiki.getTiddler('$:/WikiSettings/split/ws-server')) {
    clearTimeout(thisTimerTemp)
    thisTimerTemp = setTimeout(function() {
      setupSkinnyTiddlerLoading()
    }, 100)
  } else {
    clearTimeout(thisTimerTemp)
    if ($tw.wiki.getTiddlerDataCached('$:/WikiSettings/split/ws-server').rootTiddler === '$:/core/save/lazy-all') {
      BrowserWSAdaptor.prototype.getSkinnyTiddlers = function (callback) {
        function handleSkinnyTiddlers(e) {
          callback(null, e)
        }
        function sendThing() {
          function setSendThingTimeout() {
            setTimeout(function() {
              if ($tw.connections) {
                if($tw.connections[0].socket.readyState === 1) {
                  id = sendToServer(message)
                  $tw.rootWidget.addEventListener('skinny-tiddlers', function(e) {
                    handleSkinnyTiddlers(e.detail)
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
              $tw.rootWidget.addEventListener('skinny-tiddlers', function(e) {
                handleSkinnyTiddlers(e.detail)
              })
            } else {
              setSendThingTimeout()
            }
          } else {
            setSendThingTimeout()
          }
        }
        const token = localStorage.getItem('ws-token')
        const message = {
          type: 'getSkinnyTiddlers',
          wiki: $tw.wikiName,
          token: token
        }
        let id
        sendThing()
      }
      $tw.syncer.syncFromServer()
    }
  }
}

/*
const sendToServer = function (message) {
  const tiddlerText = $tw.wiki.getTiddlerText('$:/plugins/OokTech/Bob/Unsent', '');
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
*/

// Replace this with whatever conditions are required to use your adaptor
if ($tw.browser) {
  setupSkinnyTiddlerLoading()
  exports.adaptorClass = BrowserWSAdaptor
}

})();
