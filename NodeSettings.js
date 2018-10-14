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
$tw.settings.wikis = $tw.settings.wikis || {};

if ($tw.node) {
  var fs = require("fs"),
    path = require("path");
  /*
    Only load the settings if you are running node
  */
  var startup = function () {
    // The user settings path
    var userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
    $tw.loadSettings($tw.settings, userSettingsPath);
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
    wiki = (wiki === '' || typeof wiki === 'undefined')?'RootWiki':wiki;
    // Set the environment variable for the editions path from the settings.
    // Because we cheat and don't use command line arguments.
    if (typeof $tw.settings.editionsPath === 'string') {
      // We need to make sure this doesn't overwrite existing thing
      if (process.env["TIDDLYWIKI_EDITION_PATH"] !== undefined && process.env["TIDDLYWIKI_EDITION_PATH"] !== '') {
        process.env["TIDDLYWIKI_EDITION_PATH"] = process.env["TIDDLYWIKI_EDITION_PATH"] + path.delimiter + $tw.settings.editionsPath;
      } else {
        process.env["TIDDLYWIKI_EDITION_PATH"] = $tw.settings.editionsPath;
      }
    }
    // Create the $:/EditionsList tiddler
    var editionsList = $tw.utils.getEditionInfo();
    $tw.editionsInfo = {};
    Object.keys(editionsList).forEach(function(index) {
      $tw.editionsInfo[index] = editionsList[index].description;
    });
    $tw.Bob.Wikis[wiki].wiki.addTiddler(new $tw.Tiddler({title: "$:/EditionsList", text: JSON.stringify($tw.editionsInfo, "", 2), type: "application/json"}));
    // Create the $:/ServerIP tiddler
    $tw.Bob.Wikis[wiki].wiki.addTiddler(new $tw.Tiddler({title: "$:/ServerIP", text: $tw.settings.serverInfo.ipAddress, port: $tw.settings.serverInfo.port, host: $tw.settings.serverInfo.host}));
    // Save the settings to a tiddler.
    var settingsString = JSON.stringify($tw.settings, null, 2);
    var tiddlerFields = {
      title: '$:/WikiSettings',
      text: settingsString,
      type: 'application/json'
    };
    $tw.Bob.Wikis[wiki].wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
    // Split it into different things for each thingy
    doThisLevel($tw.settings, "$:/WikiSettings/split", wiki);
    // Save the lists of plugins, languages and themes in tiddlywiki.info
    var wikiInfoPath = path.join($tw.Bob.Wikis[wiki].wikiPath, 'tiddlywiki.info');
    var wikiInfo
    try {
      wikiInfo = JSON.parse(fs.readFileSync(wikiInfoPath,"utf8"));
    } catch(e) {
      console.log(e)
    }
    if (typeof wikiInfo === 'object') {
      // Get plugin list
      var fieldsPluginList = {
        title: '$:/Bob/ActivePluginList',
        list: $tw.utils.stringifyList(wikiInfo.plugins)
      }
      $tw.Bob.Wikis[wiki].wiki.addTiddler(new $tw.Tiddler(fieldsPluginList));
      var fieldsThemesList = {
        title: '$:/Bob/ActiveThemesList',
        list: $tw.utils.stringifyList(wikiInfo.themes)
      }
      $tw.Bob.Wikis[wiki].wiki.addTiddler(new $tw.Tiddler(fieldsThemesList));
      var fieldsLanguagesList = {
        title: '$:/Bob/ActiveLanguagesList',
        list: $tw.utils.stringifyList(wikiInfo.languages)
      }
      $tw.Bob.Wikis[wiki].wiki.addTiddler(new $tw.Tiddler(fieldsLanguagesList));
    }
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
      title: currentName,
      text: JSON.stringify(currentLevel, "", 2),
      type: 'application/json'
    };
    $tw.Bob.Wikis[wiki].wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
  }

  startup();
}

})();
