/*\
title: $:/plugins/OokTech/Bob/commands/wsserver.js
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
    http = require("http"),
    qs = require("querystring");

  // A placeholder function. In the future it will look at the request object
  // and make sure that the proper authentication header is there to access
  // the desired wiki.
  function isAuthenticated(request, wiki, action) {
    return true
  }

  function canPullFromWiki(request, wiki, action) {
    return true
  }

  function canPushToWiki(request, wiki, action) {
    return true
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
      case "POST": // Intentional fall-through
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
    httpServer.on('upgrade', function(request, socket, head) {
      $tw.wss.handleUpgrade(request, socket, head, function(ws) {
        $tw.wss.emit('connection', ws, request);
      });
    });
  };

  var Command = function(params,commander,callback) {
    this.params = params;
    this.commander = commander;
    this.callback = callback;
    // Commands that are just for the server
    $tw.ServerSide = require('$:/plugins/OokTech/Bob/ServerSide.js');

    // Set up server
    $tw.httpServer = new SimpleServer({
      wiki: this.commander.wiki
    });
    // Add route handlers
    $tw.httpServer.addRoute({
      method: "GET",
      path: /^\/$/,
      handler: function(request,response,state) {
        // Load the wiki
        $tw.ServerSide.loadWiki('RootWiki', $tw.boot.wikiPath);
        // Get the raw html to send
        var text = $tw.ServerSide.prepareWiki('RootWiki', true);
        // Send the html to the server
        response.writeHead(200, {"Content-Type": state.server.get("serveType")});
        response.end(text,"utf8");
      }
    });
    // Add favicon route
    $tw.httpServer.addRoute({
      method: "GET",
      path: /^\/favicon.ico$/,
      handler: function(request,response,state) {
        response.writeHead(200, {"Content-Type": "image/x-icon"});
        var buffer = state.wiki.getTiddlerText("$:/favicon.ico","");
        response.end(buffer,"base64");
      }
    });
    $tw.settings.API = $tw.settings.API || {};
    if ($tw.settings.API.pluginLibrary === 'yes') {
      var getPluginList = function () {
        var pluginList = []
        if (typeof $tw.settings.pluginsPath === 'string') {
          var pluginsPath = path.resolve($tw.settings.pluginsPath)
          if(fs.existsSync(pluginsPath)) {
            var pluginAuthors = fs.readdirSync(pluginsPath)
            pluginAuthors.forEach(function (author) {
              var pluginAuthorPath = path.join(pluginsPath, './', author)
              if (fs.statSync(pluginAuthorPath).isDirectory()) {
                var pluginAuthorFolders = fs.readdirSync(pluginAuthorPath)
                for(var t=0; t<pluginAuthorFolders.length; t++) {
                  var fullPluginFolder = path.join(pluginAuthorPath,pluginAuthorFolders[t])
                  var pluginFields = $tw.loadPluginFolder(fullPluginFolder)
                  if(pluginFields) {
                    var readme = ""
                    var readmeText = ''
                    try {
                      // Try pulling out the plugin readme
                      var pluginJSON = JSON.parse(pluginFields.text).tiddlers
                      readme = pluginJSON[Object.keys(pluginJSON).filter(function(title) {
                        return title.toLowerCase().endsWith('/readme')
                      })[0]]
                    } catch (e) {
                      console.log('Error parsing plugin', e)
                    }
                    if (readme) {
                      readmeText = readme.text
                    }
                    var nameParts = pluginFields.title.split('/')
                    var name = nameParts[nameParts.length-2] + '/' + nameParts[nameParts.length-1]
                    var listInfo = {
                      name: name,
                      description: pluginFields.description,
                      tiddlerName: pluginFields.title,
                      version: pluginFields.version,
                      author: pluginFields.author,
                      readme: readmeText
                    }
                    pluginList.push(listInfo)
                  }
                }
              }
            })
          }
        }
        return pluginList
      }
      var getPlugin = function (request) {
        var urlParts = request.url.split('/')
        if (typeof $tw.settings.pluginsPath === 'string') {
          var pluginsPath = path.resolve($tw.settings.pluginsPath)
          var pluginPath = path.resolve(pluginsPath, urlParts[urlParts.length-2], urlParts[urlParts.length-1])
          if (fs.statSync(pluginPath).isDirectory()) {
            var pluginFields = $tw.loadPluginFolder(pluginPath)
            return pluginFields
          }
        }
        return false
      }
      // Add list route
      var pluginListRoute = new RegExp('^\/api\/plugins\/list')
      $tw.httpServer.addRoute({
        method: "POST",
        path: pluginListRoute,
        handler: function (request, response, state) {
          var authenticated = isAuthenticated(request)
          if (authenticated) {
            var pluginList = getPluginList()
            response.setHeader('Access-Control-Allow-Origin', '*')
            response.writeHead(200)
            response.end(JSON.stringify(pluginList))
          } else {
            response.writeHead(403)
            response.end()
          }
        }
      })
      // Add plugin fetch route
      var fetchPluginRoute = new RegExp('^\/api\/plugins\/fetch\/.+')
      $tw.httpServer.addRoute({
        method: "POST",
        path: fetchPluginRoute,
        handler: function (request, response, state) {
          var authenticated = isAuthenticated(request)
          if (authenticated) {
            var plugin = getPlugin(request)
            if (plugin) {
              response.setHeader('Access-Control-Allow-Origin', '*')
              response.writeHead(200)
              response.end(JSON.stringify(plugin))
            } else {
              response.writeHead(403)
              response.end()
            }
          } else {
            response.writeHead(403)
            response.end()
          }
        }
      })
    }
    if ($tw.settings.API.enablePush === 'yes') {
      var pushPathRegExp = new RegExp('^\/api\/push');
      $tw.httpServer.addRoute({
        method: "POST",
        path: pushPathRegExp,
        handler: function (request, response, state) {
          var authenticated = isAuthenticated(request)
          if (authenticated) {
            var body = ''
            request.on('data', function(chunk){
              body += chunk;
              // We limit the size of a push to 5mb for now.
              if (body.length > 5e6) {
                response.writeHead(413, {'Content-Type': 'text/plain'}).end();
                request.connection.destroy();
              }
            });
            request.on('end', function() {
              try {
                var bodyData = JSON.parse(body)
                // Make sure that the token sent here matches the https header
                // and that the token has push access to the toWiki
                var allowed = canPushToWiki(bodyData)
                if (allowed) {
                  if ($tw.settings.wikis[bodyData.toWiki] || bodyData.toWiki === 'RootWiki') {
                    $tw.ServerSide.loadWiki(bodyData.toWiki, $tw.settings.wikis[bodyData.toWiki]);
                    // Make sure that the wiki exists and is loaded
                    if ($tw.Bob.Wikis[bodyData.toWiki]) {
                      if ($tw.Bob.Wikis[bodyData.toWiki].State === 'loaded') {
                        if (bodyData.tiddlers && bodyData.toWiki) {
                          Object.keys(bodyData.tiddlers).forEach(function(title) {
                            bodyData.tiddlers[title].fields.modified = $tw.utils.stringifyDate(new Date(bodyData.tiddlers[title].fields.modified));
                            bodyData.tiddlers[title].fields.created = $tw.utils.stringifyDate(new Date(bodyData.tiddlers[title].fields.created));
                            $tw.syncadaptor.saveTiddler(bodyData.tiddlers[title], bodyData.toWiki);
                          });
                          response.writeHead(200)
                          response.end()
                        }
                      }
                    }
                  }
                } else {
                  response.writeHead(400)
                  response.end()
                }
              } catch (e) {
                response.writeHead(400)
                response.end()
              }
            })
          }
        }
      });
    }
    if ($tw.settings.API.enableFetch === 'yes') {
      var fetchPathRegExp = new RegExp('^\/api\/fetch&');
      $tw.httpServer.addRoute({
        method: "POST",
        path: fetchPathRegExp,
        handler: function(request,response,state) {
          var body = ''
          var list
          var data = {}
          response.setHeader('Access-Control-Allow-Origin', '*')
          response.writeHead(200, {"Content-Type": "application/json"})
          request.on('data', function(chunk){
            body += chunk;
            // We limit this to 1mb, it should never be anywhere near that
            // big
            if (body.length > 1e6) {
              response.writeHead(413, {'Content-Type': 'text/plain'}).end();
              request.connection.destroy();
            }
          });
          request.on('end', function() {
            body = body.replace(/^message=/, '')
            try {
              var bodyData = JSON.parse(body)
              var hasAccess = canPullFromWiki(bodyData)
              if (hasAccess) {
                if (bodyData.filter && bodyData.fromWiki) {
                  // Make sure that the person has access to the wiki
                  var authorised = true//canAccess(data.token, data.fromWiki)
                  if (authorised) {
                    // Make sure that the wiki is listed
                    if ($tw.settings.wikis[bodyData.fromWiki] || bodyData.fromWiki === 'RootWiki') {
                      // If the wiki isn't loaded than load it
                      if (!$tw.Bob.Wikis[bodyData.fromWiki]) {
                        $tw.ServerSide.loadWiki(bodyData.fromWiki, $tw.settings.wikis[bodyData.fromWiki]);
                      } else if ($tw.Bob.Wikis[bodyData.fromWiki].State !== 'loaded') {
                        $tw.ServerSide.loadWiki(bodyData.fromWiki, $tw.settings.wikis[bodyData.fromWiki]);
                      }
                      // Make sure that the wiki exists and is loaded
                      if ($tw.Bob.Wikis[bodyData.fromWiki]) {
                        if ($tw.Bob.Wikis[bodyData.fromWiki].State === 'loaded') {
                          list = $tw.Bob.Wikis[bodyData.fromWiki].wiki.filterTiddlers(bodyData.filter);
                        }
                      }
                    }
                  }
                  var tiddlers = {};
                  var info = {};
                  list.forEach(function(title) {
                    var tempTid = $tw.Bob.Wikis[bodyData.fromWiki].wiki.getTiddler(title);
                    tiddlers[title] = tempTid;
                    info[title] = {};
                    if (bodyData.fieldList) {
                      bodyData.fieldList.split(' ').forEach(function(field) {
                        info[title][field] = tempTid.fields[field];
                      })
                    } else {
                      info[title]['modified'] = tempTid.fields.modified;
                    }
                  })
                  // Send the tiddlers
                  data = {list: list, tiddlers: tiddlers, info: info};
                  data = JSON.stringify(data) || "";
                  response.end(data);
                }
              }
            } catch (e) {
              data = JSON.stringify(data) || "";
              response.end(data);
            }
          })
        }
      });
      var fetchListPathRegExp = new RegExp('^\/api\/fetch\/list');
      $tw.httpServer.addRoute({
        method: "POST",
        path: fetchListPathRegExp,
        handler: function(request,response,state) {
          var body = ''
          var list
          var data = {}
          response.setHeader('Access-Control-Allow-Origin', '*')
          response.writeHead(200, {"Content-Type": "application/json"})
          request.on('data', function(chunk){
            body += chunk;
            // We limit this to 1mb, it should never be anywhere near that
            // big
            if (body.length > 1e6) {
              response.writeHead(413, {'Content-Type': 'text/plain'}).end();
              request.connection.destroy();
            }
          });
          request.on('end', function() {
            body = body.replace(/^message=/, '')
            try {
              var bodyData = JSON.parse(body)
              var hasAccess = canPullFromWiki(bodyData)
              if (hasAccess) {
                if (bodyData.filter && bodyData.fromWiki) {
                  // Make sure that the person has access to the wiki
                  var authorised = true//canAccess(data.token, data.fromWiki)
                  if (authorised) {
                    // Make sure that the wiki is listed
                    if ($tw.settings.wikis[bodyData.fromWiki] || bodyData.fromWiki === 'RootWiki') {
                      // If the wiki isn't loaded than load it
                      if (!$tw.Bob.Wikis[bodyData.fromWiki]) {
                        $tw.ServerSide.loadWiki(bodyData.fromWiki, $tw.settings.wikis[bodyData.fromWiki]);
                      } else if ($tw.Bob.Wikis[bodyData.fromWiki].State !== 'loaded') {
                        $tw.ServerSide.loadWiki(bodyData.fromWiki, $tw.settings.wikis[bodyData.fromWiki]);
                      }
                      // Make sure that the wiki exists and is loaded
                      if ($tw.Bob.Wikis[bodyData.fromWiki]) {
                        if ($tw.Bob.Wikis[bodyData.fromWiki].State === 'loaded') {
                          // Make a temp wiki to run the filter on
                          var tempWiki = new $tw.Wiki();
                          $tw.Bob.Wikis[bodyData.fromWiki].tiddlers.forEach(function(internalTitle) {
                            var tiddler = $tw.wiki.getTiddler(internalTitle);
                            var newTiddler = JSON.parse(JSON.stringify(tiddler));
                            newTiddler.fields.modified = $tw.utils.stringifyDate(new Date(newTiddler.fields.modified));
                            newTiddler.fields.created = $tw.utils.stringifyDate(new Date(newTiddler.fields.created));
                            newTiddler.fields.title = newTiddler.fields.title.replace('{' + bodyData.fromWiki + '}', '');
                            // Add all the tiddlers that belong in wiki
                            tempWiki.addTiddler(new $tw.Tiddler(newTiddler.fields));
                          })
                          // Use the filter
                          list = tempWiki.filterTiddlers(bodyData.filter);
                        }
                      }
                    }
                  }
                  var tiddlers = {}
                  var info = {}
                  list.forEach(function(title) {
                    var tempTid = tempWiki.getTiddler(title)
                    info[title] = {}
                    if (bodyData.fieldList) {
                      bodyData.fieldList.split(' ').forEach(function(field) {
                        info[title][field] = tempTid.fields[field];
                      })
                    } else {
                      info[title]['modified'] = tempTid.fields.modified;
                    }
                  })
                  // Send the info
                  data = {list: list, info: info}
                  data = JSON.stringify(data) || "";
                  response.end(data);
                }
              }
            } catch (e) {
              data = JSON.stringify(data) || "";
              response.end(data);
            }
          })
        }
      });
    }
    if (typeof $tw.settings.filePathRoot !== 'undefined') {
      if (typeof $tw.settings.fileURLPrefix === 'string' && ($tw.settings.fileURLPrefix !== '' || $tw.settings.accptance === "I Will Not Get Tech Support For This")) {
        if ($tw.settings.fileURLPrefix === '') {
          var pathRegExp = new RegExp('^/.+$');
          var replace = false;
        } else {
          var pathRegExp = new RegExp('^\/' + $tw.settings.fileURLPrefix + '\/.+$');
          var replace = new RegExp('^\/' + $tw.settings.fileURLPrefix);
        }
      } else {
        // Use the same base path as the --listen command
        var pathRegExp = new RegExp('^\/files\/.+$');
        var replace = new RegExp('^\/files')
      }
      // Add the external files route handler
      $tw.httpServer.addRoute({
        method: "GET",
        path: pathRegExp,
        handler: function(request, response, state) {
          var basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
          var pathRoot = path.resolve(basePath,$tw.settings.filePathRoot);
          if (replace === false) {
            var pathname = path.join(pathRoot, decodeURIComponent(request.url));
          } else {
            var pathname = path.join(pathRoot, decodeURIComponent(request.url).replace(replace, ''));
          }

          // Make sure that someone doesn't try to do something like ../../ to get to things they shouldn't get.
          if (pathname.startsWith(pathRoot)) {
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
                  var ext = path.parse(pathname).ext.toLowerCase();
                  var mimeMap = $tw.settings.mimeMap || {
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
                  if (mimeMap[ext] || ($tw.settings.allowUnsafeMimeTypes && $tw.settings.accptance === "I Will Not Get Tech Support For This")) {
                    response.writeHead(200, {"Content-type": mimeMap[ext] || "text/plain"});
                    response.end(data);
                  } else {
                    response.writeHead(403);
                    response.end();
                  }
                }
              })
            })
          }
        }
      });
    }
    // Add placeholders for other routes that load the wikis associated with
    // each route.
    $tw.httpServer.addOtherRoutes();
  };

  /*
    Walk through the $tw.settings.wikis object and add a route for each listed wiki. The routes should make the wiki boot if it hasn't already.
  */
  SimpleServer.prototype.addOtherRoutes = function () {
    addRoutesThing($tw.settings.wikis, '');
  }



  function addRoutesThing(inputObject, prefix) {
    if (typeof inputObject === 'object') {
      Object.keys(inputObject).forEach(function (wikiName) {
        if (typeof inputObject[wikiName] === 'string') {
          if (prefix === '') {
            var fullName = wikiName;
          } else {
            fullName = prefix + '/' + wikiName;
          }

          // Make route handler
          $tw.httpServer.addRoute({
            method: "GET",
            path: new RegExp('^\/' + fullName + '\/?$'),
            handler: function(request, response, state) {
              // Make sure we have loaded the wiki tiddlers.
              // This does nothing if the wiki is already loaded.
              var exists = $tw.ServerSide.loadWiki(fullName, inputObject[wikiName]);
              if (exists) {
                // If servePlugin is not false than we strip out the filesystem
                // and tiddlyweb plugins if they are there and add in the
                // Bob plugin.
                var servePlugin = !$tw.settings['ws-server'].servePlugin || $tw.settings['ws-server'].servePlugin !== false;
                // Get the full text of the html wiki to send as the response.
                var text = $tw.ServerSide.prepareWiki(fullName, servePlugin);
              } else {
                var text = "<html><p>No wiki found! Either there is no usable tiddlywiki.info file in the listed location or it isn't listed.</p></html>"
              }

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
      rootTiddler = $tw.settings['ws-server'].rootTiddler || "$:/core/save/all",
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

    if (typeof $tw.settings.pluginsPath === 'string') {
      var resolvedpluginspath = path.resolve($tw.settings.pluginsPath);
      if (process.env["TIDDLYWIKI_PLUGIN_PATH"] !== undefined && process.env["TIDDLYWIKI_PLUGIN_PATH"] !== '') {
        process.env["TIDDLYWIKI_PLUGIN_PATH"] = process.env["TIDDLYWIKI_PLUGIN_PATH"] + path.delimiter + resolvedpluginspath;
      } else {
        process.env["TIDDLYWIKI_PLUGIN_PATH"] = resolvedpluginspath;
      }
    }
    if (typeof $tw.settings.themesPath === 'string') {
      var resolvedthemespath = path.resolve($tw.settings.themesPath);
      if (process.env["TIDDLYWIKI_THEME_PATH"] !== undefined && process.env["TIDDLYWIKI_THEME_PATH"] !== '') {
        process.env["TIDDLYWIKI_THEME_PATH"] = process.env["TIDDLYWIKI_THEME_PATH"] + path.delimiter + resolvedthemespath;
      } else {
        process.env["TIDDLYWIKI_THEME_PATH"] = resolvedthemespath;
      }
    }
    if (typeof $tw.settings.editionsPath === 'string') {
      var resolvededitionspath = path.resolve($tw.settings.editionsPath)
      if (process.env["TIDDLYWIKI_EDITION_PATH"] !== undefined && process.env["TIDDLYWIKI_EDITION_PATH"] !== '') {
        process.env["TIDDLYWIKI_EDITION_PATH"] = process.env["TIDDLYWIKI_EDITION_PATH"] + path.delimiter + resolvededitionspath;
      } else {
        process.env["TIDDLYWIKI_EDITION_PATH"] = resolvededitionspath;
      }
    }

    var bobVersion = $tw.wiki.getTiddler('$:/plugins/OokTech/Bob').fields.version
    console.log('TiddlyWiki version', $tw.version, 'with Bob version', bobVersion)

    $tw.httpServer.listen(port,host);

    // Get the ip address to display to make it easier for other computers to
    // connect.
    var ip = require('$:/plugins/OokTech/Bob/External/IP/ip.js');
    var ipAddress = ip.address();
    $tw.settings.serverInfo = {
      ipAddress: ipAddress,
      port: port,
      host: host
    };

    return null;
  };

  exports.Command = Command;
}
})();
