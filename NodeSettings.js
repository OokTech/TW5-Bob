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

if($tw.node) {
  const fs = require("fs");
  const path = require("path");
  /*
    Only load the settings if you are running node
  */
  const startup = function () {
    // The user settings path
    const userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
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
  function updateSettingsWikiPaths(inputObj) {
    Object.keys(inputObj).forEach(function(entry) {
      if(typeof inputObj[entry] === 'string' && entry !== '__path') {
        inputObj[entry] = {'__path': inputObj[entry]}
      } else if(typeof inputObj[entry] === 'object') {
        updateSettingsWikiPaths(inputObj[entry])
      }
    })
  }

  /*
    Parse the default settings file and the normal user settings file

    This function modifies the input settings object with the properties in the
    json file at newSettingsPath
  */
  $tw.loadSettings = function(settings, newSettingsPath) {
    if($tw.node && !fs) {
      const fs = require('fs')
    }
    let rawSettings;
    let newSettings;

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

  $tw.CreateSettingsTiddlers = function (data) {
    data = data || {}
    data.wiki = data.wiki || 'RootWiki'
    // Set the environment variable for the editions path from the settings.
    // Because we cheat and don't use command line arguments.
    if(typeof $tw.settings.editionsPath === 'string') {
      const basePath = $tw.ServerSide.getBasePath();
      // We need to make sure this doesn't overwrite existing thing
      const fullEditionsPath = path.resolve(basePath, $tw.settings.editionsPath);
      if(process.env["TIDDLYWIKI_EDITION_PATH"] !== undefined && process.env["TIDDLYWIKI_EDITION_PATH"] !== '') {
        process.env["TIDDLYWIKI_EDITION_PATH"] = process.env["TIDDLYWIKI_EDITION_PATH"] + path.delimiter + fullEditionsPath;
      } else {
        process.env["TIDDLYWIKI_EDITION_PATH"] = fullEditionsPath;
      }
    }
    /*
      TODO this needs to be set up so that it only shows things that you have
      permissions to see
    */
    // Create the list of plugins on the server
    const pluginList = $tw.utils.getPluginInfo();
    $tw.pluginsInfo = {};
    Object.keys(pluginList).forEach(function(index) {
      $tw.pluginsInfo[index] = pluginList[index].description;
    });
    let message = {
      type: 'saveTiddler',
      tiddler: {fields:{title: "$:/Bob/AvailablePluginList", text: JSON.stringify($tw.pluginsInfo, "", 2), type: "application/json"}},
      wiki: data.wiki
    };
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);

    // Create the list of themes on the server
    const themeList = $tw.utils.getThemeInfo();
    $tw.themesInfo = {};
    Object.keys(themeList).forEach(function(index) {
      $tw.themesInfo[index] = themeList[index].description;
    });
    message = {
      type: 'saveTiddler',
      tiddler: {fields:{title: "$:/Bob/AvailableThemeList", text: JSON.stringify($tw.themesInfo, "", 2), type: "application/json"}},
      wiki: data.wiki
    };
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);

    // Create the list of languages on the server
    const languageList = $tw.utils.getLanguageInfo();
    $tw.languagesInfo = {};
    Object.keys(languageList).forEach(function(index) {
      $tw.languagesInfo[index] = languageList[index].description;
    });
    message = {
      type: 'saveTiddler',
      tiddler: {fields:{title: "$:/Bob/AvailableLanguageList", text: JSON.stringify($tw.languagesInfo, "", 2), type: "application/json"}},
      wiki: data.wiki
    };
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);

    // Create the $:/Bob/AvailableEditionList tiddler
    const editionsList = $tw.utils.getEditionInfo();
    $tw.editionsInfo = {};
    Object.keys(editionsList).forEach(function(index) {
      $tw.editionsInfo[index] = editionsList[index].description;
    });
    message = {
      type: 'saveTiddler',
      tiddler: {fields:{title: "$:/Bob/AvailableEditionList", text: JSON.stringify($tw.editionsInfo, "", 2), type: "application/json"}},
      wiki: data.wiki
    };
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);

    // Create the $:/ServerIP tiddler
    message.tiddler = {fields: {title: "$:/ServerIP", text: $tw.settings.serverInfo.ipAddress, port: $tw.httpServerPort, host: $tw.settings.serverInfo.host}};
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
    // Save the settings to a tiddler.
    const settingsString = JSON.stringify($tw.settings, null, 2);
    const tiddlerFields = {
      title: '$:/WikiSettings',
      text: settingsString,
      type: 'application/json'
    };
    message.tiddler = {fields: tiddlerFields};
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
    // Split it into different things for each thingy
    doThisLevel($tw.settings, "$:/WikiSettings/split", data);
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
  }

  function doThisLevel (inputObject, currentName, data) {
    let currentLevel = {};
    Object.keys(inputObject).forEach( function (property) {
      if(typeof inputObject[property] === 'object') {
        // Call recursive function to walk through properties, but only if
        // there are properties
        if(Object.keys(inputObject[property])) {
          doThisLevel(inputObject[property], currentName + '/' + property, data);
          currentLevel[property] = currentName + '/' + property;
        }
      } else {
        // Add it to this one.
        currentLevel[property] = inputObject[property];
      }
    });
    const tiddlerFields = {
      title: currentName,
      text: JSON.stringify(currentLevel, "", 2),
      type: 'application/json'
    };
    let message = {
      type: 'saveTiddler',
      wiki: data.wiki
    };
    message.tiddler = {fields: tiddlerFields};
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
  }

  startup();
}

})();
