/*\
title: $:/plugins/OokTech/NodeSettings/NodeSettings.js
type: application/javascript
module-type: startup

Load settings settings from a JSON file or tiddlers

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// Export name and synchronous status
exports.name = "node-settings";
exports.platforms = ["node"];
exports.after = ["load-modules"];
exports.synchronous = true;

// Initialise the $tw.settings object
$tw.settings = $tw.settings || {};

if ($tw.node) {
  /*
    Only load the settings if you are running node
  */
  var defaultSettingsTiddler = '$:/plugins/OokTech/NodeSettings/DefaultSettings';
  var startup = function () {
    if ($tw.node) {
    	var fs = require("fs"),
    		path = require("path");

      var LocalSettings = {};

      // The default settings path
      var defaultSettings =  $tw.wiki.getTiddler(defaultSettingsTiddler);

      // The user settings path
      var userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');

      $tw.loadSettings($tw.settings, userSettingsPath);
    }
  }

  /*
    Parse the default settings file and the normal user settings file

    This function modifies the input settings object with the properties in the
    json file at newSettingsPath
  */
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
  		console.log('NodeSettings - No settings file, creating one with default values.');
      rawSettings = '{}';
  	}

  	// Try to parse the JSON after loading the file.
  	try {
  		newSettings = JSON.parse(rawSettings);
  		console.log('NodeSettings - Parsed raw settings.');
  	} catch (err) {
  		console.log('NodeSettings - Malformed settings. Using empty default.');
  		console.log('NodeSettings - Check settings. Maybe comma error?');
  		// Create an empty default settings.
  		newSettings = {};
  	}

    $tw.updateSettings(settings,newSettings);
  }

  // Modify according to settings tiddlers
  /*
    We have to be sure that the values are valid somehow
  */

  /*
    Add the update settings function to the $tw object.
    TODO figure out if there is a more appropriate place for it. I don't think so
    it doesn't fit with the rest of what is in $tw.utils and I can't think of
    another place to put it.

    Given a local and a global settings, this returns the global settings but with
    any properties that are also in the local settings changed to the values given
    in the local settings.
    Changes to the settings are later saved to the local settings.
  */
  $tw.updateSettings = function (globalSettings, localSettings) {
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

  $tw.CreateSettingsTiddlers = function (wiki) {
    wiki = wiki === ''?'RootWiki':wiki;
    // Save the settings to a tiddler.
    var settingsString = JSON.stringify($tw.settings, null, 2);
    var tiddlerFields = {
      title: '{' + wiki + '}' + '$:/WikiSettings',
      text: settingsString,
      type: 'application/json'
    };
    $tw.wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
    // Split it into different things for each thingy
    doThisLevel($tw.settings, "$:/WikiSettings/split", wiki);
  }

  function doThisLevel (inputObject, currentName, wiki) {
    var currentLevel = {};
    Object.keys(inputObject).forEach( function (property) {
      if (typeof inputObject[property] === 'object') {
        // Call recursive function to walk through properties
        doThisLevel(inputObject[property], currentName + '/' + property, wiki);
        currentLevel[property] = currentName + '/' + property;
      } else {
        // Add it to this one.
        currentLevel[property] = inputObject[property];
      }
    });
    var tiddlerFields = {
      title: '{' + wiki + '}' + currentName,
      text: JSON.stringify(currentLevel, "", 2),
      type: 'application/json'
    };
    $tw.wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
  }

  startup();
}

})();
