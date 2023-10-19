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
//$tw.settings = $tw.settings || {};
//$tw.settings.wikis = $tw.settings.wikis || {};

if($tw.node) {
  //const fs = require("fs");
  //const path = require("path");
  /*
  $tw.CreateSettingsTiddlers = function (data) {
    data = data || {}
    data.wiki = data.wiki || 'RootWiki'

    // Create the $:/ServerIP tiddler
    const message = {
      type: 'saveTiddler',
      wiki: data.wiki
    };
    $tw.settings.serverInfo = $tw.settings.serverInfo || {}
    message.tiddler = {fields: {title: "$:/ServerIP", text: $tw.settings.serverInfo.ipAddress, port: $tw.httpServerPort, host: $tw.settings.serverInfo.host}};
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);

    let wikiInfo = undefined
    try {
      // Save the lists of plugins, languages and themes in tiddlywiki.info
      const wikiInfoPath = path.join($tw.Bob.Wikis[data.wiki].wikiPath, 'tiddlywiki.info');
      wikiInfo = JSON.parse(fs.readFileSync(wikiInfoPath,"utf8"));
    } catch(e) {
      console.log(e)
    }
    if(typeof wikiInfo === 'object') {
      // Get plugin list
      const fieldsPluginList = {
        title: '$:/Bob/ActivePluginList',
        list: $tw.utils.stringifyList(wikiInfo.plugins)
      }
      message.tiddler = {fields: fieldsPluginList};
      $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
      const fieldsThemesList = {
        title: '$:/Bob/ActiveThemesList',
        list: $tw.utils.stringifyList(wikiInfo.themes)
      }
      message.tiddler = {fields: fieldsThemesList};
      $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
      const fieldsLanguagesList = {
        title: '$:/Bob/ActiveLanguagesList',
        list: $tw.utils.stringifyList(wikiInfo.languages)
      }
      message.tiddler = {fields: fieldsLanguagesList};
      $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
    }
  }*/
}

if($tw.node && !$tw.ExternalServer) {
  //const fs = require("fs");
  //const path = require("path");
  /*
    Only load the settings if you are running node
  */
  const startup = function () {
    // The user settings path
    const userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
    $tw.settings = JSON.parse($tw.wiki.getTiddler('$:/plugins/OokTech/Bob/DefaultSettings').fields.text);
    $tw.loadSettings($tw.settings, userSettingsPath);
    updateSettingsWikiPaths($tw.settings.wikis);
  }

  /*
    This allows people to add wikis using name: path in the settings.json and
    still have them work correctly with the name: {__path: path} setup.

    It takes the wikis section of the settings and changes any entries that are
    in the form name: path and puts them in the form name: {__path: path}, and
    recursively walks through all the wiki entries.
  */
  /*
  function updateSettingsWikiPaths(inputObj) {
    Object.keys(inputObj).forEach(function(entry) {
      if(typeof inputObj[entry] === 'string' && entry !== '__path') {
        inputObj[entry] = {'__path': inputObj[entry]}
      } else if(typeof inputObj[entry] === 'object' && entry !== '__permissions') {
        updateSettingsWikiPaths(inputObj[entry])
      }
    })
  }
  */

  /*
    Parse the default settings file and the normal user settings file

    This function modifies the input settings object with the properties in the
    json file at newSettingsPath
  */
 /*
  $tw.loadSettings = function(settings, newSettingsPath) {
    return
    let newSettings;
    if(typeof $tw.ExternalServer !== 'undefined') {
      newSettings = require(path.join(process.cwd(),'LoadConfig.js')).settings;
      $tw.updateSettings(settings,newSettings);
    } else {
      if($tw.node && !fs) {
        const fs = require('fs')
      }
      let rawSettings;

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
  }
  */

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
 /*
  $tw.updateSettings = function (globalSettings, localSettings) {
    //Walk though the properties in the localSettings, for each property set the global settings equal to it, but only for singleton properties. Don't set something like GlobalSettings.Accelerometer = localSettings.Accelerometer, set globalSettings.Accelerometer.Controller = localSettings.Accelerometer.Contorller
    Object.keys(localSettings).forEach(function(key,index){
      if(typeof localSettings[key] === 'object') {
        if(!globalSettings[key]) {
          globalSettings[key] = {};
        }
        //do this again!
        $tw.updateSettings(globalSettings[key], localSettings[key]);
      } else {
        globalSettings[key] = localSettings[key];
      }
    });
  }
  */
  //startup();
}

})();
