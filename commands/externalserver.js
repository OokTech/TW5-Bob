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
  const Command = function(params,commander,callback) {
    this.params = params;
    this.commander = commander;
    this.callback = callback;
    // Commands that are just for the server
    $tw.ServerSide = require('$:/plugins/OokTech/Bob/ServerSide.js');
  };

  Command.prototype.execute = function() {
    const bobVersion = $tw.wiki.getTiddler('$:/plugins/OokTech/Bob').fields.version
    $tw.Bob.version = bobVersion;
    //$tw.Bob.logger.log('TiddlyWiki version', $tw.version, 'with Bob version', bobVersion, {level: 0})
    console.log('TiddlyWiki version', $tw.version, 'with Bob version', bobVersion);
    // Get the ip address to display to make it easier for other computers to
    // connect.
    const ip = require('$:/plugins/OokTech/Bob/External/IP/ip.js');
    const ipAddress = ip.address();
    $tw.settings.serverInfo = {
      ipAddress: ipAddress
    };

    return null;
  };

  exports.Command = Command;
}
})();
