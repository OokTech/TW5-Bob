/*\
title: $:/plugins/OokTech/Bob/BrowserMessageHandlers.js
type: application/javascript
module-type: startup

This handles messages sent to the browser.

These are message handlers for messages sent to the browser. If you want to
add more functions the easiest way is to use this file as a template and make a
new file that adds the files you want. To do this you need should copy
everything until the line

$tw.browserMessageHandlers = $tw.browserMessageHandlers || {};

this line makes sure that the object exists and doesn't overwrite what already
exists and it lets the files that define handlers be loaded in any order.

Remember that the file has to end with

})();

to close the function that wraps the contents.
Also change the title of the tiddler in the second line of the file, otherwise
it will overwrite this file.
\*/
(function () {

  /*jslint node: true, browser: true */
  /*global $tw: false */
  "use strict";

  // Export name and synchronous status
  exports.name = "web-sockets-setup";
  exports.platforms = ["browser"];
  exports.after = ["render"];
  exports.synchronous = true;

  // Polyfill because IE uses old javascript
  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(search, pos) {
      return this.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
    };
  }

  $tw.browserMessageHandlers = $tw.browserMessageHandlers || {};
  $tw.Bob = $tw.Bob || {};
  $tw.Bob.MessageQueue = $tw.Bob.MessageQueue || [];
  $tw.connections = $tw.connections || [];
  $tw.Bob.Shared = require('$:/plugins/OokTech/Bob/SharedFunctions.js');

  var sendAck = function (data) {
    var token = localStorage.getItem('ws-token')
    $tw.connections[0].socket.send(JSON.stringify({type: 'ack', id: data.id, token: token, wiki: $tw.wikiName}));
  }

  /*
    TODO - determine if we should sanitise the tiddler titles and field names

    This message handler takes care of saveTiddler messages going to the
    browser.
    It creates a tiddler out of the supplied JSON object that lists the fields.

    JSON structure of data (the function input):
    {
      "fields": {
        "title": "Some title",
        "other": "field thingy",
        "text": "lots of text and stuff here because why not"
      }
    }
  */
  $tw.browserMessageHandlers.saveTiddler = function(data) {
    // Ignore the message if it isn't for this wiki
    if (data.wiki === $tw.wikiName) {
      // The title must exist and must be a string, everything else is optional
      if (data.tiddler.fields) {
        if (typeof data.tiddler.fields.title === 'string') {
          // if the tiddler exists already only update it if the update is
          // different than the existing one.
          var changed = $tw.Bob.Shared.TiddlerHasChanged(data.tiddler, $tw.wiki.getTiddler(data.tiddler.fields.title));
          if (changed) {
            console.log('Create Tiddler', data.tiddler.fields.title);
            $tw.wiki.addTiddler(new $tw.Tiddler(data.tiddler.fields));
          }
        } else {
          console.log('Invalid tiddler title');
        }
      } else {
        console.log("No tiddler fields given");
      }
    }
    sendAck(data);
  }

  /*
    This is for updating the tiddlers currently being edited. It needs a
    special handler to support multi-wikis.
  */
  $tw.browserMessageHandlers.updateEditingTiddlers = function (data) {
    // make sure there is actually a list sent
    if (data.list) {
        var listField = $tw.utils.stringifyList(data.list);
        // Make the tiddler fields
        var tiddlerFields = {title: "$:/state/Bob/EditingTiddlers", list: listField};
        // Add the tiddler
        $tw.wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
    } else {
      console.log("No tiddler list given");
    }
    sendAck(data);
  }

  /*
    This message handles the deleteTiddler message for the browser. Note that
    this removes the tiddler from the wiki in the browser, but it does not
    delete the .tid file from the node server if you are running tiddlywiki in
    node. If you are running without node than this function is equavalient to
    deleting the tiddler.
  */
  $tw.browserMessageHandlers.deleteTiddler = function (data) {
    if (data.wiki === $tw.wikiName) {
      data.tiddler = data.tiddler || {};
      data.tiddler.fields = data.tiddler.fields || {};
      var title = data.tiddler.fields.title;
      if (title) {
        $tw.wiki.deleteTiddler(title);
      }
    }
    sendAck(data);
  }

  /*
    This message asks the browser to send a list of all tiddlers back to the
    node process.
    This is useful for when you are trying to sync the browser and the file
    system or if you only want a sub-set of existing tiddlers in the browser.
  */
  $tw.browserMessageHandlers.listTiddlers = function(data) {
    // This is an array of tiddler titles, each title is a string.
    var response = $tw.wiki.allTitles();
    // Send the response JSON as a string.
    var token = localStorage.getItem('ws-token')
    $tw.connections[0].socket.send(JSON.stringify({type: 'browserTiddlerList', titles: response, token: token, wiki: $tw.wiki.getTiddlerText('$:/WikiName')}));
    sendAck(data);
  }

  /*
    This message handles conflicts between the server and browser after
    reconnecting

    It saves the server version under the normal title and saves the in-browser
    version with the prefix $:/state/Bob/Conflicts/
  */
  $tw.browserMessageHandlers.conflict = function(data) {
    data.tiddler.fields.created = $tw.utils.stringifyDate(new Date(data.tiddler.fields.created))
    data.tiddler.fields.modified = $tw.utils.stringifyDate(new Date(data.tiddler.fields.modified))
    var wikiTiddler = $tw.wiki.getTiddler(data.tiddler.fields.title);
    if (wikiTiddler) {
      wikiTiddler = JSON.parse(JSON.stringify(wikiTiddler));
      wikiTiddler.fields.modified = $tw.utils.stringifyDate(new Date(wikiTiddler.fields.modified))
      wikiTiddler.fields.created = $tw.utils.stringifyDate(new Date(wikiTiddler.fields.created))
      // Only add the tiddler if it is different
      if ($tw.Bob.Shared.TiddlerHasChanged(data.tiddler, wikiTiddler)) {
        var newTitle = '$:/state/Bob/Conflicts/' + data.tiddler.fields.title;
        $tw.wiki.importTiddler(new $tw.Tiddler(wikiTiddler.fields, {title: newTitle}));
        // we have conflicts so open the conflict list tiddler
        var storyList = $tw.wiki.getTiddler('$:/StoryList').fields.list
        storyList = "$:/plugins/Bob/ConflictList " + $tw.utils.stringifyList(storyList)
        $tw.wiki.addTiddler({title: "$:/StoryList", text: "", list: storyList},$tw.wiki.getModificationFields());
      }
    } else {
      // If the tiddler doesn't actually have a conflicting version than just
      // add the tiddler.
      $tw.wiki.importTiddler(new $tw.Tiddler(data.tiddler.fields));
    }
    sendAck(data);
  }

  /*
    Import as a temporary tiddler so it can be saved or deleted by the person
    using the wiki
  */
  $tw.browserMessageHandlers.import = function(data) {
    console.log('import', data.tiddler.fields.title)
    //data.tiddler.fields.title = data.tiddler.fields.title.replace('{'+$tw.wikiName+'}','');
    data.tiddler.fields.created = $tw.utils.stringifyDate(new Date(data.tiddler.fields.created))
    data.tiddler.fields.modified = $tw.utils.stringifyDate(new Date(data.tiddler.fields.modified))
    var newTitle = '$:/state/Bob/Import/' + data.tiddler.fields.title;
    $tw.wiki.importTiddler(new $tw.Tiddler(data.tiddler.fields, {title: newTitle}));
    // we have conflicts so open the conflict list tiddler
    var storyList = $tw.wiki.getTiddler('$:/StoryList').fields.list
    storyList = "$:/plugins/Bob/ImportList " + $tw.utils.stringifyList(storyList)
    $tw.wiki.addTiddler({title: "$:/StoryList", text: "", list: storyList},$tw.wiki.getModificationFields());
    sendAck(data);
  }

  /*
    This handles a ping from the server. The server and browser make sure they
    are connected by sending pings periodically.
    The pong response also echos back whatever was sent along with the ping.
  */
  $tw.browserMessageHandlers.ping = function (data) {
    var token = localStorage.getItem('ws-token')
    var message = {};
    Object.keys(data).forEach(function (key) {
      message[key] = data[key];
    })
    message.type = 'pong';
    message.token = token;
    message.wiki = $tw.wikiName;
    // The message is just the message type
    var response = JSON.stringify(message);
    // Send the response
    $tw.connections[0].socket.send(response);
  }

  /*
    This handles the pong response of a ping. It is also used as the heartbeat
    to ensure that the connection to the server is still live.
  */
  $tw.browserMessageHandlers.pong = function (data) {
    // If this pong is part of a heartbeat than use a setTimeout to send
    // another beat in the interval defined in $tw.settings.heartbeat.interval
    // the timeout id is stored in $tw.settings.heartbeat.timeoutid
    if (data.heartbeat) {
      if ($tw.wiki.tiddlerExists('$:/plugins/OokTech/Bob/Server Warning')) {
        $tw.wiki.deleteTiddler('$:/plugins/OokTech/Bob/Server Warning');
      }

      $tw.settings.heartbeat = $tw.settings.heartbeat || {};

      if (!$tw.settings.heartbeat.interval) {
        var heartbeatTiddler = $tw.wiki.getTiddler("$:/WikiSettings/split/heartbeat") || {fields:{text: "{}"}};
        var heartbeat = JSON.parse(heartbeatTiddler.fields.text) || {};
        $tw.settings.heartbeat["interval"] = heartbeat.interval || 1000;
        $tw.settings.heartbeat["timeout"] = heartbeat.timeout || 5000;
      }

      $tw.utils.toggleClass(document.body,"tc-dirty",false);
      // Clear the time to live timeout.
      clearTimeout($tw.settings.heartbeat.TTLID);
      // Clear the retry timeout.
      clearTimeout($tw.settings.heartbeat.retry);
      setTimeout(function () {
        var token = localStorage.getItem('ws-token')
        $tw.connections[0].socket.send(JSON.stringify({type: 'ping', heartbeat: true, token: token, wiki: $tw.wikiName}));
      }, $tw.settings.heartbeat.interval);
      $tw.settings.heartbeat.TTLID = setTimeout(checkDisconnected, Number($tw.settings.heartbeat.timeout));
    }
  }

  function checkDisconnected() {
    if ($tw.connections[0].socket.readyState !== 1) {
      handleDisconnected();
    } else {
      var token = localStorage.getItem('ws-token')
      $tw.connections[0].socket.send(JSON.stringify({type: 'ping', heartbeat: true, token: token, wiki: $tw.wikiName}));
    }
  }

  /*
    This is what happens when the browser detects that it isn't connected to
    the server anymore.
  */
  function handleDisconnected() {
    console.log('Disconnected from server');
    var text = "<div      style='position:fixed;top:0px;width:100%;background-color:red;height:1.5em;max-height:100px;text-align:center;vertical-align:center;'>''WARNING: You are no longer connected to the server.''<$button>Reconnect<$action-reconnectwebsocket/><$action-navigate $to='$:/plugins/Bob/ConflictList'/></$button></div>";
    var tiddler = {title: '$:/plugins/OokTech/Bob/Server Warning', text: text, tags: '$:/tags/PageTemplate'};
    $tw.wiki.addTiddler(new $tw.Tiddler(tiddler));
    $tw.settings.heartbeat.retry = setInterval(function () {
      if ($tw.connections[0].socket.readyState === 1) {
        var token = localStorage.getItem('ws-token')
        $tw.connections[0].socket.send(JSON.stringify({type: 'ping', heartbeat: true, token: token, wiki: $tw.wikiName}));
      }
    }, $tw.settings.heartbeat.interval);
    var queue = [];
    $tw.Bob.MessageQueue.forEach(function(message) {
      queue.push(message)
    })
    var tiddler2 = {title: '$:/plugins/OokTech/Bob/Unsent', text: JSON.stringify(queue, '', 2), type: 'application/json', start: Date.now()-Number($tw.settings.heartbeat.timeout)};
    $tw.wiki.addTiddler(new $tw.Tiddler(tiddler2));
  }

  /*
    For some messages we need an ack from the server to make sure that they
    were received correctly. This removes the messages from the queue after
    an ack is recevied.
  */
  $tw.browserMessageHandlers.ack = $tw.Bob.Shared.handleAck;

})();
