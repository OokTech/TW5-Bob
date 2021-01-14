/*\
title: $:/plugins/OokTech/Bob/NodeWikiCreationHandlers.js
type: application/javascript
module-type: startup

These are message handler functions for the web socket servers. Use this file
as a template for extending the web socket funcitons.

This handles messages sent to the node process.
\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.platforms = ["node"];

exports.startup = function() {
if($tw.node) {
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
  /*
    This builds a single file html version of the current wiki.
    This is a modified version of the renderTiddler command.
    It can exclude tiddlers from the wiki using a filter and it can include
    tiddlers form any served wiki.
    buildWiki - the name of the base wiki to build
    excludeList - a filter that returns tiddlers to exclude from the resulting single file wiki.
    ignoreDefaultExclude - if this is 'true' than the default exclude list is ignored
    outputFolder - the name of the folder to save the result in
    outputName - the file name to use for the resulting html file (this should include the .html suffix)
    externalTiddlers - a json object that contains information about other tiddlers to include in the resulting html file

    About externalTiddlers:
      Each key is a the name of a wiki served by Bob, the value is a filter
      that will be run in that wiki and any returned tiddlers will be included in the output html file.
  */
  $tw.nodeMessageHandlers.buildHTMLWiki = function (data) {
    $tw.Bob.Shared.sendAck(data);
    const path = require('path');
    const fs = require('fs');
    let wikiPath, fullName, excludeList = [];
    if(data.buildWiki) {
      const exists = $tw.ServerSide.loadWiki(data.buildWiki);
      if(exists) {
        wikiPath = $tw.Bob.Wikis[data.buildWiki].wikiPath || undefined;
        fullName = data.buildWiki;
      }
    } else {
      wikiPath = $tw.Bob.Wikis[data.wiki].wikiPath;
      fullName = data.wiki;
    }
    $tw.Bob.logger.log('Build HTML Wiki:', fullName, {level:1});
    if(data.excludeList) {
      // Get the excludeList from the provided filter, if it exists
      excludeList = $tw.Bob.Wikis[fullName].wiki.filterTiddlers(data.excludeList);
    } else {
      // Otherwise we want to ignore the server-specific plugins to keep things
      // small.
      excludeList = ['$:/plugins/OokTech/Bob', '$:/plugins/tiddlywiki/filesystem', '$:/plugins/tiddlywiki/tiddlyweb'];
    }
    if(data.ignoreDefaultExclude !== 'true') {
      const defaultExclude = $tw.Bob.Wikis[fullName].wiki.filterTiddlers('[prefix[$:/plugins/OokTech/Bob/]][[$:/plugins/OokTech/Bob]][prefix[$:/WikiSettings]][prefix[$:/Bob/]][[$:/ServerIP]][[$:/plugins/tiddlywiki/filesystem]][[$:/plugins/tiddlywiki/tiddlyweb]]');
      excludeList = excludeList.concat(defaultExclude);
    }
    if(wikiPath) {
      const outputFolder = data.outputFolder || 'output';
      const outputName = data.outputName || 'index.html';
      const outputFile = path.resolve(wikiPath, outputFolder, outputName);
      $tw.utils.createFileDirectories(outputFile);
      let tempWiki = new $tw.Wiki();
      $tw.Bob.Wikis[fullName].wiki.allTitles().forEach(function(title) {
        if(excludeList.indexOf(title) === -1) {
          tempWiki.addTiddler($tw.Bob.Wikis[fullName].wiki.getTiddler(title));
        }
      })
      // If there are external tiddlers to add try and add them
      GatherTiddlers (tempWiki, data.externalTiddlers, data.transformFilters, data.transformFilter, data.decoded)
      // Prepare the wiki
      tempWiki.registerPluginTiddlers("plugin",["$:/core"]);
      // Unpack plugin tiddlers
      tempWiki.readPluginInfo();
      tempWiki.unpackPluginTiddlers();
      const text = tempWiki.renderTiddler('text/plain',"$:/core/save/all", {
        variables:{
          wikiTiddlers:$tw.utils.stringifyList(tempWiki.allTitles())
        }
      });
      fs.writeFile(outputFile,text,"utf8",function(err) {
        if(err) {
            $tw.Bob.logger.error(err, {level:1});
          } else {
            $tw.Bob.logger.log('Built Wiki: ', outputFile, {level:1});
            const message = {
              alert: 'Saved html file ' + outputFile + ' to the server.',
              wikis: [data.buildWiki, data.wiki]
            };
            $tw.ServerSide.sendBrowserAlert(message);
          }
      });
    } else {
      $tw.Bob.logger.error("Can't find wiki ", fullName, ", is it listed in the Bob settings tab?", {level:1});
    }
  }

  /*
    This lets you create a new wiki from existing tiddlers in other wikis.
    Tiddlers from each wiki are selected by filters

    inputs:

    tiddlers - an array of tiddlers in json format
    wikiFolder - The name of the folder that holds your wikis
    wikiName - The name of the wiki to create or add to
    wikisPath - the path to the folder that holds the wikiFolder
    overwrite - if a wikiName is given and a wiki with that name already exists
    than the tiddlers will be added to that wiki instead of making a new wiki.

    externalTiddlers - a json object that has filters to import tiddlers from
    existing wikis.

    If overwrite is not set to 'yes' than wiki names are made unique. If you
    already have a wiki called MyWiki and give MyWiki as the wikiName parameter
    than a number will be appended to the end of the name to make it unique,
    similarly to how new tiddler titles are made unique.
  */
  $tw.nodeMessageHandlers.newWikiFromTiddlers = function (data) {
    // send ack first because otherwise it often takes too long to run this
    // command and the message is sent again.
    $tw.Bob.Shared.sendAck(data);
    // Do nothing unless there is an input file path given
    if(data.tiddlers || data.externalTiddlers) {
      const path = require('path');
      const fs = require('fs')
      let wikiName, wikiTiddlersPath, basePath;
      const wikiFolder = data.wikiFolder || "Wikis";
      // If there is no wikiname given create one
      if(data.wikiName) {
        if(data.overwrite !== 'yes') {
          // If a name is given use it
          wikiName = GetWikiName(data.wikiName);
        } else {
          wikiName = data.wikiName;
        }
      } else {
        // Otherwise create a new wikiname
        wikiName = GetWikiName();
      }
      // If there is no output path given use a default one
      if(data.wikisPath) {
        basePath = data.wikisPath;
      } else {
        basePath = $tw.ServerSide.getBasePath()
      }

      // even if overwrite is set to true we need to make sure the wiki already
      // exists
      let exists = false;
      const wikiPath = path.join(basePath, wikiFolder, wikiName)
      if(data.overwrite === 'true') {
        exists = $tw.ServerSide.loadWiki(wikiName)
      }

      // If we aren't overwriting or it doesn't already exist than make the new
      // wiki and load it
      if(!(typeof exists === 'string') || data.overwrite !== 'true') {
        // First copy the empty edition to the wikiPath to make the
        // tiddlywiki.info
        const params = {
          "wiki": data.wiki,
          "basePath": basePath,
          "wikisFolder": wikiFolder,
          "edition": "empty",
          "path": wikiName,
          "wikiName": wikiName,
          "decoded": data.decoded,
          "fromServer": true
        };
        $tw.nodeMessageHandlers.createNewWiki(params, nextPart);
        // Get the folder for the wiki tiddlers
        wikiTiddlersPath = path.join(basePath, wikiFolder, wikiName, 'tiddlers');
        // Make sure tiddlers folder exists
        try {
          fs.mkdirSync(wikiTiddlersPath);
          $tw.Bob.logger.log('Created Tiddlers Folder ', wikiTiddlersPath, {level:2});
        } catch (e) {
          $tw.Bob.logger.log('Tiddlers Folder Exists:', wikiTiddlersPath, {level:2});
        }
      } else {
        nextPart();
      }
      function nextPart() {
        // Load the empty wiki
        $tw.ServerSide.loadWiki(wikiName)
        // Add all the received tiddlers to the loaded wiki
        let count = 0;
        $tw.utils.each(data.tiddlers,function(tiddler) {
          // Save each tiddler using the syncadaptor
          // We don't save the components that are part of the empty edition
          // because we start with that
          if(tiddler.title !== '$:/core' && tiddler.title !== '$:/themes/tiddlywiki/snowwhite' && tiddler.title !== '$:/themes/tiddlywiki/vanilla') {
            $tw.syncadaptor.saveTiddler({fields: tiddler}, wikiName);
          }
          count++;
        });
        // If there are external tiddlers to add try and add them
        let tempWiki = new $tw.Wiki();
        GatherTiddlers(tempWiki, data.externalTiddlers, data.transformFilters, data.transformFilter, data.decoded);
        tempWiki.allTitles().forEach(function(tidTitle) {
          $tw.syncadaptor.saveTiddler(tempWiki.getTiddler(tidTitle), wikiName);
          count++;
        })
        if(!count) {
          $tw.Bob.logger.log("No tiddlers found in the input file", {level:1});
        } else {
          $tw.Bob.logger.log("Wiki created",{level:1});
          const message = {
            alert: 'Created wiki ' + wikiName,
            connections: [data.source_connection]
          };
          $tw.ServerSide.sendBrowserAlert(message);
          $tw.Bob.logger.log('Created wiki ', wikiName, {level: 2})
        }
        setTimeout(function() {
          $tw.Bob.Wikis[wikiName].modified = true;
          data.update = 'true';
          data.saveSettings = 'true';
          $tw.ServerSide.updateWikiListing(data);
        }, 1000);
      }
    } else {
      $tw.Bob.logger.log('No tiddlers given!', {level:1});
    }
  }

  /*
    This takes an externalTiddlers object that lists wikis and filters that
    define the tiddlers to get from that wiki

    inputs:

    wiki - the $tw.Wiki object to add the tiddlers to
    externalTiddlers - a json object that lists the wikis and filters
    token - the access token, if any
  */
  function GatherTiddlers (wiki, externalTiddlers, transformFilters, transformFilter, decodedToken) {
    if(externalTiddlers) {
      try {
        let externalData = externalTiddlers
        if(typeof externalTiddlers !== 'object') {
          externalData = JSON.parse(externalTiddlers);
        }
        transformFilters = transformFilters || '{}'
        if(typeof transformFilters !== 'object') {
          transformFilters = JSON.parse(transformFilters);
        }
        Object.keys(externalData).forEach(function(wikiTitle) {
          const allowed = $tw.Bob.AccessCheck(wikiTitle, {"decoded": decodedToken}, 'view', 'wiki');
          if(allowed) {
            const exists = $tw.ServerSide.loadWiki(wikiTitle);
            if(exists) {
              const includeList = $tw.Bob.Wikis[wikiTitle].wiki.filterTiddlers(externalData[wikiTitle]);
              includeList.forEach(function(tiddlerTitle) {
                let tiddler = $tw.Bob.Wikis[wikiTitle].wiki.getTiddler(tiddlerTitle)
                // Transform the tiddler title if a transfom filter is given
                let txformFilter = transformFilter
                if(transformFilters) {
                  txformFilter = transformFilters[wikiTitle] || transformFilter;
                }
                if(txformFilter) {
                  const transformedTitle = ($tw.Bob.Wikis[wikiTitle].wiki.filterTiddlers(txformFilter, null, $tw.Bob.Wikis[wikiTitle].wiki.makeTiddlerIterator([tiddlerTitle])) || [""])[0];
                  if(transformedTitle) {
                    tiddler = new $tw.Tiddler(tiddler,{title: transformedTitle});
                  }
                }
                wiki.addTiddler(tiddler);
              })
            }
          }
        });
      } catch (e) {
        $tw.Bob.logger.log("Couldn't parse externalTiddlers input:", e, {level:1});
      }
    }
    return wiki;
  }

  /*
    This ensures that the wikiName used is unique by appending a number to the
    end of the name and incrementing the number if needed until an unused name
    is created.
    If on name is given it defualts to NewWiki
  */
  function GetWikiName (wikiName, count, wikiObj, fullName) {
    let updatedName;
    count = count || 0;
    wikiName = wikiName || ''
    if(wikiName.trim() === '') {
      wikiName = 'NewWiki'
    }
    fullName = fullName || wikiName || 'NewWiki';
    wikiObj = wikiObj || $tw.settings.wikis;
    const nameParts = wikiName.split('/');
    if(nameParts.length === 1) {
      updatedName = nameParts[0];
      if(wikiObj[updatedName]) {
        if(wikiObj[updatedName].__path) {
          count = count + 1;
          while (wikiObj[updatedName + String(count)]) {
            if(wikiObj[updatedName + String(count)].__path) {
              count = count + 1;
            } else {
              break;
            }
          }
        }
      }
      if(count > 0) {
        return fullName + String(count);
      } else {
        return fullName;
      }
    } else if(!wikiObj[nameParts[0]]) {
      if(count > 0) {
        return fullName + String(count);
      } else {
        return fullName;
      }
    }
    if(nameParts.length > 1) {
      if(wikiObj[nameParts[0]]) {
        return GetWikiName(nameParts.slice(1).join('/'), count, wikiObj[nameParts[0]], fullName);
      } else {
        return fullName;
      }
    } else {
      return undefined
    }
  }

  function addListing(wikiName, wikiPath, overwrite) {
    const pieces = wikiName.split('/');
    let current = $tw.settings.wikis
    for(let i = 0; i < pieces.length; i++) {
      current[pieces[i]] = current[pieces[i]] || {};
      current = current[pieces[i]];
    }
    if(!current.__path || overwrite) {
      current.__path = wikiPath;
    }
  }

  /*
    This is the generic command for making a new wiki in Bob, it also covers
    just listing a non-bob wiki.

    Anything that adds a wiki to the listing uses this.
  */
  // This is just a copy of the init command modified to work in this context
  $tw.nodeMessageHandlers.createNewWiki = function (data, cb) {
    $tw.Bob.Shared.sendAck(data);
    $tw.ServerSide.createWiki(data, callback);

    function callback(err) {
      if(err) {
        const message = {
          alert: 'Error creating wiki',
          connections: [data.source_connection]
        };
        $tw.ServerSide.sendBrowserAlert(message);
      } else {
        const name = data.newWiki || data.wikiName;
        const message = {
          alert: 'Created wiki ' + name,
          connections: [data.source_connection]
        };
        $tw.ServerSide.sendBrowserAlert(message);
      }
    }
  }

  /*
    This downloads the single html file version of a wiki
    It defaults to the current wiki but if you give a forWiki input it
    downloads that wiki instead.
  */
  $tw.nodeMessageHandlers.downloadHTMLFile = function (data) {
    $tw.Bob.Shared.sendAck(data);
    if(data.wiki) {
      const downloadWiki = data.forWiki || data.wiki;
      const allowed = $tw.Bob.AccessCheck(downloadWiki, {"decoded":data.decoded}, 'view', 'wiki');
      if(allowed) {
        const path = require('path');
        const fs = require('fs');
        try {
          const outputFilePath = path.join($tw.Bob.Wikis[data.wiki].wikiPath, 'output', 'index.html');
          const file = fs.readFileSync(outputFilePath);
          // Send file to browser in a websocket message
          const message = {'type': 'downloadFile', 'file': file};
          $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
          $tw.Bob.logger.log('Downloading wiki ', name, {level: 2})
        } catch (e) {
          $tw.Bob.logger.error('Error:', e, {level:1})
        }
      }
    }
  }

  /*
    This message fetches tiddlers from another wiki on the same Bob server
    The input data object has:
      fromWiki - the name of the wiki to pull from
      filter - the tiddler filter to use to select tiddlers from the remote
        wiki
      transformFilter - the titles of imported tiddlers are modified by this
        filter.
      resolution - how conflicts are handled
        - manual - all tiddlers are saved in a temporary place and have to be
          manually accepted or rejected
        - conflct - only tiddlers that conflict with existing tiddlers are
          saved in a temporary place to be accepted or rejected.
        - force - all imported tiddlers are saved regardelss of conflicts
  */
  $tw.nodeMessageHandlers.internalFetch = function(data) {
    $tw.Bob.Shared.sendAck(data);
    // Make sure that the person has access to the wiki
    const authorised = $tw.Bob.AccessCheck(data.fromWiki, {"decoded":data.decoded}, 'view', 'wiki');
    if(authorised) {
      let externalTiddlers = {};
      if(data.externalTiddlers) {
        try {
          externalTiddlers = JSON.parse(data.externalTiddlers);
        } catch (e) {
          $tw.Bob.logger.error("Can't parse externalTiddlers", {level:1});
        }
      }
      externalTiddlers[data.fromWiki] = data.filter
      let tempWiki = new $tw.Wiki();
      GatherTiddlers(tempWiki, externalTiddlers, data.transformFilters, data.transformFilter, data.decoded);

      // Add the results to the current wiki
      // Each tiddler gets added to the requesting wiki
      let list = []
      let message
      tempWiki.allTitles().forEach(function(tidTitle){
        // Get the current tiddler
        const tiddler = tempWiki.getTiddler(tidTitle);
        list.push(tiddler.fields.title)
        // Create the message with the appropriate conflict resolution
        // method and send it
        if(data.resolution === 'conflict') {
          message = {
            type: 'conflict',
            message: 'saveTiddler',
            tiddler: tiddler,
            wiki: data.wiki
          };
        } else if(data.resolution === 'force') {
          message = {
            type: 'saveTiddler',
            tiddler: tiddler,
            wiki: data.wiki
          };
        } else {
          message = {
            type: 'import',
            tiddler: tiddler,
            wiki: data.wiki
          };
        }
        $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
      })
      // Make the import list and send that tiddler too
      const importListTiddler = {
        fields: {
          title: '$:/status/Bob/importlist',
          tags: [],
          list: list
        }
      };
      message = {
        type: 'saveTiddler',
        tiddler: importListTiddler,
        wiki: data.wiki
      };
      $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message)
      if(data.resolution !== 'force') {
        const thisMessage = {
          alert: 'Fetched Tiddlers, see import list',
          wikis: [data.wiki]
        };
        $tw.ServerSide.sendBrowserAlert(thisMessage);
      }
      $tw.Bob.logger.log('Fetched tiddlers', {level: 2})
      $tw.Bob.logger.log('Fetched ',list, {level: 4})
    }
  }

  /*
    This creates a duplicate of an existing wiki, complete with any
    wiki-specific media files

    {
      wiki: callingWiki,
      fromWiki: fromWikiName,
      newWiki: newWikiName,
      copyChildren: copyChildren
    }

    fromWiki - the name of the wiki to duplicate
    newWiki - the name of the new wiki created
    copyChildren - if true than any child wikis contained in the fromWiki
    folder are also copied.

    If no fromWiki is given, or the name doesn't match an existing wiki, than
    the empty edition is used, if no newWiki is given than the default new name
    is used.
  */
  $tw.nodeMessageHandlers.duplicateWiki = function(data) {
    $tw.Bob.Shared.sendAck(data);
    if(typeof data.fromWiki === 'undefined') {
      return;
    }
    const path = require('path');
    const fs = require('fs');
    // Make sure that the wiki to duplicate exists and that the target wiki
    // name isn't in use
    const authorised = $tw.Bob.AccessCheck(data.fromWiki, {"decoded":data.decoded}, 'duplicate', 'wiki');
    if($tw.ServerSide.existsListed(data.fromWiki) && authorised) {
      const wikiName = GetWikiName(data.newWiki);
      // Get the paths for the source and destination
      $tw.settings.wikisPath = $tw.settings.wikisPath || './Wikis';
      data.wikisFolder = data.wikisFolder || $tw.settings.wikisPath;
      const source = $tw.ServerSide.getWikiPath(data.fromWiki);
      const basePath = $tw.ServerSide.getBasePath();
      const destination = path.resolve(basePath, $tw.settings.wikisPath, wikiName);
      data.copyChildren = data.copyChildren || 'no';
      const copyChildren = data.copyChildren.toLowerCase() === 'yes'?true:false;
      // Make the duplicate
      $tw.ServerSide.specialCopy(source, destination, copyChildren, function() {
        // Refresh wiki listing
        data.update = 'true';
        data.saveSettings = 'true';
        $tw.ServerSide.updateWikiListing(data);
        const message = {
          alert: 'Created wiki ' + wikiName,
          connections: [data.source_connection]
        };
        $tw.ServerSide.sendBrowserAlert(message);
        $tw.Bob.logger.log('Duplicated wiki', data.fromWiki, 'as', wikiName, {level: 2})
      });

      // This is here as a hook for an external server. It is defined by the
      // external server and shouldn't be defined here or it will break
      // If you are not using an external server than this does nothing
      if($tw.ExternalServer) {
        if(typeof $tw.ExternalServer.initialiseWikiSettings === 'function') {
          const relativePath = path.relative(path.join(basePath, data.wikisFolder),destination);
          $tw.ExternalServer.initialiseWikiSettings(relativePath, data);
        }
      }
    }
  }
}
}
})()
