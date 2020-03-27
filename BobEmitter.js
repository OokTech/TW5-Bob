/*\
title: $:/plugins/OokTech/Bob/BobEmitter.js
type: application/javascript
module-type: startup

This module setups up an event emitter that Bob uses.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = 'BobEmitter';
exports.after = ["load-modules"];
exports.platforms = ["node"];
exports.synchronous = true;

if($tw.node) {
  $tw.ServerSide = $tw.ServerSide || require('$:/plugins/OokTech/Bob/ServerSide.js');
  // Make sure that $tw.settings is available.
  const settings = require('$:/plugins/OokTech/NodeSettings/NodeSettings.js')
  // require the fs module if we are running node
  const fs = require("fs");
  const path = require("path");
  const events = require("events")

  // Initialise objects
  $tw.Bob = $tw.Bob || {};

  $tw.Bob.emitter = new events();
}

})();
