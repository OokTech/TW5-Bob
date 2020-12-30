/*\
title: $:/plugins/OokTech/Bob/ServerSide.js
type: application/javascript
module-type: library

This is server functions that can be shared between different server types

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */


let ServerSide = {};

const path = require('path');
const fs = require('fs');
const os = require('os');

// A polyfilL to make this work with older node installs


// START POLYFILL
const reduce = Function.bind.call(Function.call, Array.prototype.reduce);
const isEnumerable = Function.bind.call(Function.call, Object.prototype.propertyIsEnumerable);
const concat = Function.bind.call(Function.call, Array.prototype.concat);
const keys = Reflect.ownKeys;

if(!Object.values) {
  Object.values = function values(O) {
    return reduce(keys(O), (v, k) => concat(v, typeof k === 'string' && isEnumerable(O, k) ? [O[k]] : []), []);
  };
}
// END POLYFILL

$tw.Bob = $tw.Bob || {};
$tw.Bob.Files = $tw.Bob.Files || {};

/*
  Return the resolved filePathRoot
*/
ServerSide.getFilePathRoot= function() {
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
ServerSide.getBasePath = function() {
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
  Given a wiki name this generates the path for the wiki.
*/
ServerSide.generateWikiPath = function(wikiName) {
  const basePath = $tw.ServerSide.getBasePath();
  $tw.settings.wikisPath = $tw.settings.wikisPath || './Wikis';
  return path.resolve(basePath, $tw.settings.wikisPath, wikiName);
}

/*
  Given a wiki name this gets the wiki path if one is listed, if the wiki isn't
  listed this returns undefined.
  This can be used to determine if a wiki is listed or not.
*/
ServerSide.getWikiPath = function(wikiName) {
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
    const basePath = $tw.ServerSide.getBasePath()
    wikiPath = path.resolve(basePath, $tw.settings.wikisPath, wikiPath);
  }
  return wikiPath;
}

/*
  This checks to make sure there is a tiddlwiki.info file in a wiki folder
*/
ServerSide.wikiExists = function (wikiFolder) {
  let exists = false;
  // Make sure that the wiki actually exists
  if(wikiFolder) {
    $tw.settings.wikisPath = $tw.settings.wikisPath || './Wikis'
    const basePath = $tw.ServerSide.getBasePath()
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
  This checks to make sure that a wiki exists
*/
ServerSide.existsListed = function (wikiName) {
  if(typeof wikiName !== 'string') {
    return false;
  }
  let exists = false;
  // First make sure that the wiki is listed
  const wikiPath = ServerSide.getWikiPath(wikiName);
  // Make sure that the wiki actually exists
  exists = ServerSide.wikiExists(wikiPath);
  if(exists) {
    return wikiPath;
  } else {
    return exists;
  }
}

/*
  This function loads a wiki that has a route listed.
*/
ServerSide.loadWiki = function (wikiName, cb) {
  const wikiFolder = ServerSide.existsListed(wikiName);
  // Add tiddlers to the node process
  if(wikiFolder) {
    $tw.settings['ws-server'] = $tw.settings['ws-server'] || {}
    $tw.Bob = $tw.Bob || {};
    $tw.Bob.Wikis = $tw.Bob.Wikis || {};
    $tw.Bob.Wikis[wikiName] = $tw.Bob.Wikis[wikiName] || {};
    $tw.Bob.Files[wikiName] = $tw.Bob.Files[wikiName] || {};
    $tw.Bob.EditingTiddlers[wikiName] = $tw.Bob.EditingTiddlers[wikiName] || {};
    // Make sure it isn't loaded already
    if($tw.Bob.Wikis[wikiName].State !== 'loaded') {
      // Save the wiki path and tiddlers path
      $tw.Bob.Wikis[wikiName].wikiPath = wikiFolder;
      // Create a wiki object for this wiki
      $tw.Bob.Wikis[wikiName].wiki = new $tw.Wiki();
      // From $tw.loadTiddlersNode
      // Load the boot tiddlers
      $tw.utils.each($tw.loadTiddlersFromPath($tw.boot.bootPath),function(tiddlerFile) {
        $tw.Bob.Wikis[wikiName].wiki.addTiddlers(tiddlerFile.tiddlers);
      });
      // Load the core tiddlers
      $tw.Bob.Wikis[wikiName].wiki.addTiddler($tw.loadPluginFolder($tw.boot.corePath));
      // Add tiddlers to the wiki
      $tw.Bob.Wikis[wikiName].wikiInfo = loadWikiTiddlers($tw.Bob.Wikis[wikiName].wikiPath, {prefix: wikiName});
      // From $tw.boot.execStartup
      $tw.Bob.Wikis[wikiName].wiki.readPluginInfo();
      $tw.Bob.Wikis[wikiName].wiki.registerPluginTiddlers("plugin",$tw.safeMode ? ["$:/core"] : undefined);
      // Unpack plugin tiddlers
      $tw.Bob.Wikis[wikiName].wiki.unpackPluginTiddlers();
      // Process "safe mode"
      if($tw.safeMode) {
        $tw.Bob.Wikis[wikiName].wiki.processSafeMode();
      }
      // Register typed modules from the tiddlers we've just loaded
      $tw.Bob.Wikis[wikiName].wiki.defineTiddlerModules();
      // And any modules within plugins
      $tw.Bob.Wikis[wikiName].wiki.defineShadowModules();
      // Encryption handling would go here
      // from $tw.boot.execStartup

      // Get the list of tiddlers for this wiki
      $tw.Bob.Wikis[wikiName].tiddlers = $tw.Bob.Wikis[wikiName].wiki.allTitles();
      $tw.Bob.Wikis[wikiName].plugins = wikiInfo.plugins ? wikiInfo.plugins.map(function(name) {
        return '$:/plugins/' + name;
      }): [];
      $tw.Bob.Wikis[wikiName].themes = wikiInfo.themes ? wikiInfo.themes.map(function(name) {
        return '$:/themes/' + name;
      }): [];
      $tw.Bob.Wikis[wikiName].languages = wikiInfo.languages ? wikiInfo.languages.map(function(name) {
        return '$:/themes/' + name;
      }): [];
      // If the wiki isn't loaded yet set the wiki as loaded
      $tw.Bob.Wikis[wikiName].State = 'loaded';
      $tw.hooks.invokeHook('wiki-loaded', wikiName);
    }
    const fields = {
      title: '$:/WikiName',
      text: wikiName
    };
    $tw.Bob.Wikis[wikiName].wiki.addTiddler(new $tw.Tiddler(fields));
    if(typeof cb === 'function') {
      setTimeout(cb, 1000)
    }
  }
  return wikiFolder;
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
      return null;
    }
  } else {
    return null;
  }
  // Save the wikiTiddlersPath for the MultiWikiAdaptor
	var config = wikiInfo.config || {};
	if($tw.Bob.Wikis[options.prefix].wikiPath == wikiPath) {
    if(options.prefix === 'RootWiki' && !$tw.Bob.Wikis[options.prefix].wikiTiddlersPath) {
      $tw.Bob.Wikis[options.prefix].wikiTiddlersPath = $tw.boot.wikiTiddlersPath;
    } else {
      $tw.Bob.Wikis[options.prefix].wikiTiddlersPath = path.resolve($tw.Bob.Wikis[options.prefix].wikiPath,config["default-tiddler-location"] || $tw.config.wikiTiddlersSubDir);
    }
	}
  // Load any parent wikis
  if(wikiInfo.includeWikis) {
    $tw.Bob.logger.log('Load Wiki: includeWikis!', {level:1});
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
  }
  // Load any plugins, themes and languages listed in the wiki info file
  loadPlugins(wikiInfo.plugins,$tw.config.pluginsPath,$tw.config.pluginsEnvVar, options.prefix);
  loadPlugins(wikiInfo.themes,$tw.config.themesPath,$tw.config.themesEnvVar, options.prefix);
  loadPlugins(wikiInfo.languages,$tw.config.languagesPath,$tw.config.languagesEnvVar, options.prefix);
  // Load the wiki files, registering them as writable
  const resolvedWikiPath = path.resolve(wikiPath,$tw.config.wikiTiddlersSubDir);
  const exlcudePlugins = ['$:/plugins/tiddlywiki/tiddlyweb', '$:/plugins/tiddlywiki/filesystem'];
  function getTheseTiddlers() {
    let out = [];
    try {
      out = $tw.loadTiddlersFromPath(resolvedWikiPath);
    } catch(e) {
      $tw.Bob.logger.error("loadWikiTiddlers Error: ", e, {level:1});
    }
    return out;
  }
  $tw.utils.each(
    getTheseTiddlers(), function(tiddlerFile) {
      let use = true;
      if(!options.readOnly && tiddlerFile.filepath) {
        $tw.utils.each(tiddlerFile.tiddlers,function(tiddler) {
          if(exlcudePlugins.indexOf(tiddler.title) !== -1) {
            use = false;
          } else {
            $tw.Bob.Files[options.prefix][tiddler.title] ={
              filepath: tiddlerFile.filepath,
              type: tiddlerFile.type,
              hasMetaFile: tiddlerFile.hasMetaFile,
              isEditableFile: config["retain-original-tiddler-path"] || tiddlerFile.isEditableFile || tiddlerFile.filepath.indexOf($tw.Bob.Wikis[options.prefix].wikiTiddlersPath) !== 0
            };
          }
        });
      }
      if(!use) {
        //Walk the tiddler stack backwards, and splice out the unwanted plugins
        for (i = tiddlerFile.tiddlers - 1; i >= 0; --i) {
          if(exlcudePlugins.indexOf(tiddlerFile.tiddlers[i].title) !== -1) {
            tiddlerFile.tiddlers.splice(i, 1); //Remove the excluded plugin
          }
        }
      }
      $tw.Bob.Wikis[options.prefix].wiki.addTiddlers(tiddlerFile.tiddlers);
    }
  );
  if ($tw.Bob.Wikis[options.prefix].wikiPath == wikiPath) {
		// Save the original tiddler file locations if requested
		var output = {}, relativePath, fileInfo;
		for(let title in $tw.Bob.Files[options.prefix]) {
			fileInfo =  $tw.Bob.Files[options.prefix][title];
			if(fileInfo.isEditableFile) {
				relativePath = path.relative($tw.Bob.Wikis[options.prefix].wikiTiddlersPath,fileInfo.filepath);
				output[title] =
					path.sep === "/" ?
					relativePath :
					relativePath.split(path.sep).join("/");
			}
		}
		if(Object.keys(output).length > 0){
			$tw.Bob.Wikis[options.prefix].iki.addTiddler({title: "$:/config/OriginalTiddlerPaths", type: "application/json", text: JSON.stringify(output)});
		}
	}
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
      $tw.Bob.logger.error('Error loading wiki plugin folder: ', e, {level:2});
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
      $tw.Bob.logger.error('Error loading wiki theme folder: ', e, {level:2});
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
      $tw.Bob.logger.error('Error loading wiki language folder: ', e, {level:2});
    }
  }
  return wikiInfo;
};

ServerSide.prepareWiki = function (fullName, servePlugin, cache='yes') {
  // Only rebuild the wiki if there have been changes since the last time it
  // was built, otherwise use the cached version.
  if(typeof $tw.Bob.Wikis[fullName].modified === 'undefined' || $tw.Bob.Wikis[fullName].modified === true || typeof $tw.Bob.Wikis[fullName].cached !== 'string') {
    $tw.Bob.Wikis[fullName].plugins = $tw.Bob.Wikis[fullName].plugins || [];
    $tw.Bob.Wikis[fullName].themes = $tw.Bob.Wikis[fullName].themes || [];
    $tw.Bob.Wikis[fullName].tiddlers = $tw.Bob.Wikis[fullName].tiddlers || [];
    if(servePlugin !== 'no') {
      // By default the normal file system plugins removed and the
      // multi-user plugin added instead so that they all work the same.
      // The wikis aren't actually modified, this is just hov they are
      // served.
      $tw.Bob.Wikis[fullName].plugins = $tw.Bob.Wikis[fullName].plugins.filter(function(plugin) {
        return plugin !== 'tiddlywiki/filesystem' && plugin !== 'tiddlywiki/tiddlyweb';
      });
      if($tw.Bob.Wikis[fullName].plugins.indexOf('$:/plugins/OokTech/Bob') === -1) {
        $tw.Bob.Wikis[fullName].plugins.push('$:/plugins/OokTech/Bob');
      }
    }
    $tw.settings.includePluginList = $tw.settings.includePluginList || [];
    $tw.settings.excludePluginList = $tw.settings.excludePluginList || [];
    // Add any plugins that should be included in every wiki
    const includeList = Object.values($tw.settings.includePluginList).filter(function(plugin) {
      return $tw.Bob.Wikis[fullName].plugins.indexOf(plugin) === -1;
    }).map(function(pluginName) {return '$:/plugins/'+pluginName;})
    $tw.Bob.Wikis[fullName].plugins = $tw.Bob.Wikis[fullName].plugins.concat(includeList);
    // Remove any plugins in the excluded list
    // The exclude list takes precidence over the include list
    $tw.Bob.Wikis[fullName].plugins = $tw.Bob.Wikis[fullName].plugins.filter(function(plugin) {
      return Object.values($tw.settings.excludePluginList).indexOf(plugin) === -1;
    })
    // Make sure that all the plugins are actually loaded.
    const missingPlugins = $tw.Bob.Wikis[fullName].plugins.filter(function(plugin) {
      return !$tw.Bob.Wikis[fullName].wiki.tiddlerExists(plugin);
    }).map(function(pluginTiddler) {
      return pluginTiddler.replace(/^\$:\/plugins\//, '')
    });
    if(missingPlugins.length > 0) {
      loadPlugins(missingPlugins,$tw.config.pluginsPath,$tw.config.pluginsEnvVar, fullName);
    }
    // This makes the wikiTiddlers variable a filter that lists all the
    // tiddlers for this wiki.
    const wikiName = fullName;
    const options = {
      variables: {
        wikiTiddlers:
          $tw.Bob.Wikis[fullName].wiki.allTitles().concat($tw.Bob.Wikis[fullName].plugins.concat($tw.Bob.Wikis[fullName].themes)).map(function(tidInfo) {
            if(servePlugin === 'no' && tidInfo === '$:/plugins/OokTech/Bob') {
              return '';
            } else {
              return '[[' + tidInfo + ']]';
            }
          }).join(' '),
        wikiName: wikiName
      }
    };
    $tw.Bob.Wikis[fullName].wiki.addTiddler(new $tw.Tiddler({title: '$:/WikiName', text: fullName}))
    const text = $tw.Bob.Wikis[fullName].wiki.renderTiddler("text/plain", $tw.settings['ws-server'].rootTiddler || "$:/core/save/all", options);
    // Only cache the wiki if it isn't too big.
    if(text.length < 10*1024*1024 && cache !== 'no') {
      $tw.Bob.Wikis[fullName].cached = text;
      $tw.Bob.Wikis[fullName].modified = false;
    } else {
      return text;
    }
  }
  return $tw.Bob.Wikis[fullName].cached;
}

/*
plugins: Array of names of plugins (eg, "tiddlywiki/filesystemadaptor")
libraryPath: Path of library folder for these plugins (relative to core path)
envVar: Environment variable name for these plugins
*/
function loadPlugins(plugins,libraryPath,envVar, wikiName) {
  if(plugins) {
    const pluginPaths = $tw.getLibraryItemSearchPaths(libraryPath,envVar);
    for(let t=0; t<plugins.length; t++) {
      if(plugins[t] !== 'tiddlywiki/filesystem' && plugins[t] !== 'tiddlywiki/tiddlyweb') {
        loadPlugin(plugins[t],pluginPaths, wikiName);
      }
    }
  }
};

/*
name: Name of the plugin to load
paths: array of file paths to search for it
*/
function loadPlugin(name,paths, wikiName) {
  const pluginPath = $tw.findLibraryItem(name,paths);
  if(pluginPath) {
    const pluginFields = $tw.loadPluginFolder(pluginPath);
    if(pluginFields) {
      $tw.Bob.Wikis[wikiName].wiki.addTiddler(pluginFields);
      return;
    }
  } else {
    $tw.Bob.logger.error("Warning for wikiName '" + wikiName + "': Cannot find path to plugin '" + name + "'");
  }
};

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
ServerSide.specialCopy = function(source, destination, copyChildren, cb) {
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
          ServerSide.specialCopy(path.join(source, item), path.join(destination, item), copyChildren);
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
  This sends an alert to the connected browser(s)

  Who alerts are sent to can be filtered by:
  - wiki: only browsers that are viewing the listed wiki(s) receive the alert.
  - authentication level: only people who are logged in with one of the listed
      authentication levels gets the alerm.
  - specific connections: only the browser(s) using the listed connection(s)
      get the alert.

  or the alert can be sent to all connected browsers.

  {
    authentications: [authenticationLevel],
    wikis: [wikiName],
    connections: [connectionIndex],
    alert: alertMessage
  }

  wikis - an array of wiki names to send the alert to
  connections - an array of connection indicies to send the alert to
  alert - the text of the alert to send

  The authentications, wikis and connections can be combined so only people
  who meet all the listed criteria get the alert.

  NOTE: we don't have a good way to do these next ones for now, but we need to
  in the future.
  authentications - an array of authentication levels to receive the alert
  access - an array of wikis and access levels (like can view the wiki in
  question, or edit it)

  We can turn off browser messages
*/
ServerSide.sendBrowserAlert = function(input) {
  if($tw.settings.disableBrowserAlerts !== 'yes') {
    const message = {
      type:'browserAlert',
      alert: input.alert
    }
    input.wikis = input.wikis || [];
    input.connections = input.connections || [];
    input.authentications = input.authentications || [];
    input.alert = input.alert || '';
    if(input.alert.length > 0) {
      let wikisList = false;
      let connectionsList = false;
      let authenticationsList = false;
      if(input.connections.length > 0) {
        connectionsList = [];
        $tw.connections.forEach(function(connection) {
          if(input.connections.indexOf(connection.index) !== -1) {
            connectionsList.push(connection.index);
          }
        });
      }
      if(input.wikis.length > 0) {
        wikisList = [];
        $tw.connections.forEach(function(connection) {
          if(input.wikis.indexOf(connection.wiki) !== -1) {
            wikisList.push(connection.index);
          }
        })
      }
      if(input.authentications.length > 0) {
        // Nothing here yet
      }
      // Get the intersection of all of the things listed above to get the
      // connections to send this to.
      wikisListThing = wikisList || []
      connectionsListThing = connectionsList || []
      authenticationsListThing = authenticationsList || []
      if(wikisListThing.length > 0 || connectionsListThing.length > 0 || authenticationsListThing.length > 0) {
        let intersection = new Set([...connectionsListThing, ...wikisListThing, ...authenticationsListThing]);
        if(wikisList) {
          const wikiSet = new Set(wikisList);
          intersection = new Set([...intersection].filter(x => wikiSet.has(x)));
        }
        if(connectionsList) {
          const connectionsSet = new Set(connectionsList);
          intersection = new Set([...intersection].filter(x => connectionsSet.has(x)));
        }
        if(authenticationsList) {
          const authenticationsSet = new Set(authenticationsList);
          intersection = new Set([...intersection].filter(x => authenticationsSet.has(x)));
        }
        intersection.forEach(function(index) {
          message.wiki = $tw.connections.wiki
          $tw.Bob.SendToBrowser($tw.connections[index], message);
        });
      } else {
        $tw.Bob.logger.log('send message to all browsers', {level: 4})
        $tw.Bob.SendToBrowsers(message);
      }
    }
  }
}

ServerSide.getViewableWikiList = function (data) {
  data = data || {};
  function getList(obj, prefix) {
    let output = [];
    let ownedWikis = {};
    // data.decoded.name
    Object.keys(obj).forEach(function(item) {
      if(typeof obj[item] === 'string') {
        if($tw.ServerSide.existsListed(prefix+item)) {
          if(item == '__path') {
            if(prefix.endsWith('/')) {
              output.push(prefix.slice(0,-1));
            } else {
              output.push(prefix);
            }
          } else {
            output.push(prefix+item);
          }
        }
      } else if(typeof obj[item] === 'object' && item !== '__permissions') {
        output = output.concat(getList(obj[item], prefix + item + '/'));
      }
    })
    return output;
  }
  // Get the wiki list of wiki names from the settings object
  const wikiList = getList($tw.settings.wikis, '');
  const viewableWikis = [];
  wikiList.forEach(function(wikiName) {
    if($tw.Bob.AccessCheck(wikiName, {"decoded": data.decoded}, 'view', 'wiki')) {
      viewableWikis.push(wikiName);
    }
  });
  const tempObj = {};
  for (let i = 0; i < viewableWikis.length; i++) {
    tempObj[viewableWikis[i]] = ['view']
    // Check if you can edit it
    if($tw.Bob.AccessCheck(viewableWikis[i], {"decoded": data.decoded}, 'edit', 'wiki')) {
      tempObj[viewableWikis[i]].push('edit');
    }
    // Check if you are the owner
  }
  return viewableWikis;
}

ServerSide.getViewablePluginsList = function (data) {
  data = data || {};
  const viewablePlugins = [];
  const pluginList = $tw.utils.getPluginInfo();
  if($tw.settings.pluginLibrary.allPublic === 'yes') {
    return pluginList;
  }
  Object.keys(pluginList).forEach(function(pluginName) {
    if($tw.Bob.AccessCheck(pluginName, {"decoded": data.decoded}, 'view', 'plugin')) {
      viewablePlugins[pluginName] = pluginList[pluginName];
    }
  })
  return viewablePlugins;
}

ServerSide.getViewableThemesList = function (data) {
  data = data || {};
  const viewableThemes = [];
  const themeList = $tw.utils.getThemeInfo();
  if($tw.settings.themeLibrary.allPublic === 'yes') {
    return themeList;
  }
  Object.keys(themeList).forEach(function(themeName) {
    if($tw.Bob.AccessCheck(themeName, {"decoded": data.decoded}, 'view', 'theme')) {
      viewableThemes[themeName] = themeList[themeName];
    }
  })
  return viewableThemes;
}

ServerSide.getViewableEditionsList = function (data) {
  // This may not be needed anymore
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
  data = data || {};
  const viewableEditions = {};
  const editionList =  $tw.utils.getEditionInfo();
  if($tw.settings.editionLibrary.allPublic === 'yes') {
    return editionList;
  }
  Object.keys(editionList).forEach(function(editionName) {
    if($tw.Bob.AccessCheck(editionName, {"decoded": data.decoded}, 'view', 'edition')) {
      Object.keys(editionList).forEach(function(index) {
        viewableEditions[index] = editionList[index].description;
      });
    }
  })
  return viewableEditions;
}

ServerSide.getViewableLanguagesList = function (data) {
  data = data || {};
  const viewableLanguages = {};
  const languageList =  $tw.utils.getEditionInfo();
  Object.keys(languageList).forEach(function(languageName) {
    if($tw.Bob.AccessCheck(languageName, {"decoded": data.decoded}, 'view', 'edition')) {
      Object.keys(languageList).forEach(function(index) {
        viewableLanguages[index] = languageList[index].description;
      });
    }
  })
  return viewableLanguages;
}

ServerSide.getViewableSettings = function(data) {
  const tempSettings = {};
  // section visible to anyone
  // Nothing that uses websocket stuff here because they only work when logged
  // in
  tempSettings.API = $tw.settings.API;
  // Federation stuff is visible because you don't have to login to want to see
  // if federation is possible with a server
  tempSettings.federation = $tw.settings.federation;
  tempSettings.enableFederation = $tw.settings.enableFederation;

  tempSettings.includePluginList = $tw.settings.includePluginList;
  tempSettings.excludePluginList = $tw.settings.excludePluginList;
  // Section visible by logged in people
  if(data.decoded) {
    tempSettings.backups = $tw.settings.backups;
    tempSettings.disableBrowserAlerts = $tw.settings.disableBrowserAlerts;
    tempSettings.saveMediaOnServer = $tw.settings.saveMediaOnServer;
    tempSettings.perWikiFiles = $tw.settings.perWikiFiles;
    tempSettings.persistentUsernames = $tw.settings.persistentUsernames;
    tempSettings.namespacedWikis = $tw.settings.namespacedWikis;
    tempSettings.mimeMap = $tw.settings.mimeMap;
    tempSettings.heartbeat = $tw.settings.heartbeat;
  }
  // advanced section only visible to admins
  if((data.decoded && data.decoded.level === 'Admin') || data.decoded === true) {
    tempSettings.advanced = $tw.settings.advanced;
    tempSettings['ws-server'] = $tw.settings['ws-server'];
    tempSettings.suppressBrowser = $tw.settings.suppressBrowser;
    tempSettings.disableFileWatchers = $tw.settings.disableFileWatchers;
    tempSettings.filePathRoot = $tw.settings.filePathRoot;
    tempSettings.editionsPath = $tw.settings.editionsPath;
    tempSettings.languagesPath = $tw.settings.languagesPath;
    tempSettings.pluginsPath = $tw.settings.pluginsPath;
    tempSettings.themesPath = $tw.settings.themesPath;
    tempSettings.wikiPathBase = $tw.settings.wikiPathBase;
    tempSettings.wikisPath = $tw.settings.wikisPath;
    tempSettings.scripts = $tw.settings.scripts;
    tempSettings.serverInfo = $tw.settings.serverInfo;
    tempSettings.saver = $tw.settings.saver;
    tempSettings.logger = $tw.settings.logger;
    tempSettings.enableBobSaver = $tw.settings.enableBobSaver;
    tempSettings['fed-wss'] = $tw.settings['fed-wss'];
  }
  tempSettings.advanced = tempSettings.avanced || {};
  tempSettings['ws-server'] = tempSettings['ws-server'] || {};
  tempSettings['fed-wss'] = tempSettings['fed-wss'] || {};

  return tempSettings;
}

ServerSide.getProfileInfo = function(data) {
  $tw.settings.profiles = $tw.settings.profiles || {};
  if ($tw.Bob.AccessCheck(data.profileName, {"decoded": data.decoded}, 'view', 'profile')) {
    return $tw.settings.profiles[data.profileName];
  } else {
    return {};
  }
}

ServerSide.listProfiles = function(data) {
  $tw.settings.profiles = $tw.settings.profiles || {};
  const result = {};
  Object.keys($tw.settings.profiles).forEach(function(profileName) {
    if ($tw.Bob.AccessCheck(data.profileName, {"decoded": data.decoded}, 'view', 'profile')) {
      result[profileName] = $tw.settings.profiles[data.profileName]
    }
  })
  return result;
}

ServerSide.getOwnedWikis = function(data) {
  function getList(obj, prefix) {
    let output = [];
    // data.decoded.name
    Object.keys(obj).forEach(function(item) {
      if(typeof obj[item] === 'string') {
        if($tw.ServerSide.existsListed(prefix+item)) {
          if(item == '__path') {
            if(prefix.endsWith('/')) {
              output.push(prefix.slice(0,-1));
            } else {
              output.push(prefix);
            }
          } else {
            output.push(prefix+item);
          }
        }
      } else if(typeof obj[item] === 'object' && item !== '__permissions') {
        output = output.concat(getList(obj[item], prefix + item + '/'));
      }
    })
    return output;
  }
  function wikiInfo(wikiName) {
    let thisObj = $tw.settings.wikis;
    wikiName.split('/').forEach(function(part) {
      thisObj = thisObj[part];
    })
    return thisObj.__permissions;
  }
  // Get the list of wiki names from the settings object
  const wikiList = getList($tw.settings.wikis, '');
  const ownedWikis = {};
  wikiList.forEach(function(wikiName) {
    if($tw.Bob.AccessCheck(wikiName, {"decoded": data.decoded}, 'owner', 'wiki')) {
      ownedWikis[wikiName] = wikiInfo(wikiName);
    }
  });
  return ownedWikis;
}

ServerSide.findName = function(url) {
  url = url.startsWith('/') ? url.slice(1,url.length) : url;
  const pieces = url.split('/')
  let name = ''
  let settingsObj = $tw.settings.wikis[pieces[0]]
  if(settingsObj) {
    name = pieces[0]
  }
  for (let i = 1; i < pieces.length; i++) {
    if(settingsObj) {
      if(typeof settingsObj[pieces[i]] === 'object') {
        name = name + '/' + pieces[i]
        settingsObj = settingsObj[pieces[i]]
      } else if(typeof settingsObj[pieces[i]] === 'string') {
        name = name + '/' + pieces[i]
        break
      } else {
        break
      }
    }
  }
  if(name === '' && pieces[0] === 'RootWiki') {
    name = 'RootWiki'
  }
  return name
}

ServerSide.listFiles = function(data, cb) {
  const path = require('path');
  const fs = require('fs');
  const authorised = $tw.Bob.AccessCheck(data.wiki, {"decoded":data.decoded}, 'listFiles', 'wiki');

  if(authorised) {
    $tw.settings.fileURLPrefix = $tw.settings.fileURLPrefix || 'files';
    data.folder = data.folder || $tw.settings.fileURLPrefix;
    data.folder = data.folder.startsWith('/') ? data.folder : '/' + data.folder;
    const wikiName = data.wiki || $tw.ServerSide.findName(data.folder);
    const repRegex = new RegExp(`^\/?.+?\/?${$tw.settings.fileURLPrefix}\/?`)
    const thePath = data.folder.replace(repRegex, '').replace(/^\/*/,'');
    let fileFolder
    if(thePath === '' && wikiName === '') {
      // Globally available files in filePathRoot
      const filePathRoot = $tw.ServerSide.getFilePathRoot();
      fileFolder = path.resolve($tw.ServerSide.getBasePath(), filePathRoot);
      // send to browser
      next(fileFolder, '');
    } else if(wikiName === '' && $tw.settings.servingFiles[thePath]) {
      // Explicitly listed folders that are globally available
      fileFolder = $tw.settings.servingFiles[thePath];
      // send to browser
      next(fileFolder, thePath);
    } else if(wikiName !== '') {
      // Wiki specific files, need to check to make sure that if perwikiFiles is set this only works from the target wiki.
      if($tw.settings.perWikiFiles !== 'yes' || wikiName === data.wiki) {
        const wikiPath = $tw.ServerSide.existsListed(wikiName);
        if(!wikiPath) {
          return;
        }
        fileFolder = path.join(wikiPath, 'files');
        next(fileFolder, thePath, wikiName);
      }
    } else {
      const testPaths = [path.resolve($tw.ServerSide.getBasePath())].concat( Object.values($tw.settings.servingFiles));
      let ind = 0
      nextTest(0, testPaths)
      function nextTest(index, pathsToTest) {
        // If the path isn't listed in the servingFiles thing check if it is a child of one of the paths, or of the filePathRoot
        const filePathRoot = $tw.ServerSide.getFilePathRoot();
        let test = path.resolve($tw.ServerSide.getBasePath(), filePathRoot, pathsToTest[index]);
        fs.access(test, fs.constants.F_OK, function(err) {
          if(err) {
            if(index < pathToTest.length - 1) {
              nextTest(index + 1, pathsToTest);
            }
          } else {
            // send the list to the browser
            next(test, pathsToTest[index]);
          }
        })
      }
    }
    function next(folder, urlPath, wikiName) {
      wikiName = wikiName || '';
      // if the folder listed in data.folder is either a child of the filePathRoot or if it is a child of one of the folders listed in the $tw.settings.servingFiles thing we will continue, otherwise end.
      const filePathRoot = $tw.ServerSide.getFilePathRoot();
      const usedPaths = Object.values($tw.settings.servingFiles).map(function(item) {
          return path.resolve($tw.ServerSide.getBasePath(), filePathRoot, item)
        });
      const resolvedPath = path.resolve($tw.ServerSide.getBasePath(), filePathRoot, folder);
      let match = false;
      if(authorised) {
        const mimeMap = $tw.settings.mimeMap || {
          '.aac': 'audio/aac',
          '.avi': 'video/x-msvideo',
          '.csv': 'text/csv',
          '.doc': 'application/msword',
          '.epub': 'application/epub+zip',
          '.gif': 'image/gif',
          '.html': 'text/html',
          '.htm': 'text/html',
          '.ico': 'image/x-icon',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.mp3': 'audio/mpeg',
          '.mpeg': 'video/mpeg',
          '.oga': 'audio/ogg',
          '.ogv': 'video/ogg',
          '.ogx': 'application/ogg',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.weba': 'audio/weba',
          '.webm': 'video/webm',
          '.wav': 'audio/wav'
        };
        const extList = data.mediaTypes || false;
        let prefix = path.join(wikiName, $tw.settings.fileURLPrefix, urlPath);
        prefix = prefix.startsWith('/') ? prefix : '/' + prefix;
        prefix = prefix.endsWith('/') ? prefix : prefix + '/';
        fs.readdir(resolvedPath, function(err, items) {
          if(err || !items) {
            $tw.Bob.logger.error("Can't read files folder ", resolvedPath, " with error ", err, {level: 1});
            cb(prefix, [], urlPath);
          } else {
            // filter the list to only include listed mimetypes.
            let filteredItems = items.filter(function(item) {
              const splitItem = item.split('.');
              const ext = splitItem[splitItem.length-1];
              return typeof mimeMap['.' + ext] === 'string';
            })
            if(extList) {
              filteredItems = filteredItems.filter(function(item) {
                const splitItem = item.split('.');
                const ext = splitItem[splitItem.length-1];
                return typeof extList.indexOf('.' + ext) !== -1;
              })
            }
            // Reply with the list
            $tw.Bob.logger.log("Scanned ", resolvedPath, " for files, returned ", filteredItems, {level: 3});
            cb(prefix, filteredItems, urlPath);
          }
        });
      }
    }
  } else {
    cb("", [], "");
  }
}

function deleteDirectory(dir) {
  const fs = require('fs');
  const path = require('path');
  return new Promise(function (resolve, reject) {
    // Check to make sure that dir is in the place we expect
    if(dir.startsWith($tw.ServerSide.getBasePath())) {
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

function deleteFile(dir, file) {
  const fs = require('fs');
  const path = require('path');
  return new Promise(function (resolve, reject) {
    //Check to make sure that dir is in the place we expect
    if(dir.startsWith($tw.ServerSide.getBasePath())) {
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

ServerSide.deleteWiki = function(data, cb) {
  const path = require('path')
  const fs = require('fs')
  const authorised = $tw.Bob.AccessCheck(data.deleteWiki, {"decoded":data.decoded}, 'delete', 'wiki');
  // Make sure that the wiki exists and is listed
  if($tw.ServerSide.existsListed(data.deleteWiki) && authorised) {
    $tw.stopFileWatchers(data.deleteWiki)
    const wikiPath = $tw.ServerSide.getWikiPath(data.deleteWiki);
    if(data.deleteChildren === 'yes') {
      deleteDirectory(wikiPath).then(function() {
        cb();
      }).catch(function(e) {
        cb(e);
      }).finally(function() {
        ServerSide.updateWikiListing();
      })
    } else {
      // Delete the tiddlywiki.info file
      fs.unlink(path.join(wikiPath, 'tiddlywiki.info'), function(e) {
        if(e) {
          $tw.Bob.logger.error('failed to delete tiddlywiki.info',e, {level:1});
          cb(e);
          ServerSide.updateWikiListing();
        } else {
          // Delete the tiddlers folder (if any)
          deleteDirectory(path.join(wikiPath, 'tiddlers')).then(function() {
            $tw.utils.deleteEmptyDirs(wikiPath,function() {
              cb();
            });
          }).catch(function(e){
            cb(e);
          }).finally(function() {
            ServerSide.updateWikiListing();
          })
        }
      })
    }
  }
}

/*
  This updates the server wiki listing, it is just the server task that checks
  to see if there are any unlisted wikis and that the currently listed wikis
  edist, so it doesn't need any authentication.

  This function checks to make sure all listed wikis exist and that all wikis
  it can find are listed.
  Then it saves the settings file to reflect the changes.
*/
ServerSide.updateWikiListing = function(data) {
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
          if($tw.ServerSide.wikiExists(fullName)) {
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
  const basePath = $tw.ServerSide.getBasePath();
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
    return !$tw.ServerSide.wikiExists(folder);
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
    $tw.nodeMessageHandlers.saveSettings(data);
    $tw.nodeMessageHandlers.updateRoutes(data);
  }
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

ServerSide.renameWiki = function(data, cb) {
  const path = require('path')
  const fs = require('fs')
  const authorised = $tw.Bob.AccessCheck(data.fromWiki, {"decoded":data.decoded}, 'rename', 'wiki');
  if($tw.ServerSide.existsListed(data.oldWiki) && !$tw.ServerSide.existsListed(data.newWiki) && authorised) {
    // Unload the old wiki
    $tw.nodeMessageHandlers.unloadWiki({wikiName: data.oldWiki});
    const basePath = $tw.ServerSide.getBasePath();
    const oldWikiPath = $tw.ServerSide.getWikiPath(data.oldWiki);
    const newWikiPath = path.resolve(basePath, $tw.settings.wikisPath, data.newWiki);
    fs.rename(oldWikiPath, newWikiPath, function(e) {
      if(e) {
        $tw.Bob.logger.log('failed to rename wiki',e,{level:1});
        cb(e);
      } else {
        // Refresh wiki listing
        data.update = 'true';
        data.saveSettings = 'true';
        $tw.ServerSide.updateWikiListing(data);
        cb();
      }
    })
  }
}


/*
  This ensures that the wikiName used is unique by appending a number to the
  end of the name and incrementing the number if needed until an unused name
  is created.
  If no name is given it defualts to NewWiki
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

ServerSide.createWiki = function(data, cb) {
  const authorised = $tw.Bob.AccessCheck('create/wiki', {"decoded": data.decoded}, 'create/wiki', 'server');
  if(authorised) {
    const fs = require("fs"),
      path = require("path");
    let name = GetWikiName(data.wikiName || data.newWiki);

    if(data.nodeWikiPath) {
      // This is just adding an existing node wiki to the listing
      addListing(name, data.nodeWikiPath);
      data.fromServer = true;
      $tw.nodeMessageHandlers.saveSettings(data);
    } else if(data.tiddlers || data.externalTiddlers) {
      // Create a wiki using tiddlers sent from the browser, this is what is
      // used to create wikis from existing html files.
    } else if(data.fromWiki) {
      // Duplicate a wiki
      // Make sure that the wiki to duplicate exists and that the target wiki
      // name isn't in use
      if($tw.ServerSide.existsListed(data.fromWiki)) {
        const wikiName = name;//GetWikiName(data.newWiki);
        // Get the paths for the source and destination
        $tw.settings.wikisPath = $tw.settings.wikisPath || './Wikis';
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
          $tw.Bob.logger.log('Duplicated wiki', data.fromWiki, 'as', wikiName, {level: 2})
          cb();
        });
      }
    } else {
      // Paths are relative to the root wiki path
      $tw.settings.wikisPath = $tw.settings.wikisPath || './Wikis';
      data.wikisFolder = data.wikisFolder || $tw.settings.wikisPath;
      // If no basepath is given than the default is to place the folder in the
      // default wikis folder
      const basePath = data.basePath || $tw.ServerSide.getBasePath();
      // This is the path given by the person making the wiki, it needs to be
      // relative to the basePath
      // data.wikisFolder is an optional sub-folder to use. If it is set to
      // Wikis than wikis created will be in the basepath/Wikis/relativePath
      // folder I need better names here.
      $tw.utils.createDirectory(path.join(basePath, data.wikisFolder));
      // This only does something for the secure wiki server
      if($tw.settings.namespacedWikis === 'yes') {
        data.decoded = data.decoded || {};
        data.decoded.name = data.decoded.name || 'imaginaryPerson';
        name = data.decoded.name + '/' + (data.wikiName || data.newWiki);
        name = GetWikiName(name);
        relativePath = name;
        $tw.utils.createDirectory(path.join(basePath, data.decoded.name));
      }
      const fullPath = path.join(basePath, data.wikisFolder, name)
      // For now we only support creating wikis with one edition, multi edition
      // things like in the normal init command can come later.
      const editionName = data.edition?data.edition:"empty";
      const searchPaths = $tw.getLibraryItemSearchPaths($tw.config.editionsPath,$tw.config.editionsEnvVar);
      let editionPath = $tw.findLibraryItem(editionName,searchPaths);
      if(!fs.existsSync(editionPath) && false) {
        editionPath = undefined
        editionPath = path.resolve(__dirname, "./editions", "./" + editionName);
        if(fs.existsSync(editionPath)) {
          try {
            $tw.ServerSide.specialCopy(editionPath, fullPath);
            $tw.Bob.logger.log("Copied edition '" + editionName + "' to " + fullPath + "\n", {level:2});
          } catch (e) {
            $tw.Bob.logger.error('error copying edition ', editionName, e, {level:1});
          }
        } else {
          $tw.Bob.logger.error("Edition not found ", editionName, {level:1});
        }
      } else {
        // Copy the edition content
        const err = $tw.ServerSide.specialCopy(editionPath, fullPath, true);
        if(!err) {
          $tw.Bob.logger.log("Copied edition '" + editionName + "' to " + fullPath + "\n", {level:2});
        } else {
          $tw.Bob.logger.error(err, {level:1});
        }
      }
      // Tweak the tiddlywiki.info to remove any included wikis
      const packagePath = path.join(fullPath, "tiddlywiki.info");
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

      // This is here as a hook for an external server. It is defined by the
      // external server and shouldn't be defined here or it will break
      // If you are not using an external server than this does nothing
      if($tw.ExternalServer) {
        if(typeof $tw.ExternalServer.initialiseWikiSettings === 'function') {
          const relativePath = path.relative(path.join(basePath, data.wikisFolder),fullPath);
          $tw.ExternalServer.initialiseWikiSettings(relativePath, data);
        }
      }
    }

    setTimeout(function() {
      data.update = 'true';
      data.saveSettings = 'true';
      $tw.ServerSide.updateWikiListing(data);
      if(typeof cb === 'function') {
        setTimeout(cb, 1500);
      }
    }, 1000);
  }
}

module.exports = ServerSide

})();
