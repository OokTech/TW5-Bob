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
    http = require("http"),
    qs = require("querystring");

  // Commands that are just for the server
  $tw.ServerSide = require('$:/plugins/OokTech/MultiUser/ServerSide.js');

  // Make sure that $tw.settings is available.
  var settings = require('$:/plugins/OokTech/NodeSettings/NodeSettings.js')

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
                // multiuser plugin.
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
