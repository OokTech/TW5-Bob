/*\
title: $:/plugins/OokTech/Bob/ServerSide.js
type: application/javascript
module-type: library

This is server functions that can be shared between different server types

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */

if($tw.ServerSide) {
  return $tw.ServerSide;
} else {

let ServerSide = {};

const path = require('path');
//const fs = require('fs');
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
$tw.Bob.EditingTiddlers = $tw.Bob.EditingTiddlers || {};

ServerSide.prepareWiki = function (fullName, servePlugin, cache='yes', cb) {
  if (typeof cb !== 'function') {cb = () => {}}
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
      $tw.syncadaptor.loadPlugins(missingPlugins,$tw.config.pluginsPath,$tw.config.pluginsEnvVar, fullName, finish);
    } else {
      finish()
    }

    function finish() {
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
        cb($tw.Bob.Wikis[fullName].cached);
      } else {
        cb(text);
        return text;
      }
    }
  } else {
    cb($tw.Bob.Wikis[fullName].cached);
  }
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
        Object.values($tw.connections).forEach(function(connection) {
          if(input.connections.indexOf(connection.index) !== -1) {
            connectionsList.push(connection.index);
          }
        });
      }
      if(input.wikis.length > 0) {
        wikisList = [];
        Object.values($tw.connections).forEach(function(connection) {
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
          message.wiki = Object.values($tw.connections).wiki
          $tw.Bob.SendToBrowser(Object.values($tw.connections)[index], message);
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
    if($tw.syncadaptor.name === 'WikiDBAdaptor') {
      if(!Array.isArray(obj)) {
        return []
      }
      // TODO make this less terrible, it shouldn't be a workaround specific to one adaptor, so make the adaptor give what this expects
      // this is not a trivial update so it may be a while.
      return obj?obj.map(a => a.title):[]
    }
    let output = [];
    let ownedWikis = {};
    Object.keys(obj).forEach(function(item) {
      if(typeof obj[item] === 'string') {
        if($tw.syncadaptor.existsListed(prefix+item)) {
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
    if (prefix === '') {
      output.push('RootWiki')
    }
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
    tempObj[viewableWikis[i]] = ['view'];
    // Check if you can edit it
    if($tw.Bob.AccessCheck(viewableWikis[i], {"decoded": data.decoded}, 'edit', 'wiki')) {
      tempObj[viewableWikis[i]].push('edit');
    }
  }
  return tempObj;
}

ServerSide.getViewablePluginsList = function (data) {
  data = data || {};
  $tw.settings.pluginLibrary = $tw.settings.pluginLibrary || {};
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
  $tw.settings.themeLibrary = $tw.settings.themeLibrary || {};
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
    const basePath = $tw.syncadaptor.getBasePath();
    // We need to make sure this doesn't overwrite existing thing
    const fullEditionsPath = path.resolve(basePath, $tw.settings.editionsPath);
    if(process.env["TIDDLYWIKI_EDITION_PATH"] !== undefined && process.env["TIDDLYWIKI_EDITION_PATH"] !== '') {
      process.env["TIDDLYWIKI_EDITION_PATH"] = process.env["TIDDLYWIKI_EDITION_PATH"] + path.delimiter + fullEditionsPath;
    } else {
      process.env["TIDDLYWIKI_EDITION_PATH"] = fullEditionsPath;
    }
  }
  data = data || {};
  $tw.settings.editionLibrary = $tw.settings.editionLibrary || {};
  const viewableEditions = {};
  const editionList =  $tw.utils.getEditionInfoSafe();
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
  const languageList =  $tw.utils.getLanguageInfo();
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
  tempSettings.enableFederation = $tw.settings.enableFederation;
  tempSettings.federation = $tw.settings.federation;

  // Section visible by logged in people
  if(data.decoded) {
    tempSettings.backups = $tw.settings.backups;
    tempSettings.defaultVisibility = $tw.settings.defaultVisibility;
    tempSettings.disableBrowserAlerts = $tw.settings.disableBrowserAlerts;
    tempSettings.editionLibrary = $tw.settings.editionLibrary;
    tempSettings.enableFileServer = $tw.settings.enableFileServer;
    tempSettings.excludePluginList = $tw.settings.excludePluginList;
    tempSettings.fileURLPrefix = $tw.settings.fileURLPrefix;
    tempSettings.heartbeat = $tw.settings.heartbeat;
    tempSettings.includePluginList = $tw.settings.includePluginList;
    tempSettings.mimeMap = $tw.settings.mimeMap;
    tempSettings.namespacedWikis = $tw.settings.namespacedWikis;
    tempSettings.persistentUsernames = $tw.settings.persistentUsernames;
    tempSettings.perWikiFiles = $tw.settings.perWikiFiles;
    tempSettings.pluginLibrary = $tw.settings.pluginLibrary;
    tempSettings.profileOptions = $tw.settings.profileOptions;
    tempSettings.saveMediaOnServer = $tw.settings.saveMediaOnServer;
    tempSettings.themeLibrary = $tw.settings.themeLibrary;
    tempSettings.tokenTTL = $tw.settings.tokenTTL;
  }
  // advanced section only visible to admins
  if((data.decoded && data.decoded.level === 'Admin') || data.decoded === true) {
    tempSettings.actions = $tw.settings.actions;
    tempSettings.admin = $tw.settings.admin;
    tempSettings.advanced = $tw.settings.advanced;
    tempSettings.certPath = $tw.settings.certPath;
    tempSettings.disableFileWatchers = $tw.settings.disableFileWatchers;
    tempSettings.editions = $tw.settings.editions;
    tempSettings.editionsPath = $tw.settings.editionsPath;
    tempSettings.enableBobSaver = $tw.settings.enableBobSaver;
    tempSettings.filePathRoot = $tw.settings.filePathRoot;
    tempSettings['fed-wss'] = $tw.settings['fed-wss'];
    tempSettings.httpsPort = $tw.settings.httpsPort;
    tempSettings.languages = $tw.settings.languages;
    tempSettings.languagesPath = $tw.settings.languagesPath;
    tempSettings.logger = $tw.settings.logger;
    tempSettings.plugins = $tw.settings.plugins;
    tempSettings.pluginsPath = $tw.settings.pluginsPath;
    tempSettings.profiles = $tw.settings.profiles;
    tempSettings.reverseProxy = $tw.settings.reverseProxy;
    tempSettings.rootWikiName = $tw.settings.rootWikiName;
    tempSettings.saltRounds = $tw.settings.saltRounds;
    tempSettings.saver = $tw.settings.saver;
    tempSettings.scripts = $tw.settings.scripts;
    tempSettings.servingFiles = $tw.settings.servingFiles;
    tempSettings.server = $tw.settings.server;
    tempSettings.serverInfo = $tw.settings.serverInfo;
    tempSettings.serverKeyPath = $tw.settings.serverKeyPath;
    tempSettings.serveWikiOnRoot = $tw.settings.serveWikiOnRoot;
    tempSettings.suppressBrowser = $tw.settings.suppressBrowser;
    tempSettings.themes = $tw.settings.themes;
    tempSettings.themesPath = $tw.settings.themesPath;
    tempSettings.tokenPrivateKeyPath = $tw.settings.tokenPrivateKeyPath;
    tempSettings.useHTTPS = $tw.settings.useHTTPS;
    tempSettings.wikiPathBase = $tw.settings.wikiPathBase;
    tempSettings.wikiPermissionsPath = $tw.settings.wikiPermissionsPath;
    tempSettings.wikisPath = $tw.settings.wikisPath;
    tempSettings['ws-server'] = $tw.settings['ws-server'];
  }
  tempSettings.advanced = tempSettings.avanced || {};
  tempSettings['ws-server'] = tempSettings['ws-server'] || {};
  tempSettings['fed-wss'] = tempSettings['fed-wss'] || {};

  return tempSettings;
}

ServerSide.getProfileInfo = function(data) {
  $tw.settings.profiles = $tw.settings.profiles || {};
  if ($tw.Bob.AccessCheck(data.profileName, {"decoded": data.decoded}, 'view', 'profile')) {
    return $tw.settings.profiles[data.profileName] || {};
  } else {
    return {};
  }
}

ServerSide.listProfiles = function(data) {
  $tw.settings.profiles = $tw.settings.profiles || {};
  const result = {};
  Object.keys($tw.settings.profiles).forEach(function(profileName) {
    if ($tw.Bob.AccessCheck(profileName, data, 'view', 'profile') || $tw.Bob.AccessCheck(profileName, data, 'view/anyProfile', 'server')) {
      result[profileName] = $tw.settings.profiles[profileName]
    }
  })
  return result;
}

ServerSide.getOwnedWikis = function(data) {
  function getList(obj, prefix) {
    let output = [];
    Object.keys(obj).forEach(function(item) {
      if(typeof obj[item] === 'string') {
        if($tw.syncadaptor.existsListed(prefix+item)) {
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

    // if the file is for a specfic wiki this lists the name, otherwise it is ''
    const wikiName = $tw.ServerSide.findName(data.folder);
    const repRegex = new RegExp(`^\/?.+?\/?${$tw.settings.fileURLPrefix}\/?`)
    const thePath = data.folder.replace(repRegex, '').replace(/^\/*/,'');
    let fileFolder
    if(thePath === '' && wikiName === '') {
      // Globally available files in filePathRoot
      const filePathRoot = $tw.syncadaptor.getFilePathRoot();
      fileFolder = path.resolve($tw.syncadaptor.getBasePath(), filePathRoot);
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
        const wikiPath = $tw.syncadaptor.existsListed(wikiName);
        if(!wikiPath) {
          return;
        }
        fileFolder = path.join(wikiPath, 'files');
        next(fileFolder, thePath, wikiName);
      }
    } else {
      const testPaths = [path.resolve($tw.syncadaptor.getBasePath())].concat( Object.values($tw.settings.servingFiles));
      let ind = 0
      nextTest(0, testPaths)
      function nextTest(index, pathsToTest) {
        // If the path isn't listed in the servingFiles thing check if it is a child of one of the paths, or of the filePathRoot
        const filePathRoot = $tw.syncadaptor.getFilePathRoot();
        let test = path.resolve($tw.syncadaptor.getBasePath(), filePathRoot, pathsToTest[index]);
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
      const filePathRoot = $tw.syncadaptor.getFilePathRoot();
      const resolvedPath = path.resolve($tw.syncadaptor.getBasePath(), filePathRoot, folder);
      let match = false;
      if(authorised) {
        const mimeMap = $tw.settings.mimeMap || {
          '.aac': 'audio/aac',
          '.avi': 'video/x-msvideo',
          '.bmp': 'image/bmp',
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
          '.mp4': 'video/mp4',
          '.mpeg': 'video/mpeg',
          '.oga': 'audio/ogg',
          '.ogv': 'video/ogg',
          '.ogx': 'application/ogg',
          '.png': 'image/png',
          '.pdf': 'application/pdf',
          '.svg': 'image/svg+xml',
          '.txt': 'text/plain',
          '.weba': 'audio/weba',
          '.webm': 'video/webm',
          '.webp': 'image/webp',
          '.wav': 'audio/wav'
        };
        const extList = data.mediaTypes || false;
        let prefix = path.join(wikiName, $tw.settings.fileURLPrefix, urlPath);
        prefix = prefix.startsWith('/') ? prefix : '/' + prefix;
        prefix = prefix.endsWith('/') ? prefix : prefix + '/';
        fs.readdir(resolvedPath, function(err, items) {
          if(err || !items) {
            $tw.Bob.logger.error("Can't read files folder ", resolvedPath, " with error ", err, {level: 1});
            cb(prefix, [], urlPath, wikiName);
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
            cb(prefix, filteredItems, urlPath, wikiName);
          }
        });
      }
    }
  } else {
    cb("", [], "");
  }
}

/*
  This updates the list of tiddlers being edited in each wiki. Any tiddler on
  this list has the edit button disabled to prevent two people from
  simultaneously editing the same tiddler.
  If run without an input it just re-sends the lists to each browser, with a
  tiddler title as input it appends that tiddler to the list and sends the
  updated list to all connected browsers.

  For privacy and security only the tiddlers that are in the wiki a
  conneciton is using are sent to that connection.
*/
ServerSide.UpdateEditingTiddlers = function (tiddler, wikiName) {
  // Make sure that the wiki is loaded
  $tw.syncadaptor.loadWiki(wikiName, finish);
  // This should never be false, but then this shouldn't every have been a
  // problem to start.
  function finish(exists) {
    if(exists) {
      // Check if a tiddler title was passed as input and that the tiddler isn't
      // already listed as being edited.
      // If there is a title and it isn't being edited add it to the list.
      if(tiddler && !$tw.Bob.EditingTiddlers[wikiName][tiddler]) {
        $tw.Bob.EditingTiddlers[wikiName][tiddler] = true;
      }
      Object.keys($tw.connections).forEach(function(index) {
        if($tw.connections[index].wiki === wikiName) {
          $tw.Bob.EditingTiddlers[wikiName] = $tw.Bob.EditingTiddlers[wikiName] || {};
          const list = Object.keys($tw.Bob.EditingTiddlers[wikiName]);
          const message = {type: 'updateEditingTiddlers', list: list, wiki: wikiName};
          $tw.Bob.SendToBrowser($tw.connections[index], message);
          $tw.Bob.logger.log('Update Editing Tiddlers', {level: 4})
        }
      });
    }
  }
}
/*
  This keeps a history of changes for each wiki so that when a wiki is
  disconnected and reconnects and asks to resync this can be used to resync
  the wiki with the minimum amount of network traffic.

  Resyncing only needs to keep track of creating and deleting tiddlers here.
  The editing state of tiddlers is taken care of by the websocket
  reconnection process.

  So this is just the list of deleted tiddlers and saved tiddlers with time
  stamps, and it should at most have one item per tiddler because the newest
  save or delete message overrides any previous messages.

  The hisotry is an array of change entries
  Each entry in the history is in the form
  {
    title: tiddlerTitle,
    timestamp: changeTimeStamp,
    type: messageType
  }
*/
$tw.Bob.UpdateHistory = function(message) {
  // Only save saveTiddler or deleteTiddler events that have a wiki listed
  if(['saveTiddler', 'deleteTiddler'].indexOf(message.type) !== -1 && message.wiki) {
    $tw.Bob.ServerHistory = $tw.Bob.ServerHistory || {};
    $tw.Bob.ServerHistory[message.wiki] = $tw.Bob.ServerHistory[message.wiki] || [];
    const entryIndex = $tw.Bob.ServerHistory[message.wiki].findIndex(function(entry) {
      return entry.title === message.tiddler.fields.title;
    })
    const entry = {
      timestamp: Date.now(),
      title: message.tiddler.fields.title,
      type: message.type
    }
    if(entryIndex > -1) {
      $tw.Bob.ServerHistory[message.wiki][entryIndex] = entry;
    } else {
      $tw.Bob.ServerHistory[message.wiki].push(entry);
    }
  }
}

/*
  This is a wrapper function that takes a message that is meant to be sent to
  all connected browsers and handles the details.

  It iterates though all connections, checkis if each one is active, tries to
  send the message, if the sending fails than it sets the connection as
  inactive.

  Note: This checks if the message is a string despite SendToBrowser also
  checking because if it needs to be changed and sent to multiple browsers
  changing it once here instead of once per browser should be better.
*/
$tw.Bob.SendToBrowsers = function (message, excludeConnection) {
  $tw.Bob.UpdateHistory(message);
  Object.values($tw.connections).forEach(function (connection, ind) {
    if((ind !== excludeConnection) && connection.socket) {
      if(connection.socket.readyState === 1 && (connection.wiki === message.wiki || !message.wiki)) {
        $tw.Bob.Shared.sendMessage(message, connection.sessionId);
      }
    }
  })
}

/*
  This function sends a message to a single connected browser. It takes the
  browser connection object and the stringifyed message as input.
  If any attempt fails mark the connection as inacive.

  On the server side the history is a bit more complex.
  There is one history of messages sent that has the message ids, each
  connection has a list of message ids that are still waiting for acks.
*/
$tw.Bob.SendToBrowser = function (connection, message) {
  if(connection && connection.socket) {
    $tw.Bob.UpdateHistory(message);
    if(connection.socket.readyState === 1 && (connection.wiki === message.wiki || !message.wiki)) {
      $tw.Bob.Shared.sendMessage(message, connection.sessionId);
    }
  }
}

/*
  This disconnects all connections that are for a specific wiki. this is used
  when unloading a wiki to make sure that people aren't trying to interact
  with a disconnected wiki.
*/
$tw.Bob.DisconnectWiki = function (wiki) {
  Object.values($tw.connections).forEach(function(connectionIndex) {
    if(connectionIndex.wiki === wiki) {
      if(connectionIndex.socket !== undefined) {
        // Close the websocket connection
        connectionIndex.socket.terminate();
      }
    }
  })
}

$tw.Bob.unloadWiki = function(wikiName) {
  if(wikiName) {
    $tw.Bob.logger.log('Unload wiki ', wikiName, {level:1});
    $tw.stopFileWatchers(wikiName);
    // Make sure that the wiki is loaded
    if($tw.Bob.Wikis[wikiName]) {
      if($tw.Bob.Wikis[wikiName].State === 'loaded') {
        // If so than unload the wiki
        // This removes the information about the wiki and the wiki object
        delete $tw.Bob.Wikis[wikiName];
        // This removes all the info about the files for the wiki
        delete $tw.Bob.Files[wikiName];
      }
    }
    $tw.Bob.DisconnectWiki(wikiName);
  }
}

/*
  This checks to see if a wiki has no connected sockets and if not it unloads
  the wiki.
*/
$tw.Bob.PruneConnections = function () {
  if($tw.settings.autoUnloadWikis === "true") {
    Object.values($tw.connections).forEach(function(connection) {
      if(connection.socket !== undefined) {
        if(connection.socket.readyState !== 1) {
          connection.socket.terminate();
          connection.socket = undefined;
        }
      }
    })
  }
}

module.exports = ServerSide
}

})();
