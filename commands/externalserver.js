/*\
title: $:/plugins/OokTech/Bob/commands/externalserver.js
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
  var Command = function(params,commander,callback) {
    this.params = params;
    this.commander = commander;
    this.callback = callback;
    // Commands that are just for the server
    $tw.ServerSide = require('$:/plugins/OokTech/Bob/ServerSide.js');
  };

  Command.prototype.execute = function() {
    var bobVersion = $tw.wiki.getTiddler('$:/plugins/OokTech/Bob').fields.version
    console.log('TiddlyWiki version', $tw.version, 'with Bob version', bobVersion)

    // Get the ip address to display to make it easier for other computers to
    // connect.
    var ip = require('$:/plugins/OokTech/Bob/External/IP/ip.js');
    var ipAddress = ip.address();
    console.log('this place')
    console.log($tw.settings)
    $tw.settings.serverInfo = {
      ipAddress: ipAddress
    };

    return null;
  };

  exports.Command = Command;
}
})();
