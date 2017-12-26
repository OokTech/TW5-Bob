/*\
title: $:/core/modules/commands/wsserver-child.js
type: application/javascript
module-type: command

Serve tiddlers using a two-way websocket server over http
This is the child process that is passed a server object by its parent.
This command just adds the required path to the server object to serve the
current wiki.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

if($tw.node) {
	var util = require("util"),
		fs = require("fs"),
		url = require("url"),
		path = require("path"),
		http = require("http");
}

exports.info = {
	name: "wsserver-child",
	synchronous: true
};

/*
  Commands are loaded before plugins so the updateSettings function may not exist
  yet.
*/
$tw.updateSettings = $tw.updateSettings || function (globalSettings, localSettings) {
  //Walk though the properties in the localSettings, for each property set the global settings equal to it, but only for singleton properties. Don't set something like GlobalSettings.Accelerometer = localSettings.Accelerometer, set globalSettings.Accelerometer.Controller = localSettings.Accelerometer.Contorller
  Object.keys(localSettings).forEach(function(key,index){
    if (typeof localSettings[key] === 'object') {
      if (!globalSettings[key]) {
        globalSettings[key] = {};
      }
      //do this again!
      $tw.updateSettings(globalSettings[key], localSettings[key]);
    } else {
      globalSettings[key] = localSettings[key];
    }
  });
}
$tw.loadSettings = function(settings, newSettingsPath) {
  if ($tw.node && !fs) {
    var fs = require('fs')
  }
	var rawSettings;
	var newSettings;

	// try/catch in case defined path is invalid.
	try {
		rawSettings = fs.readFileSync(newSettingsPath);
	} catch (err) {
		console.log(`ws-server - Failed to load settings file.`);
    rawSettings = '{}';
	}

	// Try to parse the JSON after loading the file.
	try {
		newSettings = JSON.parse(rawSettings);
	} catch (err) {
		console.log(`ws-server - Malformed Settings. Using empty default.`);
		console.log(`ws-server - Check Settings. Maybe comma error?`);
		// Create an empty default Settings.
		newSettings = {};
	}

  $tw.updateSettings(settings,newSettings);
}

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
  $tw.SendPath = function(m) {
    if (m.type === 'requestRoot') {
      // Next add the appropriate path here for the current wiki
      var reply = {
    		method: "GET",
        path: $tw.settings.MountPoint,
    		text: $tw.wiki.renderTiddler("text/plain","$:/core/save/all")
    	}
      process.send({type: 'updateRoot', route: reply});
    }
  }
  // add handler replying to the parent
  process.on('message', $tw.SendPath);
  console.log(`Serving on /${$tw.settings.MountPoint}`);
};

Command.prototype.execute = function() {
  $tw.WikiIsChild = true;
	if(!$tw.boot.wikiTiddlersPath) {
		$tw.utils.warning("Warning: Wiki folder '" + $tw.boot.wikiPath + "' does not exist or is missing a tiddlywiki.info file");
	}

	return null;
};

exports.Command = Command;

})();
