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

exports.info = {
  name: "wsserver",
  synchronous: true
};

exports.platforms = ["node"];

if($tw.node) {
  var util = require("util"),
    fs = require("fs"),
    url = require("url"),
    path = require("path"),
    http = require("http");

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
      console.log('ws-server - Failed to load settings file.');
      rawSettings = '{}';
    }

    // Try to parse the JSON after loading the file.
    try {
      newSettings = JSON.parse(rawSettings);
    } catch (err) {
      console.log('ws-server - Malformed Settings. Using empty default.');
      console.log('ws-server - Check Settings. Maybe comma error?');
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
    		$tw.wiki.addTiddler({title: "$:/config/OriginalTiddlerPaths", type: "application/json", text: JSON.stringify(output)});
    	}
    	// Save the path to the tiddlers folder for the filesystemadaptor
      if (options.prefix !== '') {
        $tw.MultiUser.Wikis = $tw.MultiUser.Wikis || {};
        $tw.MultiUser.Wikis[options.prefix] = $tw.MultiUser.Wikis[options.prefix] || {};
        $tw.MultiUser.Wikis[options.prefix].wikiTiddlersPath = path.resolve(wikiPath, config["default-tiddler-location"] || $tw.config.wikiTiddlersSubDir);
      } else {
        $tw.MultiUser.Wikis = $tw.MultiUser.Wikis || {};
        $tw.MultiUser.Wikis.RootWiki = $tw.MultiUser.Wikis.RootWiki || {};
        $tw.MultiUser.Wikis.RootWiki.wikiTiddlersPath = path.resolve($tw.boot.wikiPath,config["default-tiddler-location"] || $tw.config.wikiTiddlersSubDir);
      }
    	// Load any plugins within the wiki folder
    	var wikiPluginsPath = path.resolve(wikiPath,$tw.config.wikiPluginsSubDir);
    	if(fs.existsSync(wikiPluginsPath)) {
    		var pluginFolders = fs.readdirSync(wikiPluginsPath);
    		for(var t=0; t<pluginFolders.length; t++) {
    			pluginFields = $tw.loadPluginFolder(path.resolve(wikiPluginsPath,"./" + pluginFolders[t]));
    			if(pluginFields) {
            pluginFields.title = '{' + options.prefix + '}'!=='{}'? '{' + options.prefix + '}' + pluginFields.title:pluginFields.title;
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
            pluginFields.title = '{' + options.prefix + '}'!=='{}'? '{' + options.prefix + '}' + pluginFields.title:pluginFields.title;
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
            pluginFields.title = '{' + options.prefix + '}'!=='{}'? '{' + options.prefix + '}' + pluginFields.title:pluginFields.title;
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

  // This removes all but the root wiki from the routes
  SimpleServer.prototype.clearRoutes = function () {
    // Remove any routes that don't match the root path
    this.routes = this.routes.filter(function(thisRoute) {
      return String(thisRoute.path) === String(/^\/$/) || String(thisRoute.path) === String(/^\/favicon.ico$/);
    });
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
        $tw.settings['ws-server'].port = $tw.httpServerPort;
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
        if ($tw.MultiUser.Wikis.RootWiki.State !== 'loaded') {
          $tw.MultiUser.Wikis.RootWiki.State = 'loaded';
          $tw.MultiUser.Wikis.RootWiki.tiddlers = $tw.wiki.allTitles().filter(function(name) {
            return !name.startsWith('{');
          });
          // Add tiddlers to the node process
          var wikiInfo = $tw.MultiUser.loadWikiTiddlers($tw.boot.wikiPath);
          $tw.MultiUser.Wikis.RootWiki.plugins = wikiInfo.plugins.map(function(name) {
            return '$:/plugins/' + name;
          });
          $tw.MultiUser.Wikis.RootWiki.themes = wikiInfo.themes.map(function(name) {
            return '$:/themes/' + name;
          });
        }
        // This makes the wikiTiddlers variable a filter that lists all the
        // tiddlers for this wiki.
        var options = {
          variables: {
            wikiTiddlers:
              $tw.MultiUser.Wikis.RootWiki.tiddlers.concat($tw.MultiUser.Wikis.RootWiki.plugins.concat($tw.MultiUser.Wikis.RootWiki.themes)).map(function(tidInfo) {
                return '[[' + tidInfo + ']]';
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
    if ($tw.settings.filePathRoot) {
      // Add the external files route handler
      $tw.httpServer.addRoute({
        method: "GET",
        path: /^\/file\/.+$/,
        handler: function(request, response, state) {
          var pathname = path.join($tw.settings.filePathRoot, request.url.replace(/^\/file/, ''));
          // Make sure that someone doesn't try to do something like ../../ to get to things they shouldn't get.
          if (pathname.startsWith($tw.settings.filePathRoot)) {
            fs.exists(pathname, function(exists) {
              if (!exists || fs.statSync(pathname).isDirectory()) {
                response.statusCode = 404;
                response.end();
              }
              fs.readFile(pathname, function(err, data) {
                if (err) {
                  console.log(err)
                  response.statusCode = 500;
                  response.end();
                } else {
                  var ext = path.parse(pathname).ext;
                  var mimeMap = {
                    '.ico': 'image/x-icon',
                    '.html': 'text/html',
                    '.js': 'text/javascript',
                    '.json': 'application/json',
                    '.css': 'text/css',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.wav': 'audio/wav',
                    '.mp3': 'audio/mpeg',
                    '.svg': 'image/svg+xml',
                    '.pdf': 'application/pdf',
                    '.doc': 'application/msword',
                    '.gif': 'image/gif'
                  };
                  response.writeHead(200, {"Content-type": mimeMap[ext] || "text/plain"});
                  response.end(data);
                }
              })
            })
          }
        }
      });
    }
    // Add placeholders for other routes that load the wikis associated with each
    // route.
    $tw.httpServer.addOtherRoutes();
  };

  /*
    Walk through the $tw.settings.wikis object and add a route for each listed wiki. The routes should make the wiki boot if it hasn't already.
  */
  SimpleServer.prototype.addOtherRoutes = function () {
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
          if (prefix === '') {
            var fullName = wikiName;
          } else {
            fullName = prefix + '/' + wikiName;
          }
          $tw.MultiUser = $tw.MultiUser || {};
          $tw.MultiUser.Wikis = $tw.MultiUser.Wikis || {};
          $tw.MultiUser.Wikis[fullName] = $tw.MultiUser.Wikis[fullName] || {};
          $tw.MultiUser.Wikis[fullName].wikiPath = inputObject[wikiName];
          $tw.MultiUser.Wikis[fullName].wikiTiddlersPath = path.resolve(inputObject[wikiName], 'tiddlers');

          // Make route handler
          $tw.httpServer.addRoute({
            method: "GET",
            path: new RegExp('^\/' + fullName + '\/?$'),
            handler: function(request, response, state) {
              // Make sure we haven't already loaded the wiki.

              // Make sure that the root wiki tiddlers are listed!
              $tw.MultiUser.Wikis.RootWiki = $tw.MultiUser.Wikis.RootWiki || {};
              if ($tw.MultiUser.Wikis.RootWiki.State !== 'loaded') {
                $tw.MultiUser.Wikis.RootWiki.State = 'loaded';
                $tw.MultiUser.Wikis.RootWiki.tiddlers = $tw.wiki.allTitles().filter(function(name) {
                  return !name.startsWith('{');
                });
                // Add tiddlers to the node process
                var wikiInfo = $tw.MultiUser.loadWikiTiddlers($tw.boot.wikiPath);
                $tw.MultiUser.Wikis.RootWiki.plugins = wikiInfo.plugins.map(function(name) {
                  return '$:/plugins/' + name;
                });
                $tw.MultiUser.Wikis.RootWiki.themes = wikiInfo.themes.map(function(name) {
                  return '$:/themes/' + name;
                });
              }
              if ($tw.MultiUser.Wikis[fullName].State !== 'loaded') {
                $tw.MultiUser.Wikis[fullName].State = 'loaded';
                // Get the correct path to the tiddlywiki.info file
                createDirectory($tw.MultiUser.Wikis[fullName].wikiTiddlersPath);

                // Recursively build the folder tree structure
                $tw.MultiUser.Wikis[fullName].FolderTree = buildTree('.', $tw.MultiUser.Wikis[fullName].wikiTiddlersPath, {});

                // Watch the root tiddlers folder for chanegs
                $tw.MultiUser.WatchAllFolders($tw.MultiUser.Wikis[fullName].FolderTree, fullName);

                // Add tiddlers to the node process
                var basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
                var fullPath = path.join(basePath, inputObject[wikiName]);
                //var wikiInfo = $tw.MultiUser.loadWikiTiddlers(inputObject[wikiName], {prefix: fullName});
                var wikiInfo = $tw.MultiUser.loadWikiTiddlers(fullPath, {prefix: fullName});
                // Add plugins, themes and languages
                $tw.loadPlugins(wikiInfo.plugins,$tw.config.pluginsPath,$tw.config.pluginsEnvVar);
                $tw.loadPlugins(wikiInfo.themes,$tw.config.themesPath,$tw.config.themesEnvVar);
              	$tw.loadPlugins(wikiInfo.languages,$tw.config.languagesPath,$tw.config.languagesEnvVar);
                // Get the list of tiddlers for this wiki
                $tw.MultiUser.Wikis[fullName].tiddlers = $tw.wiki.allTitles().filter(function(title) {
                  return title.startsWith('{' + fullName + '}');
                });
                $tw.MultiUser.Wikis[fullName].plugins = wikiInfo.plugins.map(function(name) {
                  return '$:/plugins/' + name;
                });
                $tw.MultiUser.Wikis[fullName].themes = wikiInfo.themes.map(function(name) {
                  return '$:/themes/' + name;
                });
              }
              // By default the normal file system plugins removed and the
              // multi-user plugin added instead so that they all work the same.
              // The wikis aren't actually modified, this is just hov they are
              // served.
              if (!$tw.settings['ws-server'].servePlugin || $tw.settings['ws-server'].servePlugin !== false) {
                $tw.MultiUser.Wikis[fullName].plugins = $tw.MultiUser.Wikis[fullName].plugins.filter(function(plugin) {
                  return plugin !== '$:/plugins/tiddlywiki/filesystem' && plugin !== '$:/plugins/tiddlywiki/tiddlyweb';
                });
                if ($tw.MultiUser.Wikis[fullName].plugins.indexOf('$:/plugins/OokTech/MultiUser') === -1) {
                  $tw.MultiUser.Wikis[fullName].plugins.push('$:/plugins/OokTech/MultiUser');
                }
              }
              // This makes the wikiTiddlers variable a filter that lists all the
              // tiddlers for this wiki.
              var options = {
                variables: {
                  wikiTiddlers:
                    $tw.MultiUser.Wikis[fullName].tiddlers.concat($tw.MultiUser.Wikis[fullName].plugins.concat($tw.MultiUser.Wikis[fullName].themes)).map(function(tidInfo) {
                      return '[[' + tidInfo + ']]';
                    }).join(' '),
                  wikiName: fullName
                }
              };
              var text = $tw.wiki.renderTiddler("text/plain", "$:/core/save/single", options);
              response.writeHead(200, {"Content-Type": state.server.get("serveType")});
              response.end(text,"utf8");
            }
          });
          // And add the favicon route for the child wikis
          $tw.httpServer.addRoute({
            method: "GET",
            path: new RegExp('^\/' + fullName + '\/favicon.ico$'),
            handler: function(request,response,state) {
              response.writeHead(200, {"Content-Type": "image/x-icon"});
              var buffer = state.wiki.getTiddlerText("{" + fullName + "}" + "$:/favicon.ico","");
              response.end(buffer,"base64");
            }
          });
          console.log("Added route " + String(new RegExp('^\/' + fullName + '\/?$')))
        } else {
          // recurse!
          // This needs to be a new variable or else the rest of the wikis at
          // this level will get the longer prefix as well.
          var nextPrefix = prefix===''?wikiName:prefix + '/' + wikiName;
          addRoutesThing(inputObject[wikiName], nextPrefix);
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
}
})();
