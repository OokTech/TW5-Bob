/*\
title: $:/plugins/OokTech/Bob/BobLogger.js
type: application/javascript
module-type: startup

This module creates a logger similar to the built-in tiddlywiki logger but with
more options specific to Bob.

It is just a stopgap until I figure out how to make the logger for the core
tiddlywiki.

Logger levels:

-1 - (almost) no logging. There will still be output from loading the settings
  because the settings for the log levels have to be loaded before they can be
  used so they don't affect the module loading the settings.
0 - only necessary info (like the port being used) and errors that crash the server.
1 - basic information (wiki url paths, things that don't flood the terminal) also errors that would prevent actions from working
2 - listing every tiddler saved, deleted, renamed, etc. and any errors that would affect operation, noticable or not.
3 - lots of debugging information
4 - a truly ridiculous amount of stuff

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = 'BobLogger';
exports.after = ["load-modules"];
exports.platforms = ["node"];
exports.synchronous = true;

exports.startup = function() {
  if($tw.node) {
    $tw.ServerSide = require('$:/plugins/OokTech/Bob/ServerSide.js');
    // require the fs module if we are running node
    const fs = require("fs");
    const path = require("path");

    // Initialise objects
    $tw.Bob = $tw.Bob || {};
    $tw.settings.logger = $tw.settings.logger || {};
    $tw.Bob.logger = $tw.Bob.logger || {};

    /*
      Set up file logging
    */
    if($tw.settings.logger.useFileLogging === 'yes') {
      // Output gets written to a file
      const basePath = $tw.syncadaptor.getBasePath();
      const outputFolder = $tw.settings.logger.outputFolder || './logs';
      const outputBaseFileName = $tw.settings.logger.outputBaseFileName || 'Log';
      const { Console } = require('console');
      const timeStamp = new Date().toISOString();
      //$tw.utils.createDirectory(path.resolve(basePath,outputFolder));
      fs.mkdirSync(path.resolve(basePath,outputFolder), {recursive: true});
      const outputFile = path.resolve(basePath,outputFolder,outputBaseFileName + ' - ' + timeStamp + '.log')
      const stdout = fs.createWriteStream(outputFile);
      let stderr = undefined;
      if($tw.settings.logger.useSeparateErrorFile === 'yes') {
        const outputErrorFileName = $tw.settings.logger.outputErrorFileName || 'Error';
        const outputErrFile = path.resolve(basePath,outputFolder,outputErrorFileName + ' - ' + timeStamp + '.log')
        const outputErrorStream = '';
        stderr = fs.createWriteStream(outputErrFile);
      }

      const ignoreErrors = $tw.settings.logger.ignoreErrors === 'no'?false:true;

      const options = {
        stdout: stdout,
        stderr: stderr,
        ignoreErrors: ignoreErrors
      };

      $tw.Bob.logger.file = new Console(options);
    }
    if($tw.settings.logger.useBrowserLogging === 'yes') {
      // TODO this!!
      const browserLogTiddlerName = '$:/status/Bob/Logs'
      const browserErrorTiddlerName = '$:/status/Bob/Errors'
      $tw.Bob.logger.browser = {
        log: function(/* args */){
          // Take the message and put it into the logging tiddler
          // The key is the timestamp, the value is the message
          // Get the current json tiddler

          // Add the new message to it

          // Save the updated tiddler

        },
        error: function(/* args */){
          // Take the message and put it into the error tiddler
          // The key is the timestamp, the value is the message
          // Get the current json tiddler

          // Add the new message to it

          // Save the updated tiddler

        }
      }
    }
    if($tw.settings.logger.useConsoleLogging !== 'no') {
      $tw.Bob.logger.console = console;
    }

    // A convenience function that handles all of the logging types so you don't have to unless you have multiple enabled but only want to log something in one place.
    $tw.Bob.logger.log = function (/* args */) {
      let params = {}
      $tw.settings.logger = $tw.settings.logger || {};
      const argumentList = [].slice.apply(arguments);
      if(arguments.length > 1) {
        if(typeof arguments[arguments.length-1] === 'object') {
          params = argumentList.pop();
        }
      }
      if($tw.settings.logger.useFileLogging === 'yes') {
        $tw.settings.logger.fileLogLevel = $tw.settings.logger.fileLogLevel || 2;
        // Output gets written to a file
        if(typeof params.level === 'undefined' || $tw.settings.logger.fileLogLevel >= params.level) {
          $tw.Bob.logger.file.log(argumentList.join(' '));
        }
      }
      if($tw.settings.logger.useBrowserLogging === 'yes') {
        $tw.settings.logger.browserLogLevel = $tw.settings.logger.browserLogLevel || 2;
        // Output gets written to a tiddler so it is visible in the browser
        if(typeof params.level === 'undefined' || $tw.settings.logger.browserLogLevel >= params.level) {
          $tw.Bob.logger.browser.log(argumentList.join(' '));
        }
      }
      if($tw.settings.logger.useConsoleLogging !== 'no') {
        $tw.settings.logger.consoleLogLevel = $tw.settings.logger.consoleLogLevel || 2;
        // If another option isn't set than output is logged to the console
        if(typeof params.level === 'undefined' || $tw.settings.logger.consoleLogLevel >= params.level) {
          $tw.Bob.logger.console.log(argumentList.join(' '));
        }
      }
    }

    $tw.Bob.logger.error = function (/* args */) {
      let params = {}
      $tw.settings.logger = $tw.settings.logger || {};
      const argumentList = [].slice.apply(arguments);
      if(arguments.length > 1) {
        if(typeof arguments[arguments.length-1] === 'object') {
          params = argumentList.pop();
        }
      }
      if($tw.settings.logger.useFileLogging === 'yes') {
        $tw.settings.logger.fileLogLevel = $tw.settings.logger.fileLogLevel || 2;
        // Output gets written to a file
        if(typeof params.level === 'undefined' || $tw.settings.logger.fileLogLevel >= params.level) {
          $tw.Bob.logger.file.error(argumentList.join(' '));
        }
      }
      if($tw.settings.logger.useBrowserLogging === 'yes') {
        $tw.settings.logger.browserLogLevel = $tw.settings.logger.browserLogLevel || 2;
        // Output gets written to a tiddler so it is visible in the browser
        if(typeof params.level === 'undefined' || $tw.settings.logger.browserLogLevel >= params.level) {
          $tw.Bob.logger.browser.error(argumentList.join(' '));
        }
      }
      if($tw.settings.logger.useConsoleLogging !== 'no') {
        $tw.settings.logger.consoleLogLevel = $tw.settings.logger.consoleLogLevel || 2;
        // If another option isn't set than output is logged to the console
        if(typeof params.level === 'undefined' || $tw.settings.logger.consoleLogLevel >= params.level) {
          $tw.Bob.logger.console.error(argumentList.join(' '));
        }
      }
    }
  }
}

})();
