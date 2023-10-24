/*\
title: $:/plugins/OokTech/Bob/MultiWikiAdaptor.js
type: application/javascript
module-type: syncadaptor

A sync adaptor module for synchronising multiple wikis

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.platforms = ["node"];

if($tw.node) {
  // Get a reference to the file system
  const fs = require("fs"),
    path = require("path");

  $tw.Bob = $tw.Bob || {};
  $tw.Bob.Files = $tw.Bob.Files || {};

  /*
    TODO Create a message that lets us set excluded tiddlers from inside the wikis
    A per-wiki exclude list would be best but that is going to have annoying
    logic so it will come later.
  */
  $tw.Bob.ExcludeFilter = $tw.Bob.ExcludeFilter || "[[$:/StoryList]][[$:/HistoryList]][[$:/status/UserName]][[$:/Import]][prefix[$:/state/]][prefix[$:/temp/]][prefix[$:/WikiSettings]]";

  function MultiWikiAdaptor(options) {
    this.wiki = options.wiki;
  }

  $tw.hooks.addHook("th-make-tiddler-path", function(thePath, originalPath) {
    return originalPath;
  })

  MultiWikiAdaptor.prototype.name = "MultiWikiAdaptor";

  MultiWikiAdaptor.prototype.supportsLazyLoading = true

  MultiWikiAdaptor.prototype.isReady = function() {
    // The file system adaptor is always ready
    return true;
  };

  MultiWikiAdaptor.prototype.getTiddlerInfo = function(tiddler) {
    return {};
  };

  /*
  Return a fileInfo object for a tiddler, creating it if necessary:
    filepath: the absolute path to the file containing the tiddler
    type: the type of the tiddler file (NOT the type of the tiddler -- see below)
    hasMetaFile: true if the file also has a companion .meta file

  The boot process populates $tw.boot.files for each of the tiddler files that it loads. The type is found by looking up the extension in $tw.config.fileExtensionInfo (eg "application/x-tiddler" for ".tid" files).

  It is the responsibility of the filesystem adaptor to update $tw.boot.files for new files that are created.
  */
  MultiWikiAdaptor.prototype.getTiddlerFileInfo = function(tiddler, prefix, callback) {
    prefix = prefix || '';
    if(!callback) {
      callback = function (err, fileInfo) {
        if(err) {
          $tw.Bob.logger.error(err, {level:2});
        } else {
          return fileInfo;
        }
      }
    }
    // Generate the base filepath and ensure the directories exist
    $tw.Bob.Wikis = $tw.Bob.Wikis || {};
    $tw.Bob.Wikis[prefix] = $tw.Bob.Wikis[prefix] || {};
    // A cludge to make things work
    if(prefix === 'RootWiki') {
      $tw.Bob.Wikis[prefix].wikiTiddlersPath = $tw.Bob.Wikis[prefix].wikiTiddlersPath || $tw.boot.wikiTiddlersPath;
    }
    const tiddlersPath = $tw.Bob.Wikis[prefix].wikiTiddlersPath || path.join(generateWikiPath(prefix), 'tiddlers');
    $tw.utils.createFileDirectories(tiddlersPath);

    // See if we've already got information about this file
    const title = tiddler.fields.title;
    $tw.Bob.Files[prefix] = $tw.Bob.Files[prefix] || {};
    let fileInfo = $tw.Bob.Files[prefix][title];
    if(!fileInfo) {
      const systemPathsText = $tw.Bob.Wikis[prefix].wiki.getTiddlerText("$:/config/FileSystemPaths")
      let systemPathsList = []
      if(systemPathsText) {
        systemPathsList = systemPathsText.split("\n")
      }
      // Otherwise, we'll need to generate it
      fileInfo = $tw.utils.generateTiddlerFileInfo(tiddler,{
        directory: tiddlersPath,
        pathFilters: systemPathsList,
        wiki: $tw.Bob.Wikis[prefix].wiki
      });

      $tw.Bob.Files[prefix][title] = fileInfo;
      $tw.Bob.Wikis[prefix].tiddlers = $tw.Bob.Wikis[prefix].tiddlers || [];
      if($tw.Bob.Wikis[prefix].tiddlers.indexOf(title) === -1) {
        $tw.Bob.Wikis[prefix].tiddlers.push(title);
      }
    }
    callback(null,fileInfo);
  };

  /*
  Given a list of filters, apply every one in turn to source, and return the first result of the first filter with non-empty result.
  */
  MultiWikiAdaptor.prototype.findFirstFilter = function(filters,source) {
    for(let i=0; i<filters.length; i++) {
      const result = this.wiki.filterTiddlers(filters[i],null,source);
      if(result.length > 0) {
        return result[0];
      }
    }
    return null;
  };

  /*
  Given a tiddler title and an array of existing filenames, generate a new legal filename for the title, case insensitively avoiding the array of existing filenames
  */
  MultiWikiAdaptor.prototype.generateTiddlerBaseFilepath = function(title, wiki) {
    let baseFilename;
    let pathNameFilters;
    // Check whether the user has configured a tiddler -> pathname mapping
    if($tw.Bob.Wikis[wiki].wiki) {
      pathNameFilters = $tw.Bob.Wikis[wiki].wiki.getTiddlerText("$:/config/FileSystemPaths");
    }
    if(pathNameFilters) {
      const source = $tw.Bob.Wikis[wiki].wiki.makeTiddlerIterator([title]);
      baseFilename = this.findFirstFilter(pathNameFilters.split("\n"),source);
      if(baseFilename) {
        // Interpret "/" and "\" as path separator
        baseFilename = baseFilename.replace(/\/|\\/g,path.sep);
      }
    }
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
  MultiWikiAdaptor.prototype.saveTiddler = function(tiddler, prefix, connectionInd, callback) {
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
        self.getTiddlerFileInfo(new $tw.Tiddler(tiddler.fields), prefix,
         function(err,fileInfo) {
          if(err) {
            return callback(err);
          }
          // Make sure that the tiddler has actually changed before saving it
          if($tw.Bob.Shared.TiddlerHasChanged(tiddler, $tw.Bob.Wikis[prefix].wiki.getTiddler(tiddler.fields.title))) {
            // Save the tiddler in memory.
            internalSave(tiddler, prefix, connectionInd);
            $tw.Bob.Wikis[prefix].modified = true;
            $tw.Bob.logger.log('Save Tiddler ', tiddler.fields.title, {level:2});

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

            try {
              $tw.utils.saveTiddlerToFileSync(new $tw.Tiddler(tiddler.fields), fileInfo)
              $tw.hooks.invokeHook('wiki-modified', prefix);
              callback(null)
            } catch (e) {
                $tw.Bob.logger.log('Error Saving Tiddler ', tiddler.fields.title, e, {level:1});
                callback(e)
            }
          }
        });
      } else {
        callback(e)
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
  */
 /*
  MultiWikiAdaptor.prototype.loadTiddler = function(title,callback) {
    if(!callback) {
      callback = function () {

      }
    }
    callback(null,null);
  };
  */

  /*
  Delete a tiddler and invoke the callback with (err)
  */
  MultiWikiAdaptor.prototype.deleteTiddler = function(title, callback, options) {
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
      $tw.syncadaptor.loadWiki(prefix, finish);
    } else {
      finish();
    }
    function finish() {
      const fileInfo = $tw.Bob.Files[prefix][title];
      // I guess unconditionally say the wiki is modified in this case.
      $tw.Bob.Wikis[prefix].modified = true;
      // Only delete the tiddler if we have writable information for the file
      if(fileInfo) {
        // Delete the file
        fs.unlink(fileInfo.filepath,function(err) {
          if(err) {
            $tw.Bob.logger.log('error deleting file ', fileInfo.filepath, 'with error', err, {level:2});
            return callback(err);
          }
          $tw.Bob.logger.log('deleted file ', fileInfo.filepath, {level:2});
          // Delete the tiddler from the internal tiddlywiki side of things
          delete $tw.Bob.Files[prefix][title];
          $tw.Bob.Wikis[prefix].wiki.deleteTiddler(title);
          // Create a message saying to remove the tiddler
          const message = {type: 'deleteTiddler', tiddler: {fields:{title: title}}, wiki: prefix};
          // Send the message to each connected browser
          $tw.Bob.SendToBrowsers(message);
          $tw.hooks.invokeHook('wiki-modified', prefix);
          // Delete the metafile if present
          if(fileInfo.hasMetaFile) {
            fs.unlink(fileInfo.filepath + ".meta",function(err) {
              if(err) {
                $tw.Bob.logger.log('error deleting file ', fileInfo.filepath, 'with error', err, {level:2});
                return callback(err);
              }
              $tw.Bob.logger.log('deleting meta file ', fileInfo.filepath + '.meta', {level:3});
              return $tw.utils.deleteEmptyDirs(path.dirname(fileInfo.filepath),callback);
            });
          } else {
          return $tw.utils.deleteEmptyDirs(path.dirname(fileInfo.filepath),callback);
          }
        });
      } else {
        callback(null);
      }
    }
  };

  // Wiki management stuff

  MultiWikiAdaptor.prototype.renameWiki = function(data, cb) {
    const authorised = $tw.Bob.AccessCheck(data.fromWiki, {"decoded":data.decoded}, 'rename', 'wiki');
    if($tw.syncadaptor.existsListed(data.oldWiki) && !$tw.syncadaptor.existsListed(data.newWiki) && authorised) {
      // Unload the old wiki
      $tw.Bob.unloadWiki(data.oldWiki);
      const basePath = $tw.syncadaptor.getBasePath();
      const oldWikiPath = $tw.syncadaptor.getWikiPath(data.oldWiki);
      const newWikiPath = path.resolve(basePath, $tw.settings.wikisPath, data.newWiki);
      fs.rename(oldWikiPath, newWikiPath, function(e) {
        if(e) {
          $tw.Bob.logger.log('failed to rename wiki',e,{level:1});
          cb(e);
        } else {
          removeOldConnections(data.oldWiki);
          // Refresh wiki listing
          data.update = 'true';
          data.saveSettings = 'true';
          $tw.syncadaptor.updateWikiListing(data);
          cb();
        }
      })
    }
  }


  function removeOldConnections(wikiName) {
    // remove all of the connections to the renamed wiki
    const connectionsToRemove = Object.keys($tw.connections).filter(function(thisSessionId) {return $tw.connections[thisSessionId].wiki == wikiName});
    connectionsToRemove.forEach(function(thisSessionId) {
      delete $tw.connections[thisSessionId];
    })
  }


  MultiWikiAdaptor.prototype.deleteWiki = function(data, cb) {
    const authorised = $tw.Bob.AccessCheck(data.deleteWiki, {"decoded":data.decoded}, 'delete', 'wiki');
    // Make sure that the wiki exists and is listed
    if($tw.syncadaptor.existsListed(data.deleteWiki) && authorised) {
      $tw.Bob.unloadWiki(data.deleteWiki);
      removeOldConnections(data.deleteWiki)
      const wikiPath = $tw.syncadaptor.getWikiPath(data.deleteWiki);
      if(data.deleteChildren === 'yes') {
        deleteDirectory(wikiPath).then(function() {
          cb();
        }).catch(function(e) {
          cb(e);
        }).finally(function() {
          $tw.syncadaptor.updateWikiListing();
        })
      } else {
        // Delete the tiddlywiki.info file
        fs.unlink(path.join(wikiPath, 'tiddlywiki.info'), function(e) {
          if(e) {
            $tw.Bob.logger.error('failed to delete tiddlywiki.info',e, {level:1});
            cb(e);
            $tw.syncadaptor.updateWikiListing();
          } else {
            // Delete the tiddlers folder (if any)
            deleteDirectory(path.join(wikiPath, 'tiddlers')).then(function() {
              $tw.utils.deleteEmptyDirs(wikiPath,function() {
                cb();
              });
            }).catch(function(e){
              cb(e);
            }).finally(function() {
              $tw.syncadaptor.updateWikiListing();
            })
          }
        })
      }
    }
  }



  function deleteFile(dir, file) {
    return new Promise(function (resolve, reject) {
      //Check to make sure that dir is in the place we expect
      if(dir.startsWith($tw.syncadaptor.getBasePath())) {
        const filePath = path.join(dir, file);
        fs.lstat(filePath, function (err, stats) {
          if(err) {
            return reject(err);
          }
          if(stats.isDirectory()) {
            resolve(deleteDirectory(filePath));
          } else {
            fs.unlink(filePath, function (err) {
              if(err) {
                return reject(err);
              }
              resolve();
            });
          }
        });
      } else {
        reject('The folder is not in expected place!');
      }
    });
  };

  function deleteDirectory(dir) {
    return new Promise(function (resolve, reject) {
      // Check to make sure that dir is in the place we expect
      if(dir.startsWith($tw.syncadaptor.getBasePath())) {
        fs.access(dir, function (err) {
          if(err) {
            if(err.code === 'ENOENT') {
              return resolve();
            }
            return reject(err);
          }
          fs.readdir(dir, function (err, files) {
            if(err) {
              return reject(err);
            }
            Promise.all(files.map(function (file) {
              return deleteFile(dir, file);
            })).then(function () {
              fs.rmdir(dir, function (err) {
                if(err) {
                  return reject(err);
                }
                resolve();
              });
            }).catch(reject);
          });
        });
      } else {
        reject('The folder is not in expected pace!');
      }
    });
  };

  /*
  Determine which sub-folders are in the current folder
  */
  const getDirectories = function(source) {
    try {
      return fs.readdirSync(source).map(function(name) {
        return path.join(source,name)
      }).filter(function (source) {
        return fs.lstatSync(source).isDirectory();
      });
    } catch (e) {
      $tw.Bob.logger.error('Error getting directories', e, {level:2});
      return [];
    }
  }


  /*
    This recursively builds a tree of all of the subfolders in the tiddlers
    folder.
    This can be used to selectively watch folders of tiddlers.
  */
  const buildTree = function(location, parent) {
    const folders = getDirectories(path.join(parent,location));
    let parentTree = {'path': path.join(parent,location), folders: {}};
    if(folders.length > 0) {
      folders.forEach(function(folder) {
        const apex = folder.split(path.sep).pop();
        parentTree.folders[apex] = {};
        parentTree.folders[apex] = buildTree(apex, path.join(parent,location));
      })
    }
    return parentTree;
  }
  
  /*
    This copies a folder from source to destination
    both source and destination are paths
    This uses absolute paths, so make sure you get them before passing them to
    this function.
  
    source - the folder to copy
    destination - the folder to create containing a copy of the source folder
    copyChildren - if set to true than any child wikis inside the source folder will be copied as well, otherwise no child wikis will be copied.
    cb - an optional callback function, it is passed source, destination and copyChildren as arguments
  
    note: The callback is called only once for the original function call, it
    isn't called for any of the recursive calls used for sub-directories.
  */
  MultiWikiAdaptor.prototype.specialCopy = function(source, destination, copyChildren, cb) {
    let err = undefined;
    // Check to make sure inputs are what we expect
    if(typeof source !== 'string' || typeof destination !== 'string') {
      cb('The source or destination given is not a string.')
      return;
    }
    if(typeof copyChildren === 'function') {
      cb = copyChildren;
      copyChildren = false;
    } else if(typeof copyChildren === 'string') {
      copyChildren = (copyChildren==='true' || copyChildren === 'yes')?true:false;
    } else if(copyChildren !== true) {
      copyChildren = false;
    }
    try {
      fs.mkdirSync(destination, {recursive: true});
      const currentDir = fs.readdirSync(source)
      currentDir.forEach(function (item) {
        if(fs.statSync(path.join(source, item)).isFile()) {
          const fd = fs.readFileSync(path.join(source, item), {encoding: 'utf8'});
          fs.writeFileSync(path.join(destination, item), fd, {encoding: 'utf8'});
        } else {
          //Recurse!! Because it is a folder.
          // But make sure it is a directory first.
          if(fs.statSync(path.join(source, item)).isDirectory() && (!fs.existsSync(path.join(source, item, 'tiddlywiki.info')) || copyChildren)) {
            $tw.syncadaptor.specialCopy(path.join(source, item), path.join(destination, item), copyChildren);
          }
        }
      });
    } catch (e) {
      err = e;
    }
    if(typeof cb === 'function') {
      cb(err, source, destination, copyChildren)
    } else {
      return err;
    }
  }
  
    /*
    Given a wiki name this gets the wiki path if one is listed, if the wiki isn't
    listed this returns undefined.
    This can be used to determine if a wiki is listed or not.
  */
  MultiWikiAdaptor.prototype.getWikiPath = function(wikiName) {
    let wikiPath = undefined;
    if(wikiName === 'RootWiki') {
      wikiPath = path.resolve($tw.boot.wikiPath);
    } else if(wikiName.indexOf('/') === -1 && $tw.settings.wikis[wikiName]) {
      if(typeof $tw.settings.wikis[wikiName] === 'string') {
        wikiPath = $tw.settings.wikis[wikiName];
      } else if(typeof $tw.settings.wikis[wikiName].__path === 'string') {
        wikiPath = $tw.settings.wikis[wikiName].__path;
      }
    } else {
      const parts = wikiName.split('/');
      let obj = $tw.settings.wikis;
      for (let i = 0; i < parts.length; i++) {
        if(obj[parts[i]]) {
          if(i === parts.length - 1) {
            if(typeof obj[parts[i]] === 'string') {
              wikiPath = obj[parts[i]];
            } else if(typeof obj[parts[i]] === 'object') {
              if(typeof obj[parts[i]].__path === 'string') {
                wikiPath = obj[parts[i]].__path;
              }
            }
          } else {
            obj = obj[parts[i]];
          }
        } else {
          break;
        }
      }
    }
    // If the wikiPath exists convert it to an absolute path
    if(typeof wikiPath !== 'undefined') {
      $tw.settings.wikisPath = $tw.settings.wikisPath || './Wikis';
      const basePath = $tw.syncadaptor.getBasePath()
      wikiPath = path.resolve(basePath, $tw.settings.wikisPath, wikiPath);
    }
    return wikiPath;
  }
  
  /*
    Given a wiki name this generates the path for the wiki.
  */
  function generateWikiPath(wikiName) {
    const basePath = $tw.syncadaptor.getBasePath();
    $tw.settings.wikisPath = $tw.settings.wikisPath || './Wikis';
    return path.resolve(basePath, $tw.settings.wikisPath, wikiName);
  }
  
  /*
    This checks to make sure there is a tiddlwiki.info file in a wiki folder
  */
  function wikiExists(wikiFolder) {
    let exists = false;
    // Make sure that the wiki actually exists
    if(wikiFolder) {
      $tw.settings.wikisPath = $tw.settings.wikisPath || './Wikis'
      const basePath = $tw.syncadaptor.getBasePath()
      // This is a bit hacky to get around problems with loading the root wiki
      // This tests if the wiki is the root wiki and ignores the other pathing
      // bits
      if(wikiFolder === $tw.boot.wikiPath) {
        wikiFolder = path.resolve($tw.boot.wikiPath)
      } else {
        // Get the correct path to the tiddlywiki.info file
        wikiFolder = path.resolve(basePath, $tw.settings.wikisPath, wikiFolder);
        // Make sure it exists
      }
      exists = fs.existsSync(path.resolve(wikiFolder, 'tiddlywiki.info'));
    }
    return exists;
  }
  
  /*
    Return the resolved filePathRoot
  */
  MultiWikiAdaptor.prototype.getFilePathRoot= function() {
    const currPath = path.parse(process.argv[0]).name !== 'node' ? path.dirname(process.argv[0]) : process.cwd();
    let basePath = '';
    $tw.settings.filePathRoot = $tw.settings.filePathRoot || './files';
    if($tw.settings.filePathRoot === 'cwd') {
      basePath = path.parse(process.argv[0]).name !== 'node' ? path.dirname(process.argv[0]) : process.cwd();
    } else if($tw.settings.filePathRoot === 'homedir') {
      basePath = os.homedir();
    } else {
      basePath = path.resolve(currPath, $tw.settings.filePathRoot);
    }
    return basePath;
  }
    
  /*
    Return the resolved basePath
  */
  MultiWikiAdaptor.prototype.getBasePath = function() {
    const currPath = path.parse(process.argv[0]).name !== 'node' ? path.dirname(process.argv[0]) : process.cwd();
    let basePath = '';
    $tw.settings.wikiPathBase = $tw.settings.wikiPathBase || 'cwd';
    if($tw.settings.wikiPathBase === 'homedir') {
      basePath = os.homedir();
    } else if($tw.settings.wikiPathBase === 'cwd' || !$tw.settings.wikiPathBase) {
      basePath = path.parse(process.argv[0]).name !== 'node' ? path.dirname(process.argv[0]) : process.cwd();
    } else {
      basePath = path.resolve(currPath, $tw.settings.wikiPathBase);
    }
    return basePath;
  }

  /*
    This checks to make sure that a wiki exists
  */
  MultiWikiAdaptor.prototype.existsListed = function (wikiName) {
    if(typeof wikiName !== 'string') {
      return false;
    }
    let exists = false;
    // First make sure that the wiki is listed
    const wikiPath = $tw.syncadaptor.getWikiPath(wikiName);
    // Make sure that the wiki actually exists
    exists = wikiExists(wikiPath);
    if(exists) {
      return wikiPath;
    } else {
      return exists;
    }
  }

  /*
    This function loads a wiki that has a route listed.
  */
  MultiWikiAdaptor.prototype.loadWiki = function (wikiName, cb) {
    const wikiFolder = $tw.syncadaptor.existsListed(wikiName);
    // Add tiddlers to the node process
    if(wikiFolder) {
      $tw.settings['ws-server'] = $tw.settings['ws-server'] || {};
      $tw.Bob = $tw.Bob || {};
      $tw.Bob.Wikis = $tw.Bob.Wikis || {};
      $tw.Bob.Wikis[wikiName] = $tw.Bob.Wikis[wikiName] || {};
      $tw.Bob.Files[wikiName] = $tw.Bob.Files[wikiName] || {};
      $tw.Bob.EditingTiddlers[wikiName] = $tw.Bob.EditingTiddlers[wikiName] || {};
      // Make sure it isn't loaded already
      if($tw.Bob.Wikis[wikiName].State !== 'loaded') {
        // If the wiki isn't loaded yet set the wiki as loaded
        $tw.Bob.Wikis[wikiName].State = 'loaded';
        // Save the wiki path and tiddlers path
        $tw.Bob.Wikis[wikiName].wikiPath = wikiFolder;
        $tw.Bob.Wikis[wikiName].wikiTiddlersPath = path.resolve(wikiFolder, 'tiddlers');
  
  
        // Make sure that the tiddlers folder exists
        const error = $tw.utils.createDirectory($tw.Bob.Wikis[wikiName].wikiTiddlersPath);
        // Recursively build the folder tree structure
        $tw.Bob.Wikis[wikiName].FolderTree = buildTree('.', $tw.Bob.Wikis[wikiName].wikiTiddlersPath, {});
        if($tw.settings.disableFileWatchers !== 'yes') {
          // Watch the root tiddlers folder for chanegs
          $tw.Bob.WatchAllFolders($tw.Bob.Wikis[wikiName].FolderTree, wikiName);
        }
  
        // Add tiddlers to the node process
        // Create a wiki object for this wiki
        $tw.Bob.Wikis[wikiName].wiki = new $tw.Wiki();
        // Load the boot tiddlers
        $tw.utils.each($tw.loadTiddlersFromPath($tw.boot.bootPath),function(tiddlerFile) {
          $tw.Bob.Wikis[wikiName].wiki.addTiddlers(tiddlerFile.tiddlers);
        });
        // Load the core tiddlers
        if(!$tw.Bob.Wikis[wikiName].wiki.getTiddler('$:/core')) {
          $tw.Bob.Wikis[wikiName].wiki.addTiddler($tw.loadPluginFolder($tw.boot.corePath));
        }
        // Add tiddlers to the wiki
        const wikiInfo = loadWikiTiddlers($tw.Bob.Wikis[wikiName].wikiPath, {prefix: wikiName});
        $tw.Bob.Wikis[wikiName].wiki.registerPluginTiddlers("plugin",$tw.safeMode ? ["$:/core"] : undefined);
        // Unpack plugin tiddlers
        $tw.Bob.Wikis[wikiName].wiki.readPluginInfo();
        $tw.Bob.Wikis[wikiName].wiki.unpackPluginTiddlers();
        // Add plugins, themes and languages
        $tw.syncadaptor.loadPlugins(wikiInfo.plugins, $tw.config.pluginsPath, $tw.config.pluginsEnvVar, wikiName, function() {
          $tw.syncadaptor.loadPlugins(wikiInfo.themes, $tw.config.themesPath, $tw.config.themesEnvVar, wikiName, function() {
            $tw.syncadaptor.loadPlugins(wikiInfo.languages, $tw.config.languagesPath, $tw.config.languagesEnvVar, wikiName, function() {
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
              if(typeof cb === 'function') {
                return cb(true)
              }
            });
          });
        });
      } else {
        const fields = {
          title: '$:/WikiName',
          text: wikiName
        };
        $tw.Bob.Wikis[wikiName].wiki.addTiddler(new $tw.Tiddler(fields));
        if(typeof cb === 'function') {
          return cb(true)
        }
      }
    } else {
      return cb(false)
    }
  }
  
  /*
    path: path of wiki directory
    options:
    parentPaths: array of parent paths that we mustn't recurse into
    readOnly: true if the tiddler file paths should not be retained
  */
  function loadWikiTiddlers(wikiPath,options) {
    options = options || {};
    options.prefix = options.prefix || '';
    const parentPaths = options.parentPaths || [];
    const wikiInfoPath = path.resolve(wikiPath,$tw.config.wikiInfo);
    let wikiInfo;
    let pluginFields;
    // Bail if we don't have a wiki info file
    if(fs.existsSync(wikiInfoPath)) {
      try {
        wikiInfo = JSON.parse(fs.readFileSync(wikiInfoPath,"utf8"));
      } catch (e) {
        $tw.Bob.logger.error('Error reading wiki info', e, {level:1});
      }
    } else {
      return null;
    }
    // Load any parent wikis
    if(wikiInfo.includeWikis) {
      $tw.Bob.logger.error('Bob error: includeWikis is not supported yet!', {level:1});
      /*
      parentPaths = parentPaths.slice(0);
      parentPaths.push(wikiPath);
      $tw.utils.each(wikiInfo.includeWikis,function(info) {
        if(typeof info === "string") {
          info = {path: info};
        }
        var resolvedIncludedWikiPath = path.resolve(wikiPath,info.path);
        if(parentPaths.indexOf(resolvedIncludedWikiPath) === -1) {
          var subWikiInfo = loadWikiTiddlers(resolvedIncludedWikiPath,{
            parentPaths: parentPaths,
            readOnly: info["read-only"]
          });
          // Merge the build targets
          wikiInfo.build = $tw.utils.extend([],subWikiInfo.build,wikiInfo.build);
        } else {
          $tw.utils.error("Cannot recursively include wiki " + resolvedIncludedWikiPath);
        }
      });
      */
    }
    // Load any plugins, themes and languages listed in the wiki info file
    $tw.syncadaptor.loadPlugins(wikiInfo.plugins,$tw.config.pluginsPath,$tw.config.pluginsEnvVar, options.prefix);
    $tw.syncadaptor.loadPlugins(wikiInfo.themes,$tw.config.themesPath,$tw.config.themesEnvVar, options.prefix);
    $tw.syncadaptor.loadPlugins(wikiInfo.languages,$tw.config.languagesPath,$tw.config.languagesEnvVar, options.prefix);
    // Load the wiki files, registering them as writable
    const resolvedWikiPath = path.resolve(wikiPath,$tw.config.wikiTiddlersSubDir);
    function getTheseTiddlers() {
      let out = [];
      try {
        out = $tw.loadTiddlersFromPath(resolvedWikiPath);
      } catch(e) {
        $tw.Bob.logger.error(e, {level:1});
      }
      return out;
    }
    $tw.utils.each(
      getTheseTiddlers(), function(tiddlerFile) {
        let use = true;
        if(!options.readOnly && tiddlerFile.filepath) {
          $tw.utils.each(tiddlerFile.tiddlers,function(tiddler) {
            $tw.Bob.Files[options.prefix][tiddler.title] = {
              filepath: tiddlerFile.filepath,
              type: tiddlerFile.type,
              hasMetaFile: tiddlerFile.hasMetaFile
            };
            // this part is for lazyLoading
            if($tw.settings['ws-server'].rootTiddler === '$:/core/save/lazy-all') {
              
              if(Object.keys(tiddler).indexOf('text') > -1 && !tiddler.title.startsWith('$:/')) {
                // if the tiddler has a text field set the revision and _is_skinny fields
                tiddler.revision = $tw.Bob.Shared.getTiddlerHash({fields:tiddler})
                tiddler._is_skinny = ''
              }
            }
            if(['$:/plugins/tiddlywiki/tiddlyweb', '$:/plugins/tiddlywiki/filesystem'].indexOf(tiddler.title) !== -1) {
              use = false;
            }
          });
        }
        if(use) {
          $tw.Bob.Wikis[options.prefix].wiki.addTiddlers(tiddlerFile.tiddlers);
        }
      }
    );
    // Save the original tiddler file locations if requested
    const config = wikiInfo.config || {};
    if(config["retain-original-tiddler-path"]) {
      let output = {};
      for(let title in $tw.Bob.Files[options.prefix]) {
        output[title] = path.relative(resolvedWikiPath,$tw.Bob.Files[options.prefix][title].filepath);
      }
      $tw.Bob.Wikis[options.prefix].wiki.addTiddlers(new $tw.Tiddler({title: "$:/config/OriginalTiddlerPaths", type: "application/json", text: JSON.stringify(output)}));
    }
    // Save the path to the tiddlers folder for the filesystemadaptor
    $tw.Bob.Wikis = $tw.Bob.Wikis || {};
    $tw.Bob.Wikis[options.prefix] = $tw.Bob.Wikis[options.prefix] || {};
    $tw.Bob.Wikis[options.prefix].wikiTiddlersPath = path.resolve(wikiPath, config["default-tiddler-location"] || $tw.config.wikiTiddlersSubDir);
    // Load any plugins within the wiki folder
    const wikiPluginsPath = path.resolve(wikiPath,$tw.config.wikiPluginsSubDir);
    if(fs.existsSync(wikiPluginsPath)) {
      try {
        const pluginFolders = fs.readdirSync(wikiPluginsPath);
        for(let t=0; t<pluginFolders.length; t++) {
          pluginFields = $tw.loadPluginFolder(path.resolve(wikiPluginsPath,"./" + pluginFolders[t]));
          if(pluginFields) {
            $tw.Bob.Wikis[options.prefix].wiki.addTiddler(pluginFields);
          }
        }
      } catch (e) {
        $tw.Bob.logger.error('error loading plugin folder', e, {level:2});
      }
    }
    // Load any themes within the wiki folder
    const wikiThemesPath = path.resolve(wikiPath,$tw.config.wikiThemesSubDir);
    if(fs.existsSync(wikiThemesPath)) {
      try {
        const themeFolders = fs.readdirSync(wikiThemesPath);
        for(let t=0; t<themeFolders.length; t++) {
          pluginFields = $tw.loadPluginFolder(path.resolve(wikiThemesPath,"./" + themeFolders[t]));
          if(pluginFields) {
            $tw.Bob.Wikis[options.prefix].wiki.addTiddler(pluginFields);
          }
        }
      } catch (e) {
        $tw.Bob.logger.error('error loading theme folder', e, {level:2});
      }
    }
    // Load any languages within the wiki folder
    const wikiLanguagesPath = path.resolve(wikiPath,$tw.config.wikiLanguagesSubDir);
    if(fs.existsSync(wikiLanguagesPath)) {
      try {
        const languageFolders = fs.readdirSync(wikiLanguagesPath);
        for(let t=0; t<languageFolders.length; t++) {
          pluginFields = $tw.loadPluginFolder(path.resolve(wikiLanguagesPath,"./" + languageFolders[t]));
          if(pluginFields) {
            $tw.Bob.Wikis[options.prefix].wiki.addTiddler(pluginFields);
          }
        }
      } catch (e) {
        $tw.Bob.logger.error('Error loading language folder', e, {level:2});
      }
    }
    return wikiInfo;
  };

  /*
    This updates the server wiki listing, it is just the server task that checks
    to see if there are any unlisted wikis and that the currently listed wikis
    edist, so it doesn't need any authentication.
  
    This function checks to make sure all listed wikis exist and that all wikis
    it can find are listed.
    Then it saves the settings file to reflect the changes.
  */
  MultiWikiAdaptor.prototype.updateWikiListing = function(data) {
    data = data || {update:'true',remove:'true',saveSettings:true};
    // This gets the paths of all wikis listed in the settings
    function getWikiPaths(settingsObject, outPaths) {
      const settingsKeys = Object.keys(settingsObject);
      outPaths = outPaths || [];
      settingsKeys.forEach(function(thisKey) {
        if(thisKey === '__path') {
          // its one of the paths we want
          outPaths.push(path.resolve(basePath, $tw.settings.wikisPath, settingsObject[thisKey]));
        } else if(thisKey === '__permissions') {
          // Ignore it
        } else if(typeof settingsObject[thisKey] === 'object') {
          // Recurse
          outPaths = getWikiPaths(settingsObject[thisKey], outPaths);
        }
      })
      return outPaths
    }
    // This gets a list of all wikis in the wikis folder and subfolders
    function getRealPaths(startPath) {
      // Check each folder in the wikis folder to see if it has a
      // tiddlywiki.info file
      let realFolders = [];
      try {
        const folderContents = fs.readdirSync(startPath);
        folderContents.forEach(function (item) {
          const fullName = path.join(startPath, item);
          if(fs.statSync(fullName).isDirectory()) {
            if(wikiExists(fullName)) {
              realFolders.push(fullName);
            }
            // Check if there are subfolders that contain wikis and recurse
            const nextPath = path.join(startPath,item)
            if(fs.statSync(nextPath).isDirectory()) {
              realFolders = realFolders.concat(getRealPaths(nextPath));
            }
          }
        })
      } catch (e) {
        $tw.Bob.logger.log('Error getting wiki paths', e, {level:1});
      }
      return realFolders;
    }
    // This takes the list of wikis in the settings and returns a new object
    // without any of the non-existent wikis listed
    function pruneWikiList(dontExistList, settingsObj) {
      let prunedSettings = {};
      Object.keys(settingsObj).forEach(function(wikiName) {
        if(typeof settingsObj[wikiName] === 'string') {
          // Check if the wikiName resolves to one of the things to remove
          if(dontExistList.indexOf(path.resolve(wikiFolderPath, settingsObj[wikiName])) === -1) {
            // If the wiki isn't listed as not existing add it to the prunedSettings
            prunedSettings[wikiName] = settingsObj[wikiName];
          }
        } else if(typeof settingsObj[wikiName] === 'object') {
          if(Object.keys(settingsObj[wikiName]).length > 0) {
            const temp = pruneWikiList(dontExistList, settingsObj[wikiName]);
            if(Object.keys(temp).length > 0) {
              prunedSettings[wikiName] = temp;
            }
          }
        }
      })
      return prunedSettings;
    }
    const fs = require('fs');
    const path = require('path');
    const basePath = $tw.syncadaptor.getBasePath();
    $tw.settings.wikisPath = $tw.settings.wikisPath || './Wikis';
    let wikiFolderPath = path.resolve(basePath, $tw.settings.wikisPath);
    // Make sure that the wikiFolderPath exists
    const error = $tw.utils.createDirectory(path.resolve(basePath, $tw.settings.wikisPath));
    // Check each folder in the wikis folder to see if it has a tiddlywiki.info
    // file.
    // If there is no tiddlywiki.info file it checks sub-folders.
    const realFolders = getRealPaths(wikiFolderPath);
    // If it does check to see if any listed wiki has the same path, if so skip
    // it
    let alreadyListed = [];
    const listedWikis = getWikiPaths($tw.settings.wikis);
    realFolders.forEach(function(folder) {
      // Check is the wiki is listed
      if(listedWikis.indexOf(folder) > -1) {
        alreadyListed.push(folder);
      }
    })
    let wikisToAdd = realFolders.filter(function(folder) {
      return alreadyListed.indexOf(folder) === -1;
    })
    wikisToAdd = wikisToAdd.map(function(thisPath) {
      return path.relative(wikiFolderPath,thisPath);
    })
    const dontExist = listedWikis.filter(function(folder) {
      return !wikiExists(folder);
    })
    data.update = data.update || ''
    if(typeof data.update !== 'string') {
      data.update = (data.update === true)?'true':''
    }
    if(data.update.toLowerCase() === 'true') {
      wikisToAdd.forEach(function (wikiName) {
        if($tw.ExternalServer) {
          if(typeof $tw.ExternalServer.initialiseWikiSettings === 'function') {
            // This adds unlisted wikis as private and without giving them an
            // owner, so an admin needs to set the owner and stuff.
            $tw.ExternalServer.initialiseWikiSettings(wikiName, {});
          }
        } else {
          const nameParts = wikiName.split('/');
          let settingsObj = $tw.settings.wikis;
          let i;
          for (i = 0; i < nameParts.length; i++) {
            if(typeof settingsObj[nameParts[i]] === 'object' && i < nameParts.length - 1) {
              settingsObj = settingsObj[nameParts[i]];
            } else if(i < nameParts.length - 1) {
              settingsObj[nameParts[i]] = settingsObj[nameParts[i]] || {};
              settingsObj = settingsObj[nameParts[i]]
            } else {
              settingsObj[nameParts[i]] = settingsObj[nameParts[i]] || {};
              settingsObj[nameParts[i]].__path = nameParts.join('/');
            }
          }
        }
      })
    }
    if(typeof data.remove !== 'string') {
      data.remove = (data.remove === false)?'false':'true'
    }
    if(data.remove.toLowerCase() === 'true') {
      // update the wikis listing in the settings with a version that doesn't
      // have the wikis that don't exist.
      $tw.settings.wikis = pruneWikiList(dontExist, $tw.settings.wikis);
    }
    // Save the new settings, update routes, update settings tiddlers in the
    // browser and update the list of available wikis
    if(data.saveSettings) {
      data.fromServer = true;
      $tw.syncadaptor.saveSettings(data)
      $tw.httpServer.clearRoutes();
      $tw.httpServer.addOtherRoutes();
    }
    const message = {type: 'updateSettings'};
    $tw.Bob.SendToBrowsers(message);
  }
    
  $tw.stopFileWatchers = function(wikiName) {
    // Close any file watchers that are active for the wiki
    if($tw.Bob.Wikis[wikiName]) {
      if($tw.Bob.Wikis[wikiName].watchers) {
        Object.values($tw.Bob.Wikis[wikiName].watchers).forEach(function(thisWatcher) {
          thisWatcher.close();
        })
      }
    }
  }
  
  /*
    This ensures that the wikiName used is unique by appending a number to the
    end of the name and incrementing the number if needed until an unused name
    is created.
    If on name is given it defualts to NewWiki
  */
  MultiWikiAdaptor.prototype.GetWikiName = function (wikiName, count, wikiObj, fullName) {
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

  MultiWikiAdaptor.prototype.createWiki = function(data, cb) {
    const authorised = $tw.Bob.AccessCheck('create/wiki', {"decoded": data.decoded}, 'create/wiki', 'server');
    const quotasOk = $tw.Bob.CheckQuotas(data, 'wiki');
    if(authorised && quotasOk) {
      const fs = require("fs"),
        path = require("path");
      $tw.settings.wikisPath = $tw.settings.wikisPath || 'Wikis';
      // if we are using namespaced wikis prepend the logged in profiles name to
      // the wiki name.
      const name = ($tw.settings.namespacedWikis === 'yes') ? $tw.syncadaptor.GetWikiName((data.decoded.name || 'imaginaryPerson') + '/' + (data.wikiName || data.newWiki || 'NewWiki')) : $tw.syncadaptor.GetWikiName(data.wikiName || data.newWiki);
      const basePath = data.basePath || $tw.syncadaptor.getBasePath();
      const destination = path.resolve(basePath, $tw.settings.wikisPath, name);
      $tw.utils.createDirectory(path.join(basePath, $tw.settings.wikisPath));
      if(data.nodeWikiPath) {
        // This is just adding an existing node wiki to the listing
        addListing(name, data.nodeWikiPath);
        data.fromServer = true;
        $tw.nodeMessageHandlers.saveSettings(data);
        finish();
      } else if(data.tiddlers || data.externalTiddlers) {
        data.tiddlers = data.tiddlers || data.externalTiddlers;
        // Create a wiki using tiddlers sent from the browser, this is what is
        // used to create wikis from existing html files.
        // Start with an empty edition
        const searchPaths = $tw.getLibraryItemSearchPaths($tw.config.editionsPath,$tw.config.editionsEnvVar);
        const editionPath = $tw.findLibraryItem('empty',searchPaths);
        const err = $tw.syncadaptor.specialCopy(editionPath, destination, true);
        $tw.utils.createDirectory(path.join(basePath, $tw.settings.wikisPath, name));
        for(let i = 0; i < data.tiddlers.length; i++) {
          $tw.syncadaptor.getTiddlerFileInfo(new $tw.Tiddler(tiddler.fields), name,
          function(err,fileInfo) {
            $tw.utils.saveTiddlerToFileSync(new $tw.Tiddler(data.tiddlers[i]), fileInfo)
          })
        }
        finish();
      } else if(data.fromWiki) {
        // Duplicate a wiki
        // Make sure that the wiki to duplicate exists and that the target wiki
        // name isn't in use
        if($tw.syncadaptor.existsListed(data.fromWiki)) {
          // Get the paths for the source and destination
          $tw.settings.wikisPath = $tw.settings.wikisPath || './Wikis';
          const source = $tw.syncadaptor.getWikiPath(data.fromWiki);
          data.copyChildren = data.copyChildren || 'no';
          const copyChildren = data.copyChildren.toLowerCase() === 'yes'?true:false;
          // Make the duplicate
          $tw.syncadaptor.specialCopy(source, destination, copyChildren, function() {
            // Refresh wiki listing
            data.update = 'true';
            data.saveSettings = 'true';
            $tw.syncadaptor.updateWikiListing(data);
            $tw.Bob.logger.log('Duplicated wiki', data.fromWiki, 'as', name, {level: 2})
            finish();
          });
        }
      } else {
        // Paths are relative to the root wiki path
        // This is the path given by the person making the wiki, it needs to be
        // relative to the basePath
        // data.wikisFolder is an optional sub-folder to use. If it is set to
        // Wikis than wikis created will be in the basepath/Wikis/relativePath
        // folder I need better names here.
        // For now we only support creating wikis with one edition, multi edition
        // things like in the normal init command can come later.
        const editionName = data.edition?data.edition:"empty";
        const searchPaths = $tw.getLibraryItemSearchPaths($tw.config.editionsPath,$tw.config.editionsEnvVar);
        const editionPath = $tw.findLibraryItem(editionName,searchPaths);
        // Copy the edition content
        const err = $tw.syncadaptor.specialCopy(editionPath, destination, true);
        if(!err) {
          $tw.Bob.logger.log("Copied edition '" + editionName + "' to " + destination + "\n", {level:2});
        } else {
          $tw.Bob.logger.error(err, {level:1});
        }
        // Tweak the tiddlywiki.info to remove any included wikis
        const packagePath = path.join(destination, "tiddlywiki.info");
        let packageJson = {};
        try {
          packageJson = JSON.parse(fs.readFileSync(packagePath));
        } catch (e) {
          $tw.Bob.logger.error('failed to load tiddlywiki.info file', e, {level:1});
        }
        delete packageJson.includeWikis;
        try {
          fs.writeFileSync(packagePath,JSON.stringify(packageJson,null,$tw.config.preferences.jsonSpaces));
        } catch (e) {
          $tw.Bob.logger.error('failed to write tiddlywiki.info ', e, {level:1})
        }
        finish();
      }
  
      function finish() {
        // This is here as a hook for an external server. It is defined by the
        // external server and shouldn't be defined here or it will break
        // If you are not using an external server than this does nothing
        if($tw.ExternalServer) {
          if(typeof $tw.ExternalServer.initialiseWikiSettings === 'function') {
            const relativePath = path.relative(path.join(basePath, data.wikisFolder),destination);
            $tw.ExternalServer.initialiseWikiSettings(relativePath, data);
          }
        }
  
        setTimeout(function() {
          data.update = 'true';
          data.saveSettings = 'true';
          $tw.syncadaptor.updateWikiListing(data);
          if(typeof cb === 'function') {
            setTimeout(cb, 1500);
          }
        }, 1000);
      }
    }
  }

  /*
  plugins: Array of names of plugins (eg, "tiddlywiki/filesystemadaptor")
  libraryPath: Path of library folder for these plugins (relative to core path)
  envVar: Environment variable name for these plugins
  */
  MultiWikiAdaptor.prototype.loadPlugins = function(plugins, libraryPath, envVar, wikiName, cb) {
    if(typeof cb !== 'function') {
      cb = () => {};
    }
    if(plugins) {
      const pluginPaths = $tw.getLibraryItemSearchPaths(libraryPath,envVar);
      for(let t=0; t<plugins.length; t++) {
        if(plugins[t] !== 'tiddlywiki/filesystem' && plugins[t] !== 'tiddlywiki/tiddlyweb') {
          loadPlugin(plugins[t],pluginPaths, wikiName);
        }
      }
    }
    cb();
  };

  /*
  name: Name of the plugin to load
  paths: array of file paths to search for it
  */
  function loadPlugin(name, paths, wikiName) {
    const pluginPath = $tw.findLibraryItem(name,paths);
    if(pluginPath) {
      const pluginFields = $tw.loadPluginFolder(pluginPath);
      if(pluginFields) {
        $tw.Bob.Wikis[wikiName].wiki.addTiddler(pluginFields);
      }
    }
  };

  MultiWikiAdaptor.prototype.CreateSettingsTiddlers = function (data) {
    data = data || {}
    data.wiki = data.wiki || 'RootWiki'

    const fs = require('fs');
    const path = require('path');
    // Create the $:/ServerIP tiddler
    const message = {
      type: 'saveTiddler',
      wiki: data.wiki
    };
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
  }


  MultiWikiAdaptor.prototype.saveSettings = function(data) {
    const path = require('path');
    const fs = require('fs');
    // Save the updated settings
    const userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
    const userSettingsFolder = path.join($tw.boot.wikiPath, 'settings')
    if(!fs.existsSync(userSettingsFolder)) {
      // Create the settings folder
      fs.mkdirSync(userSettingsFolder);
    }
    // This should prevent an empty string from ever being given
    fs.writeFile(userSettingsPath, JSON.stringify($tw.settings, "", 2), {encoding: "utf8"}, function (err) {
      if(err) {
        const message = {
          alert: 'Error saving settings:' + err,
          connections: [data.source_connection]
        };
        $tw.ServerSide.sendBrowserAlert(message);
        $tw.Bob.logger.error(err, {level:1});
      } else {
        $tw.Bob.logger.log('Wrote settings file', {level:1})
      }
    });
  }

  MultiWikiAdaptor.prototype.loadSettings = function(cb) {
    if(typeof cb !== 'function') {
      cb = () => {};
    }
    // The user settings path
    const userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
    $tw.settings = JSON.parse($tw.wiki.getTiddler('$:/plugins/OokTech/Bob/DefaultSettings').fields.text);
    let newSettings;
    if(typeof $tw.ExternalServer !== 'undefined') {
      newSettings = require(path.join(process.cwd(),'LoadConfig.js')).settings;
      $tw.updateSettings(settings,newSettings);
    } else {
      if($tw.node && !fs) {
        const fs = require('fs')
      }
      let rawSettings;
      const userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
      // try/catch in case defined path is invalid.
      try {
        rawSettings = fs.readFileSync(userSettingsPath);
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
      $tw.updateSettings($tw.settings,newSettings);
    }
    $tw.syncadaptor.updateWikiListing()
    updateSettingsWikiPaths($tw.settings.wikis);
    cb();
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
      } else if(typeof inputObj[entry] === 'object' && entry !== '__permissions') {
        updateSettingsWikiPaths(inputObj[entry])
      }
    })
  }

  MultiWikiAdaptor.prototype.updateTiddlyWikiInfo = function(data) {
    const path = require('path')
    const fs = require('fs')
    const wikiInfoPath = path.join($tw.Bob.Wikis[data.wiki].wikiPath, 'tiddlywiki.info');
    let wikiInfo = {}
    try {
      wikiInfo = JSON.parse(fs.readFileSync(wikiInfoPath,"utf8"));
    } catch(e) {
      $tw.Bob.logger.error(e, {level:1})
    }
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
    try {
      fs.writeFileSync(wikiInfoPath, JSON.stringify(wikiInfo, null, 4))
    } catch (e) {
      $tw.Bob.logger.error(e, {level:1})
    }
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

  if($tw.node) {
    exports.adaptorClass = MultiWikiAdaptor;
  }
}

})();
