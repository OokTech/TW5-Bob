/*\
title: $:/plugins/OokTech/MultiUser/commands/externalserver.js
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

  var path = require("path");

  var Command = function(params,commander,callback) {
    this.params = params;
    this.commander = commander;
    this.callback = callback;
    // Commands that are just for the server
    $tw.ServerSide = require('$:/plugins/OokTech/MultiUser/ServerSide.js');
    // Make sure that $tw.settings is available.
    //var settings = require('$:/plugins/OokTech/NodeSettings/NodeSettings.js')
  };

  Command.prototype.execute = function() {
    return null;
  };

  exports.Command = Command;
}
})();
