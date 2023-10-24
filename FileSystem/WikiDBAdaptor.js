/*\
title: $:/plugins/OokTech/Bob/WikiDBAdaptor.js
type: application/javascript
module-type: asyncadaptor

A sync adaptor module for synchronising multiple wikis

\*/
(function(){

  /*jslint node: true, browser: true */
  /*global $tw: false */
  "use strict";
  
  exports.platforms = ["node"];

  if($tw.node) {
    $tw.Bob = $tw.Bob || {};
    $tw.Bob.Files = $tw.Bob.Files || {};
    $tw.settings['ws-server'] = $tw.settings['ws-server'] || {};

    const http = require('http')

    function httpRequest(params, postData) {
      return new Promise(function(resolve, reject) {
        var req = http.request(params, function(res) {
          // reject on bad status
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error('statusCode=' + res.statusCode));
          }
          // cumulate data
          var body = [];
          res.on('data', function(chunk) {
            body.push(chunk);
          });
          // resolve on end
          res.on('end', function() {
            try {
              body = JSON.parse(Buffer.concat(body).toString());
            } catch(e) {
              reject(e);
            }
            resolve(body);
          });
        });
        // reject on request error
        req.on('error', function(err) {
          // This is not a "Second reject", just a different sort of failure
          reject(err);
        });
        if (postData) {
          req.write(postData);
        }
        // IMPORTANT
        req.end();
      });
    }

    WikiDBAdaptor.prototype.getTiddlerInfo = function() {
      
    }

    $tw.stopFileWatchers = () => {}

    /*
      TODO Create a message that lets us set excluded tiddlers from inside the wikis
      A per-wiki exclude list would be best but that is going to have annoying
      logic so it will come later.
    */
    $tw.Bob.ExcludeFilter = $tw.Bob.ExcludeFilter || "[[$:/StoryList]][[$:/HistoryList]][[$:/status/UserName]][[$:/Import]][prefix[$:/state/]][prefix[$:/temp/]][prefix[$:/WikiSettings]]";
  
    function WikiDBAdaptor(options) {
      this.wiki = options.wiki;
    }
  
    $tw.hooks.addHook("th-make-tiddler-path", function(thePath, originalPath) {
      return originalPath;
    })
  
    WikiDBAdaptor.prototype.name = "WikiDBAdaptor";
  
    WikiDBAdaptor.prototype.supportsLazyLoading = true

    WikiDBAdaptor.prototype.isReady = function() {
      // this should check to see if the database is ready, but because javascript refuses to have blocking calls we can't have that
      // we need to either change how adaptors work so they can use promises or just leave it like this.
      return true;
    };

    /*
      Load settings
    */
    WikiDBAdaptor.prototype.loadSettings = function(cb) {
      if(!cb) {cb = function() {}}
      // read the __wikiInfo database
      const body = JSON.stringify({
        db: '__settings',
        filter: '[all[]]'
      });
      const options = {
        hostname: '127.0.0.1',
        port: 9999,
        path: '/fetch',
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      httpRequest(options, body)
      .then((response)=>{
        if(response.length > 0) {
          Object.keys(response[0]).forEach((key) => {
            try {
              $tw.settings[key] = JSON.parse(response[0][key])
            } catch (e) {
              $tw.settings[key] = response[0][key]
            }
          })
        } else {
          $tw.syncadaptor.saveSettings();
        }
        $tw.syncadaptor.updateWikiListing(cb);
      })
      .catch((e) => {
        console.log(e)
      });
    }

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


    /*
    Given a tiddler title and an array of existing filenames, generate a new legal filename for the title, case insensitively avoiding the array of existing filenames
    */
    WikiDBAdaptor.prototype.generateTiddlerBaseFilepath = function(title, wiki) {
      let baseFilename;
      if(!baseFilename) {
        // No mappings provided, or failed to match this tiddler so we use title as filename
        baseFilename = title.replace(/\/|\\/g,"_");
      }
      // Remove any of the characters that are illegal in Windows filenames
      baseFilename = $tw.utils.transliterate(baseFilename.replace(/<|>|\:|\"|\||\?|\*|\^/g,"_"));
      // Truncate the filename if it is too long
      if(baseFilename.length > 200) {
        baseFilename = baseFilename.substr(0,200);
      }
      return baseFilename;
    };
  
    /*
    Save a tiddler and invoke the callback with (err,adaptorInfo,revision)
    */
    WikiDBAdaptor.prototype.saveTiddler = function(tiddler, prefix, connectionInd, callback) {
      const self = this;
      if(typeof prefix === 'function') {
        callback = prefix;
        prefix = null;
        connectionInd = null;
      }
      if(typeof connectionInd === 'function') {
        connectionInd = null;
        callback = connectionInd
      }
      if(typeof callback !== 'function') {
        callback = function () {
  
        }
      }
      prefix = prefix || 'RootWiki';
      if(!$tw.Bob.Wikis[prefix]) {
        $tw.syncadaptor.loadWiki(prefix, finish);
      } else {
        finish();
      }
      function finish() {
        if(tiddler && $tw.Bob.Wikis[prefix].wiki.filterTiddlers($tw.Bob.ExcludeFilter).indexOf(tiddler.fields.title) === -1) {
          // Make sure that the tiddler has actually changed before saving it
          if($tw.Bob.Shared.TiddlerHasChanged(tiddler, $tw.Bob.Wikis[prefix].wiki.getTiddler(tiddler.fields.title))) {
            // remove skinny tiddler things
            if($tw.settings['ws-server'].rootTiddler === '$:/core/save/lazy-all') {
              if(tiddler.fields.revision) {
                delete tiddler.fields.revision
              }
              if(tiddler.fields._revision) {
                delete tiddler.fields._revision
              }
              if(tiddler.fields._is_skinny) {
                delete tiddler.fields._is_skinny
              }
            }
            // Save the tiddler in memory.
            internalSave(tiddler, prefix, connectionInd);
            $tw.Bob.Wikis[prefix].modified = true;
            $tw.Bob.logger.log('Save Tiddler ', tiddler.fields.title, {level:2});

            const body = JSON.stringify({
              db: prefix,
              docs: [tiddler.fields]
            });
            const options = {
              hostname: '127.0.0.1',
              port: 9999,
              path: '/store',
              method: 'POST',
              mode: 'cors',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
              }
            };
            httpRequest(options, body)
            .then((response)=>{
              $tw.Bob.logger.log('saved tiddler ', tiddler.fields.title, {level:2});
              $tw.hooks.invokeHook('wiki-modified', prefix);
              return callback(null)
            })
            .catch((err) => {
              $tw.Bob.logger.log('Error Saving Tiddler ', tiddler.fields.title, err, {level:1});
              return callback(err);
            });
          }
        } else {
          return callback(null)
        }
      }
    };
  
    // Before the tiddler file is saved this takes care of the internal part
    function internalSave (tiddler, prefix, sourceConnection) {
      $tw.Bob.Wikis[prefix].wiki.addTiddler(new $tw.Tiddler(tiddler.fields));
      const message = {
        type: 'saveTiddler',
        wiki: prefix,
        tiddler: {
          fields: tiddler.fields
        }
      };
      $tw.Bob.SendToBrowsers(message, sourceConnection);
      // This may help
      $tw.Bob.Wikis = $tw.Bob.Wikis || {};
      $tw.Bob.Wikis[prefix] = $tw.Bob.Wikis[prefix] || {};
      $tw.Bob.Wikis[prefix].tiddlers = $tw.Bob.Wikis[prefix].tiddlers || [];
      if($tw.Bob.Wikis[prefix].tiddlers.indexOf(tiddler.fields.title) === -1) {
        $tw.Bob.Wikis[prefix].tiddlers.push(tiddler.fields.title);
      }
    }
  
    /*
    Load a tiddler and invoke the callback with (err,tiddlerFields)
  
    We don't need to implement loading for the file system adaptor, because all the tiddler files will have been loaded during the boot process.

    TODO: finish this
    */
    WikiDBAdaptor.prototype.loadTiddler = function(title, prefix, callback) {
      if(!callback) {callback = function () {}}
      const body = JSON.stringify({
        db: prefix,
        filter: '[['+title+']]'
      });
      const options = {
        hostname: '127.0.0.1',
        port: 9999,
        path: '/fetch',
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }
      httpRequest(options, body)
      .then((response)=>{
        callback(null, response[0])
      });
    };
  
    /*
    Delete a tiddler and invoke the callback with (err)
    */
    WikiDBAdaptor.prototype.deleteTiddler = function(title, callback, options) {
      if(typeof callback === 'object') {
        options = callback;
        callback = null;
      }
      if(!callback || typeof callback === 'object') {
        callback = function () {
          // Just a blank function to prevent errors
        }
      }
      if(typeof options !== 'object') {
        if(typeof options === 'string') {
          options = {wiki: options}
        } else {
          callback("no wiki given");
          return
        }
      }
      const prefix = options.wiki;
      if(!$tw.Bob.Files[prefix]) {
        $tw.ServerSide.loadWiki(prefix, finish);
      } else {
        finish();
      }
      function finish() {
        // I guess unconditionally say the wiki is modified in this case.
        $tw.Bob.Wikis[prefix].modified = true;

        const body = JSON.stringify({
          db: prefix,
          filter: '[['+title+']]'
        });
        const options = {
          hostname: '127.0.0.1',
          port: 9999,
          path: '/deletedoc',
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }
        httpRequest(options, body)
        .then((response)=>{
          $tw.Bob.logger.log('deleted tiddler ', title, ' from ', prefix, {level:2});
          // Delete the tiddler from the internal tiddlywiki side of things
          delete $tw.Bob.Files[prefix][title];
          $tw.Bob.Wikis[prefix].wiki.deleteTiddler(title);
          // Create a message saying to remove the tiddler
          const message = {type: 'deleteTiddler', tiddler: {fields:{title: title}}, wiki: prefix};
          // Send the message to each connected browser
          $tw.Bob.SendToBrowsers(message);
          $tw.hooks.invokeHook('wiki-modified', prefix);
          return callback(null)
        })
        .catch(err => {
          console.log(err)
          return callback(err)
        });
      }
    };
  
    WikiDBAdaptor.prototype.renameWiki = function(data, cb) {
      const authorised = $tw.Bob.AccessCheck(data.oldWiki, {"decoded":data.decoded}, 'rename', 'wiki');
      if (authorised) {
        $tw.Bob.unloadWiki(data.oldWiki)
        // rename the database for the wiki
        const body = JSON.stringify({
          db: data.oldWiki,
          newDB: data.newWiki
        });
        const options = {
          hostname: '127.0.0.1',
          port: 9999,
          path: '/renamedb',
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }
        httpRequest(options, body)
        .then((response) => {
          // update the __wikiInfo listing
          const body2 = JSON.stringify({
            db: "__wikiInfo",
            title: data.oldWiki,
            newTitle: data.newWiki
          })
          const options2 = {
            hostname: '127.0.0.1',
            port: 9999,
            path: '/renamedoc',
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body2)
            }
          }
          return httpRequest(options2, body2)
        })
        .then((response)=>{
          removeOldConnections(data.oldWiki);
          // Refresh wiki listing
          data.update = 'true';
          data.saveSettings = 'true';
          $tw.syncadaptor.updateWikiListing(cb);
        })
        .catch(err => {
          console.log(err)
          $tw.syncadaptor.updateWikiListing(cb);
          //return cb(err)
        });
      }
    }

    // TODO move this into some other file, probably the ws-server.js file
    function removeOldConnections(wikiName) {
      // remove all of the connections to the renamed wiki
      const connectionsToRemove = Object.keys($tw.connections).filter(function(thisSessionId) {return $tw.connections[thisSessionId].wiki == wikiName});
      connectionsToRemove.forEach(function(thisSessionId) {
        delete $tw.connections[thisSessionId];
      })
    }

    WikiDBAdaptor.prototype.deleteWiki = function(data, cb) {
      // delete the database for the wiki
      // remove the wiki database
      // remove the __wikiInfo document
      // remove old connections
      if(data.deleteWiki == 'RootWiki') {
        cb()
      } else {
        const authorised = $tw.Bob.AccessCheck(data.deleteWiki, {"decoded":data.deleteWiki}, 'delete', 'wiki');
        if (authorised) {
          $tw.Bob.unloadWiki(data.deleteWiki)
          // rename the database for the wiki
          const body = JSON.stringify({
            db: data.deleteWiki
          });
          const options = {
            hostname: '127.0.0.1',
            port: 9999,
            path: '/deletedb',
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body)
            }
          }
          httpRequest(options, body)
          .then((response) => {
            // update the __wikiInfo listing
            const body2 = JSON.stringify({
              db: "__wikiInfo",
              filter: `[[${data.deleteWiki}]]`
            })
            const options2 = {
              hostname: '127.0.0.1',
              port: 9999,
              path: '/deletedoc',
              method: 'POST',
              mode: 'cors',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body2)
              }
            }
            return httpRequest(options2, body2)
          })
          .then((response)=>{
            removeOldConnections(data.oldWiki);
            // Refresh wiki listing
            data.update = 'true';
            data.saveSettings = 'true';
            removeOldConnections();
            $tw.syncadaptor.updateWikiListing(cb);
          })
          .catch(err => {
            console.log(err)
            removeOldConnections();
            $tw.syncadaptor.updateWikiListing(cb);
          });
        }
      }
    }

    // TODO - this, probably just delete it
    WikiDBAdaptor.prototype.getWikiPath = function() {

    }

    // TODO - this, I am not sure if we will keep this or put all the files in the database
    WikiDBAdaptor.prototype.getFilePathRoot = function() {
      return './'
    }

    // TODO - this
    WikiDBAdaptor.prototype.getBasePath = function() {
      return './'
    }
 
    WikiDBAdaptor.prototype.existsListed = function(wikiName) {
      if (!Array.isArray($tw.settings.wikis)) {
        return false
      }
      if ($tw.settings.wikis && $tw.settings.wikis.indexOf(wikiName) > -1) {
        return true
      } else {
        return false
      }
    }

    WikiDBAdaptor.prototype.loadWiki = function(wikiName, cb) {
      if (typeof cb !== 'function') {cb = () => {}}
      // make sure stuff exists
      $tw.Bob.Wikis = $tw.Bob.Wikis || {};
      $tw.Bob.Wikis[wikiName] = $tw.Bob.Wikis[wikiName] || {};
      $tw.Bob.Files[wikiName] = $tw.Bob.Files[wikiName] || {};
      $tw.Bob.EditingTiddlers[wikiName] = $tw.Bob.EditingTiddlers[wikiName] || {};

      // Make sure it isn't loaded already
      if($tw.Bob.Wikis[wikiName].State !== 'loaded' && $tw.Bob.Wikis[wikiName].State !== 'loading') {
        $tw.Bob.Wikis[wikiName].State = 'loading'
        let tiddlerFilter, imagesFilter;
        if($tw.settings['ws-server'].rootTiddler === '$:/core/save/lazy-all') {
          tiddlerFilter = '[all[]!is[image]]'
          imagesFilter = '[is[image]]'
        } else {
          tiddlerFilter = '[all[]]'
        }
        let theTiddlers = [];
        let wikiInfo = [];
        let theThemes = [];
        let theLanguages = [];
        let thePlugins = [];
        let theBootTiddlers = [];
        const body = JSON.stringify({
          db: wikiName,
          filter: tiddlerFilter
        });
        const options = {
          hostname: '127.0.0.1',
          port: 9999,
          path: '/fetch',
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }

        const imageBody = JSON.stringify({
          db: wikiName,
          filter: imagesFilter
        })
        const imageOptions = {
          hostname: '127.0.0.1',
          port: 9999,
          path: '/skinny',
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(imageBody)
          }
        }

        const body2 = JSON.stringify({
          db: '__wikiInfo',
          filter: '[['+wikiName+']]'
        })
        const options2 = {
          hostname: '127.0.0.1',
          port: 9999,
          path: '/fetch',
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body2)
          }
        }
        httpRequest(options, body)
        .then((response)=>{
          // this part is for lazyLoading
          if($tw.settings['ws-server'].rootTiddler === '$:/core/save/lazy-all') {
            response.forEach(function(tiddler) {
              if(Object.keys(tiddler).indexOf('text') > -1 && !tiddler.title.startsWith('$:/')) {
                // if the tiddler has a text field set the revision and _is_skinny fields
                tiddler.revision = $tw.Bob.Shared.getTiddlerHash({fields:tiddler})
                tiddler._is_skinny = ''
              }
            })
          }
          theTiddlers = response;
          if (imagesFilter !== undefined) {
            return httpRequest(imageOptions, imageBody)
            .then(function(imageResponse) {
              imageResponse.forEach(function(tiddler) {
                // here we unconditionally add the fields because the tiddlers are lazily loaded from the database, so they are all skinny
                tiddler.revision = $tw.Bob.Shared.getTiddlerHash({fields:tiddler})
                tiddler._is_skinny = ''
              })
              theTiddlers = theTiddlers.concat(imageResponse)
              return httpRequest(options2, body2);
            })
          } else {
            return httpRequest(options2, body2);
          }
        })
        .then((response)=>{
          if(response.length == 0) {
            // there isn't any document in the __wikiInfo database for this wiki
            return cb(false)
          }
          wikiInfo = response[0]
          try {
            wikiInfo.plugins = wikiInfo.plugins ? JSON.parse(wikiInfo.plugins) : [];
            wikiInfo.themes = wikiInfo.themes ? JSON.parse(wikiInfo.themes) : [];
            wikiInfo.languages = wikiInfo.languages ? JSON.parse(wikiInfo.languages) : [];
          } catch (e) {
            wikiInfo.plugins = wikiInfo.plugins ? $tw.utils.parseStringArray(wikiInfo.plugins) : [];
            wikiInfo.themes = wikiInfo.themes ? $tw.utils.parseStringArray(wikiInfo.themes) : [];
            wikiInfo.languages = wikiInfo.languages ? $tw.utils.parseStringArray(wikiInfo.languages) : [];
          }
          // make sure the plugins, themes and languages are loaded from the appropriate databases
          const thisBody = JSON.stringify({
            db: '__themes',
            filter: wikiInfo.themes.map(b => `[[$:/themes/${b}]]`).join("")
          })
          return httpRequest({
            hostname: '127.0.0.1',
            port: 9999,
            path: '/fetch',
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(thisBody)
            }
          }, thisBody)
        })
        .then((response) => {
          theThemes = response
          const thisBody = JSON.stringify({
            db: '__languages',
            filter: wikiInfo.languages.map(b => `[[${b}]]`).join("")
          })
          return httpRequest({
            hostname: '127.0.0.1',
            port: 9999,
            path: '/fetch',
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(thisBody)
            }
          }, thisBody)
        })
        .then((response) => {
          theLanguages = response
          const thisBody = JSON.stringify({
            db: '__plugins',
            filter: "[[$:/core]][[$:/plugins/OokTech/Bob]]" + wikiInfo.plugins.map(b => `[[$:/plugins/${b}]]`).join("") + "+[unique[]]"
          })
          return httpRequest({
            hostname: '127.0.0.1',
            port: 9999,
            path: '/fetch',
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(thisBody)
            }
          }, thisBody)
        })
        .then((response) => {
          thePlugins = response
          const thisBody = JSON.stringify({
            db: '__boot',
            filter: "[all[]]"
          })
          return httpRequest({
            hostname: '127.0.0.1',
            port: 9999,
            path: '/fetch',
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(thisBody)
            }
          }, thisBody)
        })
        .then((response) => {
          theBootTiddlers = response
          addEverything(theTiddlers, wikiInfo, thePlugins, theThemes, theLanguages, theBootTiddlers, cb)
        })
        .catch((e) => {
          console.log(e)
        });
      } else if($tw.Bob.Wikis[wikiName].State === "loaded") {
        return cb(true);
      }
      
      function addEverything(wikiTiddlers, wikiInfo, thePlugins, theThemes, theLanguages, theBootTiddlers, cb) {
        // If the wiki isn't loaded yet set the wiki as loaded
        $tw.Bob.Wikis[wikiName].State = 'loaded';
        // Save the wiki path and tiddlers path
        $tw.Bob.Wikis[wikiName].wikiPath = wikiName;
        $tw.Bob.Wikis[wikiName].wikiTiddlersPath = '';
  
        // Add tiddlers to the node process
        // Create a wiki object for this wiki
        $tw.Bob.Wikis[wikiName].wiki = new $tw.Wiki();
        // Load the boot tiddlers
        $tw.Bob.Wikis[wikiName].wiki.addTiddlers(theBootTiddlers);
        // Load the core tiddlers
        const theCore = thePlugins.filter(a => a.name === 'Core')[0]
        if(!$tw.Bob.Wikis[wikiName].wiki.getTiddler('$:/core')) {
          $tw.Bob.Wikis[wikiName].wiki.addTiddler(theCore);
        }
        // Add the wiki tiddlers to the wiki
        $tw.Bob.Wikis[wikiName].wiki.addTiddlers(wikiTiddlers);

        // register plugins
        $tw.Bob.Wikis[wikiName].wiki.registerPluginTiddlers("plugin",$tw.safeMode ? ["$:/core"] : undefined);
        // Unpack plugin tiddlers
        $tw.Bob.Wikis[wikiName].wiki.readPluginInfo();
        $tw.Bob.Wikis[wikiName].wiki.unpackPluginTiddlers();
  
        // Add plugins, themes and languages
        $tw.Bob.Wikis[wikiName].wiki.addTiddlers(theThemes);
        $tw.Bob.Wikis[wikiName].wiki.addTiddlers(theLanguages);
        const notTheCore = thePlugins.filter(a => a.name !== 'Core')
        // TODO: make a setting that toggles this
        // this is needed for development!
        $tw.syncadaptor.loadPlugins(wikiInfo.plugins, $tw.config.pluginsPath, $tw.config.pluginsEnvVar, wikiName, function() {
          // Get the list of tiddlers for this wiki
          $tw.Bob.Wikis[wikiName].tiddlers = $tw.Bob.Wikis[wikiName].wiki.allTitles();
          $tw.Bob.Wikis[wikiName].plugins = wikiInfo.plugins.map(function(name) {
            return '$:/plugins/' + name;
          });
          $tw.Bob.Wikis[wikiName].themes = wikiInfo.themes.map(function(name) {
            return '$:/themes/' + name;
          });
          $tw.hooks.invokeHook('wiki-loaded', wikiName);
          const fields = {
            title: '$:/WikiName',
            text: wikiName
          };
          $tw.Bob.Wikis[wikiName].wiki.addTiddler(new $tw.Tiddler(fields));
          return cb(true)
        });
      }
    }

    WikiDBAdaptor.prototype.updateWikiListing = function(cb) {
      if (typeof cb != 'function') {cb = () => {}}
      // read the __wikiInfo database
      const body = JSON.stringify({
        db: '__wikiInfo',
        filter: '[all[]]'
      });
      const options = {
        hostname: '127.0.0.1',
        port: 9999,
        path: '/fetch',
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }
      httpRequest(options, body)
      .then((response)=>{
        response.forEach(item => {
          item.plugins = JSON.parse(item.plugins)
          item.build = JSON.parse(item.build)
          item.themes = JSON.parse(item.themes)
        })
        $tw.settings.wikis = response;
        const message = {type: 'updateSettings'};
        $tw.Bob.SendToBrowsers(message);
        cb()
      });
    }

    WikiDBAdaptor.prototype.GetWikiName = function (wikiName, count, wikiObj, fullName) {
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
          return $tw.syncadaptor.GetWikiName(nameParts.slice(1).join('/'), count, wikiObj[nameParts[0]], fullName);
        } else {
          return fullName;
        }
      } else {
        return undefined
      }
    }

    WikiDBAdaptor.prototype.createWiki = function(data, cb) {
      // Create a new wiki database
      const authorised = $tw.Bob.AccessCheck(data.oldWiki, {"decoded":data.decoded}, 'create', 'wiki');
      const quotasOk = $tw.Bob.CheckQuotas(data, 'wiki');
      if(authorised && quotasOk) {
        const name = ($tw.settings.namespacedWikis === 'yes') ? $tw.syncadaptor.GetWikiName((data.decoded.name || 'imaginaryPerson') + '/' + (data.wikiName || data.newWiki || 'NewWiki')) : $tw.syncadaptor.GetWikiName(data.wikiName || data.newWiki);
        const body = JSON.stringify({
          db: name,
        });
        const options = {
          hostname: '127.0.0.1',
          port: 9999,
          path: '/create',
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }
        const emptyInfo = JSON.stringify({
          "title": name,
          "description": "This is the demo edition for the Bob plugin created by OokTech",
          "plugins": JSON.stringify(["OokTech/Bob"]),
          "themes": JSON.stringify(["tiddlywiki/vanilla","tiddlywiki/snowwhite"]),
          "build": JSON.stringify({"index": ["--rendertiddler","$:/core/save/all","index.html","text/plain"]})
        })        
        httpRequest(options, body)
        .then((response) => {
          // update the __wikiInfo listing
          const body2 = JSON.stringify({
            db: "__wikiInfo",
            docs: [emptyInfo],
          })
          const options2 = {
            hostname: '127.0.0.1',
            port: 9999,
            path: '/store',
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body2)
            }
          }
          return httpRequest(options2, body2)
        })
        .then((response)=>{
          // Refresh wiki listing
          data.update = 'true';
          data.saveSettings = 'true';
          $tw.syncadaptor.updateWikiListing(cb);
          data.fromServer = true;
          $tw.nodeMessageHandlers.updateRoutes(data);
        })
        .catch(err => {
          console.log(err)
          $tw.syncadaptor.updateWikiListing(cb);
          data.fromServer = true;
          $tw.nodeMessageHandlers.updateRoutes(data);
        });
      }
    }


    // TODO - this
    WikiDBAdaptor.prototype.loadPlugins = function(plugins,libraryPath,envVar, wikiName, cb) {
      if(typeof cb !== 'function') {
        cb = () => {}
      }
      if(plugins) {
        const body = JSON.stringify({
          db: '__plugins',
          filter: plugins.map(a => '[[$:/plugins/' + a + ']]').join('')
        });
        const options = {
          hostname: '127.0.0.1',
          port: 9999,
          path: '/fetch',
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }       
        httpRequest(options, body)
        .then((response) => {
          response.forEach(function(thisPlugin) {
            $tw.Bob.Wikis[wikiName].wiki.addTiddler(thisPlugin);
          });
        })
        .catch(err => {
          console.log(err)
        })
        .finally(function() {
          cb()
        })
      }
    };

    // TODO this should probably move somewhere else
    WikiDBAdaptor.prototype.CreateSettingsTiddlers = function(data) {
      data = data || {}
      data.wiki = data.wiki || 'RootWiki'
      // Create the $:/ServerIP tiddler
      const message = {
        type: 'saveTiddler',
        wiki: data.wiki
      };
      const tmpSettings = {};
      Object.keys($tw.settings).forEach((thisKey) => {
        if(['wikis'].indexOf(thisKey) == -1) {
          tmpSettings[thisKey] = $tw.settings[thisKey];
        }
      })
      $tw.settings.serverInfo = $tw.settings.serverInfo || {}
      message.tiddler = {fields: {title: "$:/ServerIP", text: $tw.settings.serverInfo.ipAddress, port: $tw.httpServerPort, host: $tw.settings.serverInfo.host}};
      $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
      // load the wikiInfo and then make the settings tiddlers
      // save $tw.settings to the __settings database
      const body = JSON.stringify({
        db: '__settings',
        //docs: [$tw.settings],
        docs: [tmpSettings],
        overwrite: true
      });
      const options = {
        hostname: '127.0.0.1',
        port: 9999,
        path: '/store',
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }
      httpRequest(options, body)
      .then((response)=>{
        // Get plugin list
        const fieldsPluginList = {
          title: '$:/Bob/ActivePluginList',
          list: $tw.utils.stringifyList($tw.Bob.Wikis[data.wiki].plugins)
        }
        message.tiddler = {fields: fieldsPluginList};
        $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
        const fieldsThemesList = {
          title: '$:/Bob/ActiveThemesList',
          list: $tw.utils.stringifyList($tw.Bob.Wikis[data.wiki].themes)
        }
        message.tiddler = {fields: fieldsThemesList};
        $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
        const fieldsLanguagesList = {
          title: '$:/Bob/ActiveLanguagesList',
          list: $tw.utils.stringifyList($tw.Bob.Wikis[data.wiki].languages)
        }
        message.tiddler = {fields: fieldsLanguagesList};
        $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
      })
      .catch((err) => {
        // something here?
        console.log('Error at $tw.syncadaptor.CreateSettingsTiddlers',err)
      });
    }

    WikiDBAdaptor.prototype.saveSettings = function(data, cb) {
      // update settings in the DB
      if (typeof cb !== 'function') {
        cb = () => {}
      }
      // save $tw.settings to the __settings database
      const body = JSON.stringify({
        db: '__settings',
        docs: [$tw.settings],
        overwrite: true
      });
      const options = {
        hostname: '127.0.0.1',
        port: 9999,
        path: '/store',
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }
      httpRequest(options, body)
      .then((response)=>{
        $tw.Bob.logger.log('Saved settings to DB', {level:1})
        cb()
      })
      .catch((err) => {
        console.log(err)
        $tw.Bob.logger.log('Error saving settings to DB', {level:1})
      });
    }

    WikiDBAdaptor.prototype.updateTiddlyWikiInfo = function(data) {
      // update the tiddlywiki.info thing in the database
      if (typeof cb !== 'function') {
        cb = () => {}
      }
      // load the current wikiInfo for the wiki
      const body = JSON.stringify({
        db: '__wikiInfo',
        docs: `[[${data.wiki}]]`
      });
      const options = {
        hostname: '127.0.0.1',
        port: 9999,
        path: '/fetch',
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }

      httpRequest(options, body)
      .then((response)=>{
        const wikiInfo = response[0]
        if(data.description || data.description === "") {
          wikiInfo.description = data.description;
        }
        if(data.pluginList || data.pluginList === "") {
          wikiInfo.plugins = $tw.utils.parseStringArray(data.pluginList);
        }
        if(data.themeList || data.themeList === "") {
          wikiInfo.themes = $tw.utils.parseStringArray(data.themeList);
        }
        if(data.languageList || data.languageList === "") {
          wikiInfo.languages = $tw.utils.parseStringArray(data.languageList);
        }
        // update and then save the wikiInfo
        const body2 = JSON.stringify({
          db: '__wikiInfo',
          docs: [wikiInfo],
          overwrite: true
        });
        const options2 = {
          hostname: '127.0.0.1',
          port: 9999,
          path: '/store',
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }
        return httpRequest(options2, body2)
      })
      .then((response) => {
        $tw.Bob.logger.log(`Updated TiddlyWiki info for ${data.wiki} in DB`, {level:1})
      })
      .catch((err) => {
        $tw.Bob.logger.log(`Error updating TiddlyWiki info for ${data.wiki} in DB`, {level:1})
      });
    }

    if($tw.node) {
      exports.adaptorClass = WikiDBAdaptor;
    }
  }
  
  })();
  