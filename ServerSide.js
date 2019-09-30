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

if(!Object.entries) {
  Object.entries = function entries(O) {
    return reduce(keys(O), (e, k) => concat(e, typeof k === 'string' && isEnumerable(O, k) ? [[k, O[k]]] : []), []);
  };
}
// END POLYFILL

// Make sure that $tw.settings is available.
const settings = require('$:/plugins/OokTech/NodeSettings/NodeSettings.js')

$tw.Bob = $tw.Bob || {};
$tw.Bob.Files = $tw.Bob.Files || {};

ServerSide.getBasePath = function() {
  let basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
  $tw.settings.wikiPathBase = $tw.settings.wikiPathBase || basePath;
  if($tw.settings.wikiPathBase === 'homedir') {
    basePath = os.homedir();
  } else if($tw.settings.wikiPathBase === 'cwd' || !$tw.settings.wikiPathBase) {
    basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
  } else {
    basePath = path.resolve($tw.settings.wikiPathBase);
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
ServerSide.loadWiki = function (wikiName) {
  const wikiFolder = ServerSide.existsListed(wikiName);
  /*
  // A hacky way to make the root wiki work on termux
  // This shouldn't be required anymore
  if(wikiName === 'RootWiki') {
    wikiFolder = path.resolve($tw.boot.wikiPath);
  }
  */
  // Add tiddlers to the node process
  if(wikiFolder) {
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

      // Watch the root tiddlers folder for chanegs
      $tw.Bob.WatchAllFolders($tw.Bob.Wikis[wikiName].FolderTree, wikiName);

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
      loadPlugins(wikiInfo.plugins,$tw.config.pluginsPath,$tw.config.pluginsEnvVar, wikiName);
      loadPlugins(wikiInfo.themes,$tw.config.themesPath,$tw.config.themesEnvVar, wikiName);
      loadPlugins(wikiInfo.languages,$tw.config.languagesPath,$tw.config.languagesEnvVar, wikiName);
      // Get the list of tiddlers for this wiki
      $tw.Bob.Wikis[wikiName].tiddlers = $tw.Bob.Wikis[wikiName].wiki.allTitles();
      $tw.Bob.Wikis[wikiName].plugins = wikiInfo.plugins.map(function(name) {
        return '$:/plugins/' + name;
      });
      $tw.Bob.Wikis[wikiName].themes = wikiInfo.themes.map(function(name) {
        return '$:/themes/' + name;
      });
    }
    const fields = {
      title: '$:/WikiName',
      text: wikiName
    };
    $tw.Bob.Wikis[wikiName].wiki.addTiddler(new $tw.Tiddler(fields));
    if($tw.settings['ws-server'].proxyprefix) {
      const wikiPathFields = {
        title: '$:/ProxyPrefix',
        text: $tw.settings['ws-server'].pathprefix
      };
      $tw.Bob.Wikis[wikiName].wiki.addTiddler(new $tw.Tiddler(wikiPathFields));
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
  loadPlugins(wikiInfo.plugins,$tw.config.pluginsPath,$tw.config.pluginsEnvVar, options.prefix);
  loadPlugins(wikiInfo.themes,$tw.config.themesPath,$tw.config.themesEnvVar, options.prefix);
  loadPlugins(wikiInfo.languages,$tw.config.languagesPath,$tw.config.languagesEnvVar, options.prefix);
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

ServerSide.prepareWiki = function (fullName, servePlugin) {
  // Only rebuild the wiki if there have been changes since the last time it
  // was built, otherwise use the cached version.
  if(typeof $tw.Bob.Wikis[fullName].modified === 'undefined' || $tw.Bob.Wikis[fullName].modified === true || typeof $tw.Bob.Wikis[fullName].cached !== 'string') {
    $tw.Bob.Wikis[fullName].plugins = $tw.Bob.Wikis[fullName].plugins || [];
    $tw.Bob.Wikis[fullName].themes = $tw.Bob.Wikis[fullName].themes || [];
    $tw.Bob.Wikis[fullName].tiddlers = $tw.Bob.Wikis[fullName].tiddlers || [];
    if(servePlugin) {
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
            return '[[' + tidInfo + ']]';
          }).join(' '),
        wikiName: wikiName
      }
    };
    const text = $tw.Bob.Wikis[fullName].wiki.renderTiddler("text/plain", "$:/core/save/all", options);
    // Only cache the wiki if it isn't too big.
    if(text.length < 10*1024*1024) {
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
		}
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
    copyChildren = (copyChildren==='true')?true:false;
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
  if ($tw.settings.disableBrowserAlerts !== 'true') {
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
          $tw.Bob.SendToBrowser($tw.connections[index], message);
        });
      } else {
        $tw.Bob.SendToBrowsers(message);
      }
    }
  }
}

module.exports = ServerSide

})();
