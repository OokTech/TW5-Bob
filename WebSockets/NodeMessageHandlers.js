/*\
title: $:/plugins/OokTech/Bob/NodeMessageHandlers.js
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

exports.platforms = ["node"];

exports.startup = function() {
if($tw.node) {
  $tw.connections = $tw.connections || [];
  $tw.Bob = $tw.Bob || {};
  $tw.Bob.Files = $tw.Bob.Files || {};
  $tw.Bob.Shared = require('$:/plugins/OokTech/Bob/SharedFunctions.js');
  // This lets you add to the $tw.nodeMessageHandlers object without overwriting
  // existing handler functions
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
  // Ensure that the browser tiddler list object exists without overwriting an
  // existing copy.
  $tw.BrowserTiddlerList = $tw.BrowserTiddlerList || {};

  /*
    This is just a test function to make sure that everthing is working.
    It displays the contents of the received data in the console.
  */
  $tw.nodeMessageHandlers.test = function(data) {
    $tw.Bob.logger.log(data, {level:0});
  }
}
}
})()
