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
  if(!String.prototype.startsWith) {
    String.prototype.startsWith = function(search, pos) {
      return this.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
    };
  }

  $tw.browserMessageHandlers = $tw.browserMessageHandlers || {};
  $tw.Bob = $tw.Bob || {};
  $tw.Bob.MessageQueue = $tw.Bob.MessageQueue || [];
  $tw.connections = $tw.connections || [];
  $tw.Bob.Shared = require('$:/plugins/OokTech/Bob/SharedFunctions.js');
	$tw.settings = $tw.settings || {};
	$tw.settings.heartbeat = $tw.settings.heartbeat || {};
	$tw.settings.heartbeat.PingTimer = false;

  /*
    there was an error on the receiving side, so the browser gets a message to let it know
  */
 $tw.browserMessageHandlers.error = function(data) {
  // TODO: make this useful?
  console.log(data)
  alert(`Error handling: ${data.for}\nwith message: ${data.explain}`)
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
    $tw.Bob.Shared.sendAck(data);
    // Ignore the message if it isn't for this wiki
    if(data.wiki === $tw.wikiName) {
      if(data.tiddler) {
        // The title must exist and must be a string, everything else is optional
        if(data.tiddler.fields) {
          if(typeof data.tiddler.fields.title === 'string') {
            // if the tiddler exists already only update it if the update is
            // different than the existing one.
            const changed = $tw.Bob.Shared.TiddlerHasChanged(data.tiddler, $tw.wiki.getTiddler(data.tiddler.fields.title));
            if(changed) {
              // Set the change count in the syncer so that the syncer doesn't save the tiddler again.
              if($tw.syncer.tiddlerInfo[data.tiddler.fields.title]) {
                $tw.syncer.tiddlerInfo[data.tiddler.fields.title].changeCount = $tw.wiki.getChangeCount(data.tiddler.fields.title);
								$tw.syncer.tiddlerInfo[data.tiddler.fields.title].timestampLastSaved = new Date();
                $tw.syncer.tiddlerInfo[data.tiddler.fields.title].revision = data.tiddler.fields.revision
              } else {
                $tw.syncer.tiddlerInfo[data.tiddler.fields.title] = {
									changeCount: $tw.wiki.getChangeCount(data.tiddler.fields.title),
									adaptorInfo: "",
                  revision: data.tiddler.fields.revision
								}
              }
              if(data.tiddler.fields._revision) {
                data.tiddler.fields.revision = data.tiddler.fields._revision;
                delete data.tiddler.fields._revision;
              }
              $tw.wiki.addTiddler(new $tw.Tiddler(data.tiddler.fields));
            }
          } else {
            console.log('Invalid tiddler title');
          }
        } else {
          console.log("No tiddler fields given");
        }
      } else {
        console.log('No tiddler')
      }
    }
  }

  /*
    When the browser receives skinny tiddlers from the server dispatch the
    'skinny-tiddlers' event with the received tiddlers.
    It is handled by the syncadaptor.
  */
  $tw.browserMessageHandlers.skinnyTiddlers = function (data) {
    $tw.Bob.Shared.sendAck(data);
    const skinnyTiddlers = new CustomEvent('skinny-tiddlers', {bubbles: true, detail: data.tiddlers || []})
    $tw.rootWidget.dispatchEvent(skinnyTiddlers)
  }

  /*
    When the browser receive a loaded tiddler from the server dispatch the
    'loaded-tiddler' event with the received tiddler.
    It is handled by the syncadaptor.
  */
  $tw.browserMessageHandlers.loadTiddler = function(data) {
    $tw.Bob.Shared.sendAck(data);
    const loadedTiddler = new CustomEvent('loaded-tiddler', {bubbles: true, detail: data.tiddler || {}})
    $tw.rootWidget.dispatchEvent(loadedTiddler)
  }

  /*
    This is for updating the tiddlers currently being edited. It needs a
    special handler to support multi-wikis.
  */
  $tw.browserMessageHandlers.updateEditingTiddlers = function (data) {
    $tw.Bob.Shared.sendAck(data);
    // make sure there is actually a list sent
    if(data.list) {
        const listField = $tw.utils.stringifyList(data.list);
        // Make the tiddler fields
        const tiddlerFields = {
          title: "$:/state/Bob/EditingTiddlers",
          list: listField
        };
        // Add the tiddler
        $tw.wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
    } else {
      console.log("No tiddler list given", {level:2});
    }
  }

  /*
    This message handles the deleteTiddler message for the browser. Note that
    this removes the tiddler from the wiki in the browser, but it does not
    delete the .tid file from the node server if you are running tiddlywiki in
    node. If you are running without node than this function is equavalient to
    deleting the tiddler.
  */
  $tw.browserMessageHandlers.deleteTiddler = function (data) {
    $tw.Bob.Shared.sendAck(data);
    if(data.wiki === $tw.wikiName) {
      data.tiddler = data.tiddler || {};
      data.tiddler.fields = data.tiddler.fields || {};
      const title = data.tiddler.fields.title;
      if(title) {
        $tw.wiki.deleteTiddler(title);
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
    $tw.Bob.Shared.sendAck(data);
    // This is an array of tiddler titles, each title is a string.
    const response = $tw.wiki.allTitles();
    // Send the response JSON as a string.
    //const token = localStorage.getItem('ws-token')
    /*$tw.connections[0].socket.send(JSON.stringify({
      type: 'browserTiddlerList',
      titles: response,
      //token: token,
      wiki: $tw.wiki.getTiddlerText('$:/WikiName'),
      sessionId: sessionStorage.getItem('sessionId')
    }));*/
    const message = {
      type: 'browserTiddlerList',
      titles: response,
      //token: token,
      wiki: $tw.wiki.getTiddlerText('$:/WikiName'),
      sessionId: sessionStorage.getItem('sessionId')
    };
    $tw.Bob.Shared.sendMessage(message, 0);
  }

  /*
    This message handles conflicts between the server and browser after
    reconnecting

    It saves the server version under the normal title and saves the in-browser
    version with the prefix $:/state/Bob/Conflicts/
  */
  $tw.browserMessageHandlers.conflict = function(data) {
    $tw.Bob.Shared.sendAck(data);
    if(data.tiddler) {
      if(data.tiddler.fields) {
        data.tiddler.fields.created = $tw.utils.stringifyDate(new Date(data.tiddler.fields.created))
        data.tiddler.fields.modified = $tw.utils.stringifyDate(new Date(data.tiddler.fields.modified))
        let wikiTiddler = $tw.wiki.getTiddler(data.tiddler.fields.title);
        if(wikiTiddler) {
          wikiTiddler = JSON.parse(JSON.stringify(wikiTiddler));
          wikiTiddler.fields.modified = $tw.utils.stringifyDate(new Date(wikiTiddler.fields.modified))
          wikiTiddler.fields.created = $tw.utils.stringifyDate(new Date(wikiTiddler.fields.created))
          // Only add the tiddler if it is different
          if($tw.Bob.Shared.TiddlerHasChanged(data.tiddler, wikiTiddler)) {
            const newTitle = '$:/state/Bob/Conflicts/' + data.tiddler.fields.title;
            $tw.wiki.importTiddler(new $tw.Tiddler(wikiTiddler.fields, {title: newTitle}));
            // we have conflicts so open the conflict list tiddler
            let storyList = $tw.wiki.getTiddler('$:/StoryList').fields.list
            storyList = "$:/plugins/OokTech/Bob/ConflictList " + $tw.utils.stringifyList(storyList)
            $tw.wiki.addTiddler({title: "$:/StoryList", text: "", list: storyList},$tw.wiki.getModificationFields());
          }
        } else {
          // If the tiddler doesn't actually have a conflicting version than
          // just add the tiddler.
          $tw.wiki.importTiddler(new $tw.Tiddler(data.tiddler.fields));
        }
      }
    }
  }

  /*
    Import as a temporary tiddler so it can be saved or deleted by the person
    using the wiki
  */
  $tw.browserMessageHandlers.import = function(data) {
    $tw.Bob.Shared.sendAck(data);
    console.log('import', data.tiddler.fields.title, {level:2})
    data.tiddler.fields.created = $tw.utils.stringifyDate(new Date(data.tiddler.fields.created))
    data.tiddler.fields.modified = $tw.utils.stringifyDate(new Date(data.tiddler.fields.modified))
    const newTitle = '$:/state/Bob/Import/' + data.tiddler.fields.title;
    $tw.wiki.importTiddler(new $tw.Tiddler(data.tiddler.fields, {title: newTitle}));
    // we have conflicts so open the conflict list tiddler
    let storyList = $tw.wiki.getTiddler('$:/StoryList').fields.list
    storyList = "$:/plugins/OokTech/Bob/ImportList " + $tw.utils.stringifyList(storyList)
    $tw.wiki.addTiddler({
      title: "$:/StoryList",
      text: "",
      list: storyList
    },$tw.wiki.getModificationFields());
  }

  /*
    This handles a ping from the server. The server and browser make sure they
    are connected by sending pings periodically.
    The pong response also echos back whatever was sent along with the ping.
  */
  $tw.browserMessageHandlers.ping = function (data) {
    const token = $tw.Bob.Shared.getMessageToken();
    let message = {};
    Object.keys(data).forEach(function (key) {
      message[key] = data[key];
    })
    message.type = 'pong';
    message.token = token;
    message.wiki = encodeURIComponent($tw.wikiName);
    message.sessionId = sessionStorage.getItem('sessionId')
    $tw.Bob.Shared.sendMessage(message, 0);
  }

  /*
    This handles the pong response of a ping. It is also used as the heartbeat
    to ensure that the connection to the server is still live.
  */
  $tw.browserMessageHandlers.pong = function (data) {
    // If this pong is part of a heartbeat than use a setTimeout to send
    // another beat in the interval defined in $tw.settings.heartbeat.interval
    // the timeout id is stored in $tw.settings.heartbeat.timeoutid
    $tw.syncadaptor.setConnected()
  }

  /*
    Download the file in the message data
  */
  $tw.browserMessageHandlers.downloadFile = function (data) {
    $tw.Bob.Shared.sendAck(data);
    if(data) {
      const text = $tw.wiki.renderTiddler("text/plain", "$:/core/save/all", {});
      let a = document.createElement('a');
      a.download = 'index.html';
      const thisStr = 'data:text/html;base64,'+window.btoa(unescape(encodeURIComponent(text)));
      a.setAttribute('href', thisStr);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  /*
    Set the viewable wikis
  */
  $tw.browserMessageHandlers.setViewableWikis = function (data) {
    $tw.Bob.Shared.sendAck(data);
    if(data.list) {
      const fields = {
        title: '$:/state/ViewableWikis',
        list: Object.keys(data.list)
      }
      $tw.wiki.addTiddler(new $tw.Tiddler(fields));
    }
  }

  /*
    This takes an alert from the server and displays it in the browser.
    And appends it to a message history list.
  */
  $tw.browserMessageHandlers.browserAlert = function (data) {
    $tw.Bob.Shared.sendAck(data);
    const serverMessagesTid = $tw.wiki.getTiddler('$:/settings/Bob/ServerMessageHistoryLimit');
    let hideAlerts = false;
    if(serverMessagesTid) {
      hideAlerts = serverMessagesTid.fields.hide_messages === 'true'?true:false;
    }
    if(!hideAlerts) {
      if(data.alert) {
        // Update the message history
        let tiddler = $tw.wiki.getTiddler('$:/Bob/AlertHistory');
        let tidObj = {
          title:'$:/Bob/AlertHistory',
          type:'application/json',
          text: '{}'
        };
        if(tiddler) {
          tidObj = JSON.parse(JSON.stringify(tiddler.fields))
        }
        const newNumber = Object.keys(JSON.parse(tidObj.text)).map(function(item) {
          return Number(item.replace(/^\$:\/temp\/Server Alert /, ''))
        }).sort(function(a,b){return a-b}).slice(-1)[0] + 1 || 0;
        const AlertTitle = '$:/temp/Server Alert ' + newNumber;
        tidObj.text = JSON.parse(tidObj.text);
        tidObj.text[AlertTitle] = data.alert + ' - ' + $tw.utils.formatDateString(new Date(),"0hh:0mm, 0DD/0MM/YY");
        tidObj.text = JSON.stringify(tidObj.text);
        $tw.wiki.addTiddler(tidObj);

        // Make a tiddler that has the tag $:/tags/Alert that has the text of
        // the alert.
        const fields = {
          component: 'Server Message',
          title: AlertTitle,
          text: data.alert+"<br/><$button>Clear Alerts<$action-deletetiddler $filter='[tag[$:/tags/Alert]component[Server Message]]'/></$button>",
          tags: '$:/tags/Alert'
        }
        $tw.wiki.addTiddler(new $tw.Tiddler(fields, $tw.wiki.getCreationFields()));
      }
    }
  }

  /*
    This is used to update the current list of connections the server has to
    other servers
    These are used to pick which server to send messages to.
  */
  $tw.browserMessageHandlers.updateConnections = function (data) {
    $tw.Bob.Shared.sendAck(data);
    if(data.connections) {
      const fields = {
        title: '$:/Bob/ActiveConnections',
        list: $tw.utils.stringifyList(Object.keys(data.connections))
      };
      $tw.wiki.addTiddler(new $tw.Tiddler(fields));
      Object.keys(data.connections).forEach(function(connectionUrl) {
        if(data.connections[connectionUrl].name) {
          const connectionFields = {
            title: '$:/Bob/KnownServers/' + data.connections[connectionUrl].name,
            tags: '[[Remote Server]]',
            url: connectionUrl,
            staticurl: data.connections[connectionUrl].staticUrl,
            available_wikis: Object.keys(data.connections[connectionUrl].available_wikis).join(' '),
            available_chats: data.connections[connectionUrl].available_chats.join(' '),
            publickey: data.connections[connectionUrl].publicKey,
            allows_login: data.connections[connectionUrl].allows_login,
            name: data.connections[connectionUrl].name,
            local_name: data.connections[connectionUrl].local_name,
            active: data.connections[connectionUrl].active
          }
          $tw.wiki.addTiddler(new $tw.Tiddler(connectionFields));
          Object.keys(data.connections[connectionUrl].available_wikis).forEach(function(thisWikiName) {
            const theTid = $tw.wiki.getTiddler('$:/Bob/KnownServers/' + data.connections[connectionUrl].name + '/wikis/' + thisWikiName) || {fields: {}};
            $tw.wiki.addTiddler(new $tw.Tiddler({
              title: '$:/Bob/KnownServers/'+ data.connections[connectionUrl].name + '/wikis/' + thisWikiName,
              sync: data.connections[connectionUrl].available_wikis[thisWikiName].sync || 'no',
              sync_type: data.connections[connectionUrl].available_wikis[thisWikiName].sync_type || '',
              auto_sync: data.connections[connectionUrl].available_wikis[thisWikiName].auto_sync || 'no',
              sync_filter: data.connections[connectionUrl].available_wikis[thisWikiName].sync_filter || '',
              public: data.connections[connectionUrl].available_wikis[thisWikiName].public || 'yes',
              conflict_type: data.connections[connectionUrl].available_wikis[thisWikiName].conflict_type || 'manual',
              allows_login: data.connections[connectionUrl].available_wikis[thisWikiName].allows_login || 'no',
              name: thisWikiName,
              server_name: connectionUrl,
              local_name: data.connections[connectionUrl].available_wikis[thisWikiName].local_name,
              previous_sync: data.connections[connectionUrl].available_wikis[thisWikiName].previous_sync || 0
            }))
          })
          data.connections[connectionUrl].available_chats.forEach(function(thisChatName) {
            $tw.wiki.addTiddler(new $tw.Tiddler({
              title: '$:/Bob/KnownServers/' + data.connections[connectionUrl].name + '/chats/' + thisChatName,
              public: 'yes',
              relay: 'no',
              name: thisChatName
            }))
          })
        }
      })
    }
  }

	/*
		The server tells the browser to check if there are new settings
	*/
	$tw.browserMessageHandlers.updateSettings = function(data) {
		$tw.Bob.Shared.sendAck(data);
		$tw.Bob.getSettings();
	}

	/*
		Receive a list of visible profiles from the server
	*/
	$tw.browserMessageHandlers.profileList = function(data) {
		$tw.Bob.Shared.sendAck(data);
		console.log(data)
	}

  /*
    For some messages we need an ack from the server to make sure that they
    were received correctly. This removes the messages from the queue after
    an ack is recevied.
  */
  $tw.browserMessageHandlers.ack = $tw.Bob.Shared.handleAck;

})();
