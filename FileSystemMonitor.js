/*\
title: $:/plugins/OokTech/MultiUser/FileSystemMonitor.js
type: application/javascript
module-type: startup

This module watches the file system in the tiddlers folder and any changes to
the files in the folder that don't come from the browser are reported to the
browser. So if you make a new .tid file in the tiddlers folder it will appear
in the wiki in the browser without needing to restart the server. You can also
delete files to remove the tiddlers from the browser.

Note: For now this only watches the tiddlers folder that is in the same place
as the tiddlywiki.info file and doesn't watch for changes in any subfolders
inside that folder.
This is due to differences in how different operating systems handle watching
for changes to files.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// require the fs module if we are running node
var fs = $tw.node ? require("fs"): undefined;
var path = $tw.node ? require("path"): undefined;

if (fs) {
  // Initialise objects
  $tw.MultiUser = $tw.MultiUser || {};
  $tw.MultiUser.WaitingList = $tw.MultiUser.WaitingList || {};
  $tw.MultiUser.EditingTiddlers = $tw.MultiUser.EditingTiddlers || {};

  /*
    TODO Create a message that lets us set excluded tiddlers from inside the wikis
    A per-wiki exclude list would be best but that is going to have annoying
    logic so it will come later.
  */
  $tw.MultiUser.ExcludeList = $tw.MultiUser.ExcludeList || ['$:/StoryList', '$:/HistoryList', '$:/status/UserName', '$:/Import'];
  /*
    Watch the tiddlers folder for chanegs
  */
  fs.watch($tw.boot.wikiTiddlersPath, function (eventType, filename) {
    // Make sure that the file name isn't undefined
    if (filename) {
      // If the event is that the file has been deleted than it won't exist
      // but we still need to act here.
      if(fs.existsSync(`${$tw.boot.wikiTiddlersPath}/${filename}`)) {
        // Load tiddler data from the file
        var tiddlerObject = $tw.loadTiddlersFromFile(`${$tw.boot.wikiTiddlersPath}/${filename}`);
        // Don't update tiddlers on the exclude list or draft tiddlers
        if (tiddlerObject.tiddlers[0].title && $tw.MultiUser.ExcludeList.indexOf(tiddlerObject.tiddlers[0].title) === -1 && !tiddlerObject.tiddlers[0]['draft.of']) {
          var tiddler = $tw.wiki.getTiddler(tiddlerObject.tiddlers[0].title);
          if (!tiddler) {
            // If the tiddler doesn't exits yet, create it.
            tiddler = new $tw.Tiddler({fields:tiddlerObject.tiddlers[0]});
            // Add the newly cretaed tiddler. Allow multi-tid files (This isn't
            // tested in this context).
            $tw.wiki.addTiddlers(tiddlerObject);
          }
          // Determine if the current tiddler has chaged
          var changed = $tw.MultiUser.FileSystemFunctions.TiddlerHasChanged(tiddler, tiddlerObject);
          // If the current tiddler has changed
          if (changed) {
            // Check if we should send it to each of the connected browsers
            Object.keys($tw.connections).forEach(function(connection) {
              // If the waiting list entry for this connection doesn't exist
              // than create it as an empty object.
              if (!$tw.MultiUser.WaitingList[connection]) {
                $tw.MultiUser.WaitingList[connection] = {};
              }
              // If the current tiddler on the current connection isn't on the
              // waiting list
              if (!$tw.MultiUser.WaitingList[connection][tiddler.fields.title]) {
                // Update the list of tiddlers currently in the browser
                var message = JSON.stringify({type: 'makeTiddler', fields: tiddlerObject.tiddlers[0]});
                $tw.MultiUser.SendToBrowser(connection, message);
                // Put this tiddler on this connection on the wait list.
                $tw.MultiUser.WaitingList[connection][tiddler.fields.title] = true;
              }
            });
          }
        }
      } else {
        console.log(`Deleted tiddler file ${filename}`)
        // Get the file name because it isn't always the same as the tiddler
        // title.
        var title = undefined;
        Object.keys($tw.boot.files).forEach(function(tiddlerName) {
          if ($tw.boot.files[tiddlerName].filepath === `${$tw.boot.wikiTiddlersPath}/${filename}`) {
            title = tiddlerName;
          }
        });
        // Make sure we have the tiddler title.
        if (title) {
          // Remove the tiddler info from $tw.boot.files
          console.log(`Deleting Tiddler "${title}"`);
          delete $tw.boot.files[title]
          // Create a message saying to remove the tiddler
          var message = JSON.stringify({type: 'removeTiddler', title: title});
          // Send the message to each connected browser
          $tw.MultiUser.SendToBrowsers(message);
        }
      }
    } else {
      console.log('No filename given!');
    }
  });

  /*
    This updates the list of tiddlers being edited in each wiki. Any tiddler on
    this list has the edit button disabled to prevent two people from
    simultaneously editing the same tiddler.
    If run without an input it just re-sends the lists to each browser, with a
    tiddler title as input it appends that tiddler to the list and sends the
    updated list to all connected browsers.
  */
  $tw.MultiUser.UpdateEditingTiddlers = function (tiddler) {
    // Check if a tiddler title was passed as input and that the tiddler isn't
    // already listed as being edited.
    // If there is a title and it isn't being edited add it to the list.
    if (tiddler && !$tw.MultiUser.EditingTiddlers[tiddler]) {
      $tw.MultiUser.EditingTiddlers[tiddler] = true;
    }
    // Create a json object representing the tiddler that lists which tiddlers
    // are currently being edited.
    var tiddlerFields = {title: "$:/MultiUser/EditingTiddlers", list: $tw.utils.stringifyList(Object.keys($tw.MultiUser.EditingTiddlers))};
    var message = JSON.stringify({type: 'makeTiddler', fields: tiddlerFields});
    // Send the tiddler info to each connected browser
    $tw.MultiUser.SendToBrowsers(message);
  }

  /*
    This is a wrapper function that takes a message that is meant to be sent to
    all connected browsers and handles the details.

    It iterates though all connections, checkis if each one is active, tries to
    send the message, if the sending fails than it sets the connection as
    inactive.

    Note: This checks if the message is a string despite SendToBrowser also
    checking because if it needs to be changed and sent to multiple browsers
    changing it once here instead of once per browser should be better.
  */
  $tw.MultiUser.SendToBrowsers = function (message) {
    // If the message isn't a string try and coerce it into a string
    if (typeof message !== 'string') {
      message = JSON.stringify(message);
    }
    // Send message to all connections.
    $tw.connections.forEach(function (connection) {
      $tw.MultiUser.SendToBrowser(connection, message);
    })
  }

  /*
    This function sends a message to a single connected browser. It takes the
    browser connection object and the stringifyed message as input.
    If any attempt fails mark the connection as inacive.
  */
  $tw.MultiUser.SendToBrowser = function (connection, message) {
    // If the message isn't a string try and coerce it into a string
    if (typeof message !== 'string') {
      message = JSON.stringify(message);
    }
    // If the connection is active, send the message
    if (connection.active) {
      try {
        connection.socket.send(message);
      } catch (err) {
        // If there was an error mark the connection as inacive
        console.log(`Connection ${connection} in inactive.`)
        $tw.connections[index].active = false;
      }
    }
  }
}

})();
