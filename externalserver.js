/*\
title: $:/core/modules/commands/externalserver.js
type: application/javascript
module-type: command

Serve tiddlers using a two-way websocket server over http

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.info = {
  name: "externalserver",
  synchronous: true
};

exports.platforms = ["node"];

if($tw.node) {

  var util = require("util"),
    fs = require("fs"),
    url = require("url"),
    path = require("path"),
    http = require("http"),
    qs = require("querystring");

  // Commands that are just for the server
  $tw.ServerSide = require('$:/plugins/OokTech/MultiUser/ServerSide.js');

  // Make sure that $tw.settings is available.
  var settings = require('$:/plugins/OokTech/NodeSettings/NodeSettings.js')

  var Command = function(params,commander,callback) {
    this.params = params;
    this.commander = commander;
    this.callback = callback;
    // Get default Settings
    var settings = JSON.parse($tw.wiki.getTiddlerText('$:/plugins/OokTech/MultiUser/ws-server-default-settings'));
    // Make sure that $tw.settings exists.
    $tw.settings = $tw.settings || {};
    // Add Settings to the global $tw.settings
    $tw.updateSettings($tw.settings, settings);
    // Get user settings, if any
    var userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
    $tw.loadSettings($tw.settings,userSettingsPath);
  };

  Command.prototype.execute = function() {
    return null;
  };

  exports.Command = Command;
}
})();
