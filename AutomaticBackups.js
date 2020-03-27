/*\
title: $:/plugins/OokTech/Bob/AutomaticBackups.js
type: application/javascript
module-type: startup

This module setups up automatic backups, if they are enabled.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = 'AutomaticBackups';
exports.after = ["load-modules"];
exports.platforms = ["node"];
exports.synchronous = true;

if($tw.node) {
  $tw.ServerSide = $tw.ServerSide || require('$:/plugins/OokTech/Bob/ServerSide.js');
  // Make sure that $tw.settings is available.
  const settings = require('$:/plugins/OokTech/NodeSettings/NodeSettings.js')
  // require the fs module if we are running node
  const fs = require("fs");
  const path = require("path");

  // Initialise objects
  $tw.Bob = $tw.Bob || {};

  /*
    When a wiki is loaded save a backup, then save a backup at regular
    intervals as long as the wiki has been edited since the last backup

    So when a wiki gets loaded save a backup and set a timeout, when the wiki gets edited set a timeout if one isn't already going, when the timeout runs out save a backup.
    Then if the wiki gets edited again start a new timeout.

    So save a copy when loading always

    when a wiki is edited and there isn't already a timer, start a timer, when
    the timer runs out save the wiki.
  */
  $tw.settings.backups = $tw.settings.backups || {};
  if($tw.settings.backups.enable === 'yes') {
    console.log($tw.settings.backups)
    $tw.settings.backups.backupFolder = $tw.settings.backups.backupFolder || './backups';
    $tw.settings.backups.backupInterval = $tw.settings.backups.backupInterval || 600000;
    if($tw.settings.backups.saveOnLoad === 'yes') {
      $tw.hooks.addHook('wiki-loaded', function(wikiName) {
        saveWikiBackup(wikiName);
      });
    }
    if($tw.settings.backups.saveOnModified) {
      $tw.hooks.addHook('wiki-modified', function(wikiName) {
        if($tw.Bob.Wikis[wikiName].timer === false || typeof $tw.Bob.Wikis[wikiName].timer === 'undefined') {
          setTimeout(saveWikiBackup, $tw.settings.backups.backupInterval, wikiName);
        }
      });
    }

    function saveWikiBackup(wikiName) {
      const folder = path.resolve($tw.ServerSide.getBasePath(), $tw.settings.backups.backupFolder, wikiName);
      const filePath = path.join(folder, 'backup-' + $tw.utils.stringifyDate(new Date()));
      $tw.utils.createDirectory(folder);
      fs.writeFile(filePath, $tw.ServerSide.prepareWiki(wikiName), function(err) {
        if(err) {
          console.log('error saving backup', err);
        }
        $tw.Bob.Wikis[wikiName].timer = false;
        if($tw.settings.backups.maxBackups > 0) {
          // make sure there are at most maxBackups wikis saved in the folder.
          fs.readdir(folder, function(err, filelist) {
            const backupsList = filelist.filter(function(item) {
              return item.startsWith('backup-')
            }).sort()
            if(backupsList.length > $tw.settings.backups.maxBackups) {
              for (let i = 0; i < backupsList.length - $tw.settings.backups.maxBackups; i++) {
                fs.unlink(path.join(folder,backupsList[i]),function(err){
                  if(err) {
                    console.log(err)
                  }
                });
              }
            }
          });
        }
      });
    }
  }
}

})();
