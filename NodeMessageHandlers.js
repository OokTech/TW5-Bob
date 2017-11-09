/*\
title: $:/plugins/OokTech/MultiUser/NodeMessageHandlers.js
type: application/javascript
module-type: startup

These are message handler functions for the web socket servers. Use this file
as a template for extending the web socket funcitons.

This handles messages sent to the node process.
\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// This lets you add to the $tw.nodeMessageHandlers object without overwriting
// existing handler functions
$tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};

$tw.BrowserTiddlerList = $tw.BrowserTiddlerList || {};

/*
  This handles when the browser sends the list of all tiddlers that currently
  exist in the browser version of the wiki. This is different than the list of
  all tiddlers in files.
*/
$tw.nodeMessageHandlers.browserTiddlerList = function(data) {
  // Save the list of tiddlers in the browser as part of the $tw object so it
  // can be used elsewhere.
  $tw.BrowserTiddlerList[data.source_connection] = data.titles;
}

/*
  This is just a test function to make sure that everthing is working.
  It just displays the contents of the data in the console.
*/
$tw.nodeMessageHandlers.test = function(data) {
  console.log(data);
}

$tw.nodeMessageHandlers.saveTiddler = function(data) {
  if (data.tiddler) {
    if (data.tiddler.fields) {
      if (!data.tiddler.fields['draft.of']) {
        $tw.nodeMessageHandlers.cancelEditingTiddler({data:data.tiddler.fields.title});
        $tw.MultiUser.WaitingList[data.source_connection] = $tw.MultiUser.WaitingList[data.source_connection] || {};
        if (!$tw.MultiUser.WaitingList[data.source_connection][data.tiddler.fields.title]) {
          console.log('Node Save Tiddler');
          if (!$tw.boot.files[data.tiddler.fields.title]) {
            $tw.MultiUser.FileSystemFunctions.saveTiddler(data.tiddler);
          } else {
            // If changed send tiddler
            var tiddlerObject = $tw.loadTiddlersFromFile($tw.boot.files[data.tiddler.fields.title].filepath);
            var changed = $tw.MultiUser.FileSystemFunctions.TiddlerHasChanged(data.tiddler, tiddlerObject);
            if (changed) {
              $tw.MultiUser.FileSystemFunctions.saveTiddler(data.tiddler);
            }
          }
        } else {
          $tw.MultiUser.WaitingList[data.source_connection][data.tiddler.fields.title] = false;
        }
      }
    }
  }
}

$tw.nodeMessageHandlers.deleteTiddler = function(data) {
  //Something here!
  console.log('Node Delete Tiddler');
  $tw.MultiUser.FileSystemFunctions.deleteTiddler(data.tiddler);
  if ($tw.MultiUser.EditingTiddlers[data.tiddler]) {
    delete $tw.MultiUser.EditingTiddlers[data.tiddler];
    $tw.MultiUser.UpdateEditingTiddlers(false);
  }
}

$tw.nodeMessageHandlers.editingTiddler = function(data) {
  console.log('Editing Tiddler');
  $tw.MultiUser.UpdateEditingTiddlers(data.tiddler);
}

$tw.nodeMessageHandlers.cancelEditingTiddler = function(data) {
  console.log('Cancel Editing Tiddler');
  if (typeof data.data === 'string') {
    if (data.data.startsWith("Draft of '")) {
      var title = data.data.slice(10,-1);
    } else {
      var title = data.data;
    }
  } else {
    if (data.tiddler.startsWith("Draft of '")) {
      var title = data.tiddler.slice(10,-1);
    } else {
      var title = data.tiddler;
    }
  }
  if ($tw.MultiUser.EditingTiddlers[title]) {
    delete $tw.MultiUser.EditingTiddlers[title];
    $tw.MultiUser.UpdateEditingTiddlers(false);
  }
}

})()
