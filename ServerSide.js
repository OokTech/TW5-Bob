/*\
title: $:/plugins/OokTech/Bob/ServerSide.js
type: application/javascript
module-type: library

This is server functions that can be shared between different server types

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */


var ServerSide = {}

var path = require('path')
var fs = require('fs')

// A polyfilL to make this work with older node installs


// START POLYFILL
const reduce = Function.bind.call(Function.call, Array.prototype.reduce);
const isEnumerable = Function.bind.call(Function.call, Object.prototype.propertyIsEnumerable);
const concat = Function.bind.call(Function.call, Array.prototype.concat);
const keys = Reflect.ownKeys;

if (!Object.values) {
  Object.values = function values(O) {
    return reduce(keys(O), (v, k) => concat(v, typeof k === 'string' && isEnumerable(O, k) ? [O[k]] : []), []);
  };
}

if (!Object.entries) {
  Object.entries = function entries(O) {
    return reduce(keys(O), (e, k) => concat(e, typeof k === 'string' && isEnumerable(O, k) ? [[k, O[k]]] : []), []);
  };
}
// END POLYFILL

// Make sure that $tw.settings is available.
var settings = require('$:/plugins/OokTech/NodeSettings/NodeSettings.js')

/*
  This function loads a wiki that has a route listed.
*/
ServerSide.loadWiki = function (wikiName, wikiFolder) {
  var listed = false;
  var exists = false;
  // First make sure that the wiki is listed
  if ((wikiName.indexOf('/') === -1 && $tw.settings.wikis[wikiName]) || wikiName === 'RootWiki') {
    listed = true;
  } else {
    var parts = wikiName.split('/');
    var obj = $tw.settings.wikis
    for (var i = 0; i < parts.length; i++) {
      if (obj[parts[i]]) {
        if (i === parts.length - 1) {
          listed = true;
        } else {
          obj = obj[parts[i]];
        }
      } else {
        listed = false;
        break;
      }
    }
  }
  // Make sure that the wiki actually exists
  if (wikiFolder) {
    var basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
    // Get the correct path to the tiddlywiki.info file
    var wikiFolder = path.resolve(basePath, wikiFolder);
    // Make sure it exists
    exists = fs.existsSync(path.resolve(wikiFolder, 'tiddlywiki.info'));
  }
  // Add tiddlers to the node process
  if (listed && exists) {
    $tw.Bob = $tw.Bob || {};
    $tw.Bob.Wikis = $tw.Bob.Wikis || {};
    $tw.Bob.Wikis[wikiName] = $tw.Bob.Wikis[wikiName] || {};
    // Make sure it isn't loaded already
    if ($tw.Bob.Wikis[wikiName].State !== 'loaded') {
      // If the wiki isn't loaded yet set the wiki as loaded
      $tw.Bob.Wikis[wikiName].State = 'loaded';
      // Save the wiki path and tiddlers path
      $tw.Bob.Wikis[wikiName].wikiPath = wikiFolder;
      $tw.Bob.Wikis[wikiName].wikiTiddlersPath = path.resolve(wikiFolder, 'tiddlers');
      // Make sure that the tiddlers folder exists
      createDirectory($tw.Bob.Wikis[wikiName].wikiTiddlersPath);

      // Recursively build the folder tree structure
      $tw.Bob.Wikis[wikiName].FolderTree = buildTree('.', $tw.Bob.Wikis[wikiName].wikiTiddlersPath, {});

      // Watch the root tiddlers folder for chanegs
      $tw.Bob.WatchAllFolders($tw.Bob.Wikis[wikiName].FolderTree, wikiName);

      // Add tiddlers to the node process
      var basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
      var fullPath = path.resolve(basePath, $tw.Bob.Wikis[wikiName].wikiPath);

      var wikiInfo = ServerSide.loadWikiTiddlers(fullPath, {prefix: wikiName});
      // Add plugins, themes and languages
      $tw.loadPlugins(wikiInfo.plugins,$tw.config.pluginsPath,$tw.config.pluginsEnvVar);
      $tw.loadPlugins(wikiInfo.themes,$tw.config.themesPath,$tw.config.themesEnvVar);
      $tw.loadPlugins(wikiInfo.languages,$tw.config.languagesPath,$tw.config.languagesEnvVar);
      // Get the list of tiddlers for this wiki
      $tw.Bob.Wikis[wikiName].tiddlers = $tw.wiki.allTitles().filter(function(title) {
        return title.startsWith('{' + wikiName + '}');
      });
      $tw.Bob.Wikis[wikiName].plugins = wikiInfo.plugins.map(function(name) {
        return '$:/plugins/' + name;
      });
      $tw.Bob.Wikis[wikiName].themes = wikiInfo.themes.map(function(name) {
        return '$:/themes/' + name;
      });
    }
  }
  return listed && exists;
}

/*
path: path of wiki directory
options:
  parentPaths: array of parent paths that we mustn't recurse into
  readOnly: true if the tiddler file paths should not be retained
*/
ServerSide.loadWikiTiddlers = function(wikiPath,options) {
  options = options || {};
  options.prefix = options.prefix || '';
  var parentPaths = options.parentPaths || [],
    wikiInfoPath = path.resolve(wikiPath,$tw.config.wikiInfo),
    wikiInfo,
    pluginFields;
  // Bail if we don't have a wiki info file
  if(fs.existsSync(wikiInfoPath)) {
    wikiInfo = JSON.parse(fs.readFileSync(wikiInfoPath,"utf8"));
  } else {
    return null;
  }
  // Load any parent wikis
  if(wikiInfo.includeWikis) {
    console.log('Bob error: includeWikis is not supported yet!')
    /*
    parentPaths = parentPaths.slice(0);
    parentPaths.push(wikiPath);
    $tw.utils.each(wikiInfo.includeWikis,function(info) {
      if(typeof info === "string") {
        info = {path: info};
      }
      var resolvedIncludedWikiPath = path.resolve(wikiPath,info.path);
      if(parentPaths.indexOf(resolvedIncludedWikiPath) === -1) {
        var subWikiInfo = $tw.Bob.loadWikiTiddlers(resolvedIncludedWikiPath,{
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
  $tw.loadPlugins(wikiInfo.plugins,$tw.config.pluginsPath,$tw.config.pluginsEnvVar);
  $tw.loadPlugins(wikiInfo.themes,$tw.config.themesPath,$tw.config.themesEnvVar);
  $tw.loadPlugins(wikiInfo.languages,$tw.config.languagesPath,$tw.config.languagesEnvVar);
  // Load the wiki files, registering them as writable
  var resolvedWikiPath = path.resolve(wikiPath,$tw.config.wikiTiddlersSubDir);
  $tw.utils.each($tw.loadTiddlersFromPath(resolvedWikiPath), function(tiddlerFile) {
    if (!options.prefix || options.prefix !== '') {
      for (var i = 0; i < tiddlerFile.tiddlers.length; i++) {
        tiddlerFile.tiddlers[i].title = '{' + options.prefix + '}' === '{}'?tiddlerFile.tiddlers[i].title:'{' + options.prefix + '}' + tiddlerFile.tiddlers[i].title;
      }
    }
    if(!options.readOnly && tiddlerFile.filepath) {
      $tw.utils.each(tiddlerFile.tiddlers,function(tiddler) {
        $tw.boot.files[tiddler.title] = {
          filepath: tiddlerFile.filepath,
          type: tiddlerFile.type,
          hasMetaFile: tiddlerFile.hasMetaFile
        };
      });
    }
    $tw.wiki.addTiddlers(tiddlerFile.tiddlers);
  });
  // Save the original tiddler file locations if requested
  var config = wikiInfo.config || {};
  if(config["retain-original-tiddler-path"]) {
    var output = {};
    for(var title in $tw.boot.files) {
      output[title] = path.relative(resolvedWikiPath,$tw.boot.files[title].filepath);
    }
    $tw.wiki.addTiddler(new $tw.Tiddler({title: "$:/config/OriginalTiddlerPaths", type: "application/json", text: JSON.stringify(output)}));
  }
  // Save the path to the tiddlers folder for the filesystemadaptor
  $tw.Bob.Wikis = $tw.Bob.Wikis || {};
  $tw.Bob.Wikis[options.prefix] = $tw.Bob.Wikis[options.prefix] || {};
  $tw.Bob.Wikis[options.prefix].wikiTiddlersPath = path.resolve(wikiPath, config["default-tiddler-location"] || $tw.config.wikiTiddlersSubDir);
  // Load any plugins within the wiki folder
  var wikiPluginsPath = path.resolve(wikiPath,$tw.config.wikiPluginsSubDir);
  if(fs.existsSync(wikiPluginsPath)) {
    var pluginFolders = fs.readdirSync(wikiPluginsPath);
    for(var t=0; t<pluginFolders.length; t++) {
      pluginFields = $tw.loadPluginFolder(path.resolve(wikiPluginsPath,"./" + pluginFolders[t]));
      if(pluginFields) {
        pluginFields.title = '{' + options.prefix + '}' + pluginFields.title;
        $tw.wikis.addTiddler(pluginFields);
      }
    }
  }
  // Load any themes within the wiki folder
  var wikiThemesPath = path.resolve(wikiPath,$tw.config.wikiThemesSubDir);
  if(fs.existsSync(wikiThemesPath)) {
    var themeFolders = fs.readdirSync(wikiThemesPath);
    for(var t=0; t<themeFolders.length; t++) {
      pluginFields = $tw.loadPluginFolder(path.resolve(wikiThemesPath,"./" + themeFolders[t]));
      if(pluginFields) {
        pluginFields.title = '{' + options.prefix + '}' + pluginFields.title;
        $tw.wikis.addTiddler(pluginFields);
      }
    }
  }
  // Load any languages within the wiki folder
  var wikiLanguagesPath = path.resolve(wikiPath,$tw.config.wikiLanguagesSubDir);
  if(fs.existsSync(wikiLanguagesPath)) {
    var languageFolders = fs.readdirSync(wikiLanguagesPath);
    for(var t=0; t<languageFolders.length; t++) {
      pluginFields = $tw.loadPluginFolder(path.resolve(wikiLanguagesPath,"./" + languageFolders[t]));
      if(pluginFields) {
        pluginFields.title = '{' + options.prefix + '}' + pluginFields.title;
        $tw.wikis.addTiddler(pluginFields);
      }
    }
  }
  $tw.CreateSettingsTiddlers(options.prefix);
  return wikiInfo;
};

ServerSide.prepareWiki = function (fullName, servePlugin) {
  // Only rebuild the wiki if there have been changes since the last time it
  // was built, otherwise use the cached version.
  if (typeof $tw.Bob.Wikis[fullName].modified === 'undefined' || $tw.Bob.Wikis[fullName].modified === true || typeof $tw.Bob.Wikis[fullName].cached !== 'string') {
    $tw.Bob.Wikis[fullName].plugins = $tw.Bob.Wikis[fullName].plugins || [];
    $tw.Bob.Wikis[fullName].themes = $tw.Bob.Wikis[fullName].themes || [];
    $tw.Bob.Wikis[fullName].tiddlers = $tw.Bob.Wikis[fullName].tiddlers || [];
    if (servePlugin) {
      // By default the normal file system plugins removed and the
      // multi-user plugin added instead so that they all work the same.
      // The wikis aren't actually modified, this is just hov they are
      // served.
      $tw.Bob.Wikis[fullName].plugins = $tw.Bob.Wikis[fullName].plugins.filter(function(plugin) {
        return plugin !== '$:/plugins/tiddlywiki/filesystem' && plugin !== '$:/plugins/tiddlywiki/tiddlyweb';
      });
      if ($tw.Bob.Wikis[fullName].plugins.indexOf('$:/plugins/OokTech/Bob') === -1) {
        $tw.Bob.Wikis[fullName].plugins.push('$:/plugins/OokTech/Bob');
      }
    }
    $tw.settings.includePluginList = $tw.settings.includePluginList || [];
    $tw.settings.excludePluginList = $tw.settings.excludePluginList || [];
    // Add any plugins that should be included in every wiki
    var includeList = Object.values($tw.settings.includePluginList).filter(function(plugin) {
      return $tw.Bob.Wikis[fullName].plugins.indexOf(plugin) === -1;
    }).map(function(pluginName) {return '$:/plugins/'+pluginName;})
    $tw.Bob.Wikis[fullName].plugins = $tw.Bob.Wikis[fullName].plugins.concat(includeList);
    // Remove any plugins in the excluded list
    // The exclude list takes precidence over the include list
    $tw.Bob.Wikis[fullName].plugins = $tw.Bob.Wikis[fullName].plugins.filter(function(plugin) {
      return Object.values($tw.settings.excludePluginList).indexOf(plugin) === -1;
    })
    // Make sure that all the plugins are actually loaded.
    var missingPlugins = $tw.Bob.Wikis[fullName].plugins.filter(function(plugin) {
      return !$tw.wiki.tiddlerExists(plugin);
    }).map(function(pluginTiddler) {
      return pluginTiddler.replace(/^\$:\/plugins\//, '')});
    if (missingPlugins.length > 0) {
      $tw.loadPlugins(missingPlugins,$tw.config.pluginsPath,$tw.config.pluginsEnvVar);
    }
    // This makes the wikiTiddlers variable a filter that lists all the
    // tiddlers for this wiki.
    var wikiName = fullName;
    var options = {
      variables: {
        wikiTiddlers:
          $tw.Bob.Wikis[fullName].tiddlers.concat($tw.Bob.Wikis[fullName].plugins.concat($tw.Bob.Wikis[fullName].themes)).map(function(tidInfo) {
            return '[[' + tidInfo + ']]';
          }).join(' '),
        wikiName: wikiName
      }
    };
    var text = $tw.wiki.renderTiddler("text/plain", "$:/plugins/OokTech/Bob/save/single", options);
    // Only cache the wiki if it isn't too big.
    if (text.length < 4*1024*1024) {
      $tw.Bob.Wikis[fullName].cached = text;
      $tw.Bob.Wikis[fullName].modified = false;
    } else {
      return text;
    }
  }
  return $tw.Bob.Wikis[fullName].cached;
}

/*
  Determine which sub-folders are in the current folder
*/
var getDirectories = function(source) {
  return fs.readdirSync(source).map(function(name) {
    return path.join(source,name)
  }).filter(function (source) {
    return fs.lstatSync(source).isDirectory();
  });
}
/*
  This recursively builds a tree of all of the subfolders in the tiddlers
  folder.
  This can be used to selectively watch folders of tiddlers.
*/
var buildTree = function(location, parent) {
  var folders = getDirectories(path.join(parent,location));
  var parentTree = {'path': path.join(parent,location), folders: {}};
  if (folders.length > 0) {
    folders.forEach(function(folder) {
      var apex = folder.split(path.sep).pop();
      parentTree.folders[apex] = {};
      parentTree.folders[apex] = buildTree(apex, path.join(parent,location));
    })
  }
  return parentTree;
}
var isDirectory = function(dirPath) {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
};
var createDirectory = function(dirPath) {
  if(dirPath.substr(dirPath.length-1,1) !== path.sep) {
    dirPath = dirPath + path.sep;
  }
  var pos = 1;
  pos = dirPath.indexOf(path.sep,pos);
  while(pos !== -1) {
    var subDirPath = dirPath.substr(0,pos);
    if(!isDirectory(subDirPath)) {
      try {
        fs.mkdirSync(subDirPath);
      } catch(e) {
        return "Error creating directory '" + subDirPath + "'";
      }
    }
    pos = dirPath.indexOf(path.sep,pos + 1);
  }
  return null;
};

module.exports = ServerSide

})();
