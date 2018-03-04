/*\
title: $:/core/modules/commands/wsserver.js
type: application/javascript
module-type: command

Serve tiddlers using a two-way websocket server over http

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

if($tw.node) {
  var util = require("util"),
    fs = require("fs"),
    url = require("url"),
    path = require("path"),
    http = require("http");
}

exports.info = {
  name: "wsserver",
  synchronous: true
};

/*
  Commands are loaded before plugins so the updateSettings function may not exist
  yet.
*/
$tw.updateSettings = $tw.updateSettings || function (globalSettings, localSettings) {
  //Walk though the properties in the localSettings, for each property set the global settings equal to it, but only for singleton properties. Don't set something like GlobalSettings.Accelerometer = localSettings.Accelerometer, set globalSettings.Accelerometer.Controller = localSettings.Accelerometer.Contorller
  Object.keys(localSettings).forEach(function(key,index){
    if (typeof localSettings[key] === 'object') {
      if (!globalSettings[key]) {
        globalSettings[key] = {};
      }
      //do this again!
      $tw.updateSettings(globalSettings[key], localSettings[key]);
    } else {
      globalSettings[key] = localSettings[key];
    }
  });
}
$tw.loadSettings = function(settings, newSettingsPath) {
  if ($tw.node && !fs) {
    var fs = require('fs')
  }
  var rawSettings;
  var newSettings;

  // try/catch in case defined path is invalid.
  try {
    rawSettings = fs.readFileSync(newSettingsPath);
  } catch (err) {
    console.log(`ws-server - Failed to load settings file.`);
    rawSettings = '{}';
  }

  // Try to parse the JSON after loading the file.
  try {
    newSettings = JSON.parse(rawSettings);
  } catch (err) {
    console.log(`ws-server - Malformed Settings. Using empty default.`);
    console.log(`ws-server - Check Settings. Maybe comma error?`);
    // Create an empty default Settings.
    newSettings = {};
  }

  $tw.updateSettings(settings,newSettings);
}

/*
path: path of wiki directory
options:
	parentPaths: array of parent paths that we mustn't recurse into
	readOnly: true if the tiddler file paths should not be retained
*/
// Only add this if we are running node
if($tw.node) {
  $tw.MultiUser.loadWikiTiddlers = function(wikiPath,options) {
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
  		parentPaths = parentPaths.slice(0);
  		parentPaths.push(wikiPath);
  		$tw.utils.each(wikiInfo.includeWikis,function(info) {
  			if(typeof info === "string") {
  				info = {path: info};
  			}
  			var resolvedIncludedWikiPath = path.resolve(wikiPath,info.path);
  			if(parentPaths.indexOf(resolvedIncludedWikiPath) === -1) {
  				var subWikiInfo = $tw.MultiUser.loadWikiTiddlers(resolvedIncludedWikiPath,{
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
  	$tw.loadPlugins(wikiInfo.plugins,$tw.config.pluginsPath,$tw.config.pluginsEnvVar);
  	$tw.loadPlugins(wikiInfo.themes,$tw.config.themesPath,$tw.config.themesEnvVar);
  	$tw.loadPlugins(wikiInfo.languages,$tw.config.languagesPath,$tw.config.languagesEnvVar);
  	// Load the wiki files, registering them as writable
  	var resolvedWikiPath = path.resolve(wikiPath,$tw.config.wikiTiddlersSubDir);
  	$tw.utils.each($tw.loadTiddlersFromPath(resolvedWikiPath),function(tiddlerFile) {
      if (options.prefix !== '') {
        for (var i = 0; i < tiddlerFile.tiddlers.length; i++) {
          tiddlerFile.tiddlers[i].title = `{${options.prefix}}${tiddlerFile.tiddlers[i].title}`
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
  		$tw.wiki.addTiddler({title: "$:/config/OriginalTiddlerPaths", type: "application/json", text: JSON.stringify(output)});
  	}
  	// Save the path to the tiddlers folder for the filesystemadaptor
    if (options.prefix !== '') {
      $tw.MultiUser.Wikis[options.prefix].wikiTiddlersPath = path.resolve(wikiPath, config["default-tiddler-location"] || $tw.config.wikiTiddlersSubDir);
    } else {
      $tw.MultiUser.Wikis.RootWiki.wikiTiddlersPath = path.resolve($tw.boot.wikiPath,config["default-tiddler-location"] || $tw.config.wikiTiddlersSubDir);
    }
  	// Load any plugins within the wiki folder
  	var wikiPluginsPath = path.resolve(wikiPath,$tw.config.wikiPluginsSubDir);
  	if(fs.existsSync(wikiPluginsPath)) {
  		var pluginFolders = fs.readdirSync(wikiPluginsPath);
  		for(var t=0; t<pluginFolders.length; t++) {
  			pluginFields = $tw.loadPluginFolder(path.resolve(wikiPluginsPath,"./" + pluginFolders[t]));
  			if(pluginFields) {
          pluginFields.title = options.prefix!==''? `{${options.prefix}}${pluginFields.title}`:pluginFields.title;
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
          pluginFields.title = options.prefix!==''? `{${options.prefix}}${pluginFields.title}`:pluginFields.title;
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
          pluginFields.title = options.prefix!==''? `{${options.prefix}}${pluginFields.title}`:pluginFields.title;
  				$tw.wikis.addTiddler(pluginFields);
  			}
  		}
  	}
  	return wikiInfo;
  };
}

/*
A simple HTTP server with regexp-based routes
*/
function SimpleServer(options) {
  this.routes = options.routes || [];
  this.wiki = options.wiki;
  this.variables = options.variables || {};
}

SimpleServer.prototype.set = function(obj) {
  var self = this;
  $tw.utils.each(obj,function(value,name) {
    self.variables[name] = value;
  });
};

SimpleServer.prototype.get = function(name) {
  return this.variables[name];
};

SimpleServer.prototype.addRoute = function(route) {
  this.routes.push(route);
};

// Add route but make sure it isn't a duplicate.
SimpleServer.prototype.updateRoute = function (route) {
  // Remove any routes that have the same path as the input
  this.routes = this.routes.filter(function(thisRoute) {
    return String(thisRoute.path) !== String(route.path);
  });
  // Push on the new route.
  this.routes.push(route);
}

SimpleServer.prototype.findMatchingRoute = function(request,state) {
  var pathprefix = this.get("pathprefix") || "";
  for(var t=0; t<this.routes.length; t++) {
    var potentialRoute = this.routes[t],
      pathRegExp = potentialRoute.path,
      pathname = state.urlInfo.pathname,
      match;
    if(pathprefix) {
      if(pathname.substr(0,pathprefix.length) === pathprefix) {
        pathname = pathname.substr(pathprefix.length);
        match = potentialRoute.path.exec(pathname);
      } else {
        match = false;
      }
    } else {
      if (typeof potentialRoute.path.exec === 'function') {
        match = potentialRoute.path.exec(pathname);
      }
    }
    if(match && request.method === potentialRoute.method) {
      state.params = [];
      for(var p=1; p<match.length; p++) {
        state.params.push(match[p]);
      }
      return potentialRoute;
    }
  }
  return null;
};

SimpleServer.prototype.checkCredentials = function(request,incomingUsername,incomingPassword) {
  var header = request.headers.authorization || "",
    token = header.split(/\s+/).pop() || "",
    auth = $tw.utils.base64Decode(token),
    parts = auth.split(/:/),
    username = parts[0],
    password = parts[1];
  if(incomingUsername === username && incomingPassword === password) {
    return "ALLOWED";
  } else {
    return "DENIED";
  }
};

SimpleServer.prototype.requestHandler = function(request,response) {
  // Compose the state object
  var self = this;
  var state = {};
  state.wiki = self.wiki;
  state.server = self;
  state.urlInfo = url.parse(request.url);
  // Find the route that matches this path
  var route = self.findMatchingRoute(request,state);
  // Check for the username and password if we've got one
  var username = self.get("username"),
    password = self.get("password");
  if(username && password) {
    // Check they match
    if(self.checkCredentials(request,username,password) !== "ALLOWED") {
      var servername = state.wiki.getTiddlerText("$:/SiteTitle") || "TiddlyWiki5";
      response.writeHead(401,"Authentication required",{
        "WWW-Authenticate": 'Basic realm="Please provide your username and password to login to ' + servername + '"'
      });
      response.end();
      return;
    }
  }
  // Return a 404 if we didn't find a route
  if(!route) {
    response.writeHead(404);
    response.end();
    return;
  }
  // Set the encoding for the incoming request
  // TODO: Presumably this would need tweaking if we supported PUTting binary tiddlers
  request.setEncoding("utf8");
  // Dispatch the appropriate method
  switch(request.method) {
    case "GET": // Intentional fall-through
    case "DELETE":
      route.handler(request,response,state);
      break;
    case "PUT":
      var data = "";
      request.on("data",function(chunk) {
        data += chunk.toString();
      });
      request.on("end",function() {
        state.data = data;
        route.handler(request,response,state);
      });
      break;
  }
};

/*
  This function will try the default port, if that port is in use than it will
  increment port numbers until it finds an unused port.
*/
SimpleServer.prototype.listen = function(port,host) {
  var self = this;
  var httpServer = http.createServer(this.requestHandler.bind(this));
  httpServer.on('error', function (e) {
    if ($tw.settings['ws-server'].autoIncrementPort || typeof $tw.settings['ws-server'].autoIncrementPort === 'undefined') {
      if (e.code === 'EADDRINUSE') {
        self.listen(Number(port)+1, host);
      }
    } else {
      console.log(e);
    }
  });
  httpServer.listen(port,host, function (e) {
    if (!e) {
      $tw.httpServerPort = port;
      console.log("Serving on " + host + ":" + $tw.httpServerPort);
      console.log("(press ctrl-C to exit)");
    } else {
      if ($tw.settings['ws-server'].autoIncrementPort || typeof $tw.settings['ws-server'].autoIncrementPort === 'undefined') {
        console.log('Port ', port, ' in use, trying ', port+1);
      } else {
        console.log(e);
      }
    }
  });
};

var Command = function(params,commander,callback) {
  this.params = params;
  this.commander = commander;
  this.callback = callback;
  // Get default Settings
  var settings = JSON.parse($tw.wiki.getTiddlerText('$:/plugins/OokTech/MultiUser/ws-server-default-settings'));
  // Make sure that $tw.settings exists.
  $tw.settings = $tw.settings || {};
  // Add Settings to the global $tw.settings
  $tw.updateSettings($tw.settings, settings);
  // Get user settings, if any
  var userSettingsPath = path.join($tw.boot.wikiPath, 'settings', 'settings.json');
  $tw.loadSettings($tw.settings,userSettingsPath);
  // Set up server
  $tw.httpServer = new SimpleServer({
    wiki: this.commander.wiki
  });
  // Add route handlers
  $tw.httpServer.addRoute({
    method: "GET",
    path: /^\/$/,
    handler: function(request,response,state) {
      $tw.MultiUser = $tw.MultiUser || {};
      $tw.MultiUser.Wikis = $tw.MultiUser.Wikis || {};
      $tw.MultiUser.Wikis.RootWiki = $tw.MultiUser.Wikis.RootWiki || {};
      if (!$tw.MultiUser.Wikis.RootWiki.State) {
        $tw.MultiUser.Wikis.RootWiki.State = 'loaded';
        $tw.MultiUser.Wikis.RootWiki.tiddlers = $tw.wiki.allTitles().filter(function(name) {
          console.log(name, /^\{.+\}.&/.test(name))
          return !/^\{.+\}.&/.test(name);
        });
      }
      // This makes the wikiTiddlers variable a filter that lists all the
      // tiddlers for this wiki.
      var options = {
        variables: {
          wikiTiddlers:
            $tw.MultiUser.Wikis.RootWiki.tiddlers.map(function(tidInfo) {
              if (!/^\{.+\}.&/.test(tidInfo)) {
                return `[[${tidInfo}]]`;
              }
            }).join(' '),
          wikiName: ''
        }
      };
      response.writeHead(200, {"Content-Type": state.server.get("serveType")});
      var text = state.wiki.renderTiddler(state.server.get("renderType"),state.server.get("rootTiddler"), options);
      response.end(text,"utf8");
    }
  });
  $tw.httpServer.addRoute({
    method: "GET",
    path: /^\/favicon.ico$/,
    handler: function(request,response,state) {
      response.writeHead(200, {"Content-Type": "image/x-icon"});
      var buffer = state.wiki.getTiddlerText("$:/favicon.ico","");
      response.end(buffer,"base64");
    }
  });
  // Add placeholders for other routes that load the wikis associated with each
  // route.
  this.addOtherRoutes();
};

/*
  Walk through the $tw.settings.wikis object and add a route for each listed wiki. The routes should make the wiki boot if it hasn't already.
*/
Command.prototype.addOtherRoutes = function () {
  addRoutesThing($tw.settings.wikis, '');
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

function addRoutesThing(inputObject, prefix) {
  if (typeof inputObject === 'object') {
    Object.keys(inputObject).forEach(function (wikiName) {
      if (typeof inputObject[wikiName] === 'string') {
        $tw.MultiUser = $tw.MultiUser || {};
        $tw.MultiUser.Wikis = $tw.MultiUser.Wikis || {};
        $tw.MultiUser.Wikis[wikiName] = $tw.MultiUser.Wikis[wikiName] || {};
        $tw.MultiUser.Wikis[wikiName].wikiTiddlersPath = inputObject[wikiName];

        // Make route handler
        $tw.httpServer.addRoute({
          method: "GET",
          path: new RegExp(`^\/${wikiName}\/?$`),
          handler: function(request, response, state) {
            // Make sure we haven't already loaded the wiki.

            // Make sure that the root wiki tiddlers are listed!
            $tw.MultiUser.Wikis.RootWiki = $tw.MultiUser.Wikis.RootWiki || {};
            if (!$tw.MultiUser.Wikis.RootWiki.State) {
              $tw.MultiUser.Wikis.RootWiki.State = 'loaded';
              $tw.MultiUser.Wikis.RootWiki.tiddlers = $tw.wiki.allTitles().filter(function(name) {
                return !/^\{.+\}.&/.test(name);
              });
            }
            if (!$tw.MultiUser.Wikis[wikiName].State) {
              $tw.MultiUser.Wikis[wikiName].State = 'loaded';
              // Get the correct path to the tiddlywiki.info file
              //var wikiPathThing = path.join('/home/inmysocks/TiddlyWiki/Wikis', wikiName);

              //$tw.MultiUser.Wikis[wikiName].wikiTiddlersPath = wikiPathThing;
              createDirectory($tw.MultiUser.Wikis[wikiName].wikiTiddlersPath);

              // Recursively build the folder tree structure
              $tw.MultiUser.Wikis[wikiName].FolderTree = buildTree('.', $tw.MultiUser.Wikis[wikiName].wikiTiddlersPath, {});

              // Watch the root tiddlers folder for chanegs
              $tw.MultiUser.WatchAllFolders($tw.MultiUser.Wikis[wikiName].FolderTree, wikiName);

              // Add tiddlers to the node process
              //var wikiInfo = $tw.MultiUser.loadWikiTiddlers(wikiPathThing, {prefix: wikiName});
              var wikiInfo = $tw.MultiUser.loadWikiTiddlers(inputObject[wikiName], {prefix: wikiName});
              // Get the list of tiddlers for this wiki
              $tw.MultiUser.Wikis[wikiName].tiddlers = $tw.wiki.allTitles().filter(function(title) {
                return title.startsWith(`{${wikiName}}`);
              });
              $tw.MultiUser.Wikis[wikiName].plugins = wikiInfo.plugins.map(function(name) {
                return `$:/plugins/${name}`;
              });
              $tw.MultiUser.Wikis[wikiName].themes = wikiInfo.themes.map(function(name) {
                return `$:/themes/${name}`;
              });
            }
            // This makes the wikiTiddlers variable a filter that lists all the
            // tiddlers for this wiki.
            var options = {
              variables: {
                wikiTiddlers:
                  $tw.MultiUser.Wikis[wikiName].tiddlers.concat($tw.MultiUser.Wikis[wikiName].plugins.concat($tw.MultiUser.Wikis[wikiName].themes)).map(function(tidInfo) {
                    return `[[${tidInfo}]]`;
                  }).join(' '),
                wikiName: wikiName
              }
            };
            var text = $tw.wiki.renderTiddler("text/plain", "$:/core/save/single", options);
            response.writeHead(200, {"Content-Type": state.server.get("serveType")});
            response.end(text,"utf8");
          }
        });
        console.log(`Added route ${String(new RegExp(`^\/${wikiName}\/?$`))}`)
      } else {
        // recurse!
        prefix = prefix + '/' + wikiName;
        addRoutesThing(inputObject[wikiName], prefix);
      }
    })
  }
}

Command.prototype.execute = function() {
  if(!$tw.boot.wikiTiddlersPath) {
    $tw.utils.warning("Warning: Wiki folder '" + $tw.boot.wikiPath + "' does not exist or is missing a tiddlywiki.info file");
  }
  var port = $tw.settings['ws-server'].port || "8080",
    rootTiddler = $tw.settings['ws-server'].rootTiddler || "$:/core/save/single",
    renderType = $tw.settings['ws-server'].renderType || "text/plain",
    serveType = $tw.settings['ws-server'].serveType || "text/html",
    username = $tw.settings['ws-server'].username,
    password = $tw.settings['ws-server'].password,
    host = $tw.settings['ws-server'].host || "127.0.0.1",
    pathprefix = $tw.settings['ws-server'].pathprefix;
  $tw.httpServer.set({
    rootTiddler: rootTiddler,
    renderType: renderType,
    serveType: serveType,
    username: username,
    password: password,
    pathprefix: pathprefix
  });

  $tw.httpServer.listen(port,host);
  return null;
};

exports.Command = Command;

})();
