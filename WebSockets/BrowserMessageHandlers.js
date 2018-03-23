/*\
title: $:/plugins/OokTech/MultiUser/BrowserMessageHandlers.js
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

  /*
    TODO - determine if we should sanitise the tiddler titles and field names

    This message handler takes care of makeTiddler messages
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
  $tw.browserMessageHandlers.makeTiddler = function(data) {
    //console.log('Make Tiddler')
    // Ignore the message if it isn't for this wiki
    if (data.wiki === $tw.wikiName) {
      // The title must exist and must be a string, everything else is optional
      if (data.fields) {
        if (typeof data.fields.title === 'string' && !data.fields.title.startsWith('{' + $tw.wikiName + '}')) {
          // if the tiddler exists already only update it if the update is
          // different than the existing one.
          var changed = TiddlerHasChanged(data, $tw.wiki.getTiddler(data.fields.title));
          if (changed) {
            console.log('Create Tiddler ', data.fields.title);
            $tw.wiki.addTiddler(new $tw.Tiddler(data.fields));
          } else {
            // Respond that we already have this tiddler synced
            var message = JSON.stringify({messageType: 'clearStatus', title: data.fields.title});
            $tw.socket.send(message);
          }
        } else {
          console.log('Invalid tiddler title');
        }
      } else {
        console.log("No tiddler fields given");
      }
    }
  }

  /*
    This is for updating the tiddlers currently being edited. It needs a
    special handler to support multi-wikis.
  */
  $tw.browserMessageHandlers.updateEditingTiddlers = function (data) {
    // make sure there is actually a list sent
    if (data.list) {
        // remove the prefix for the current wiki from anything listed with
        // that prefix.
        for (var i = 0; i < data.list.length; i++) {
          data.list[i] = data.list[i].replace(new RegExp("^\{" + $tw.wikiName + "\}"),'');
        }
        var listField = $tw.utils.stringifyList(data.list);
        // Make the tiddler fields
        var tiddlerFields = {title: "$:/state/MultiUser/EditingTiddlers", list: listField};
        // Add the tiddler
        $tw.wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
    } else {
      console.log("No tiddler list given");
    }
  }

  /*
    Check if the file version matches the in-browser version of a tiddler
  */
  function TiddlerHasChanged(tiddler, otherTiddler) {
    if (!otherTiddler) {
      return true;
    }
    if (!tiddler) {
      return true;
    }

    var changed = false;
    // Some cleverness that gives a list of all fields in both tiddlers without
    // duplicates.
    var allFields = Object.keys(tiddler.fields).concat(Object.keys(otherTiddler.fields).filter(function (item) {
      return Object.keys(tiddler.fields).indexOf(item) < 0;
    }));
    // check to see if the field values are the same, ignore modified for now
    allFields.forEach(function(field) {
      if (field !== 'modified' && field !== 'created' && field !== 'list' && field !== 'tags') {
        if (!otherTiddler.fields[field] || otherTiddler.fields[field] !== tiddler.fields[field]) {
          // There is a difference!
          changed = true;
        }
      } else if (field === 'list' || field === 'tags') {
        if (tiddler.fields[field] && otherTiddler.fields[field]) {
          if ($tw.utils.parseStringArray(otherTiddler.fields[field]).length !== tiddler.fields[field].length) {
            changed = true;
          } else {
            var arrayList = $tw.utils.parseStringArray(otherTiddler.fields[field]);
            arrayList.forEach(function(item) {
              if (tiddler.fields[field].indexOf(item) === -1) {
                changed = true;
              }
            })
          }
        } else {
          changed = true;
        }
      }
    })
    return changed;
  };

  /*
    This message handles the remove tiddler function. Note that this removes
    the tiddler from the wiki in the browser, but it does not delete the .tid
    file from the node server if you are running tiddlywiki in node.
    If you are running without node than this function is equavalient to deleting the tiddler.
  */
  $tw.browserMessageHandlers.removeTiddler = function(data) {
    // Ignore the message it if isn't for the current wiki
    if (data.wiki === $tw.wikiName) {
      // The data object passed must have at least a title
      if (data.title) {
        $tw.wiki.deleteTiddler(data.title);
      } else {
        console.log("No tiddler title give.");
      }
    }
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
    $tw.socket.send(JSON.stringify({messageType: 'browserTiddlerList', titles: response}));
  }

  /*
    This handles a ping from the server. The server and browser make sure they
    are connected by sending pings periodically.
    The pong response also echos back whatever was sent along with the ping.
  */
  $tw.browserMessageHandlers.ping = function (data) {
    var message = {messageType: 'pong'};
    Object.keys(data).forEach(function (key) {
      message[key] = data[key];
    })
    // The message is just the message type
    var response = JSON.stringify(message);
    // Send the response
    $tw.socket.send(response);
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
      if ($tw.wiki.tiddlerExists('$:/plugins/OokTech/MultiUser/Server Warning')) {
        $tw.wiki.deleteTiddler('$:/plugins/OokTech/MultiUser/Server Warning');
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
      setTimeout(function () {
        $tw.socket.send(JSON.stringify({messageType: 'ping', heartbeat: true}));
      }, $tw.settings.heartbeat.interval);
      $tw.settings.heartbeat.TTLID = setTimeout(handleDisconnected, Number($tw.settings.heartbeat.timeout));
    }
  }

  /*
    This is what happens when the browser detects that it isn't connected to
    the server anymore.
  */
  function handleDisconnected() {
    console.log('Disconnected from server');
    var text = "<div      style='position:fixed;top:0px;width:100%;background-color:red;height:15vh;text-align:center;vertical-align:center;'><h1>''WARNING: You are no longer connected to the server. No changes you make will be saved.''</h1></div>";
    var tiddler = {title: '$:/plugins/OokTech/MultiUser/Server Warning', text: text, tags: '$:/tags/PageTemplate'};
    $tw.wiki.addTiddler(new $tw.Tiddler(tiddler));
  }

})();
