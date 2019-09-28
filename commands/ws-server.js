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

  $tw.Bob.getCookie = function(cookie, cname) {
    cookie = cookie || ""
    const name = cname + "=";
    const ca = cookie.split(';');
    for(let i = 0; i <ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) == ' ') {
        c = c.substring(1);
      }
      if(c.indexOf(name) == 0) {
        return c.substring(name.length, c.length);
      }
    }
    return false;
  }

  const url = require("url"),
    path = require("path"),
    http = require("http")

  /*
  A simple HTTP server with regexp-based routes
  */
  function SimpleServer(options) {
    this.routes = options.routes || [];
    this.wiki = options.wiki;
    this.variables = options.variables || {};
  }

  SimpleServer.prototype.set = function(obj) {
    let self = this;
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
    const pathprefix = this.get("pathprefix") || "";
    for(let t=0; t<this.routes.length; t++) {
      const potentialRoute = this.routes[t];
      let pathname = decodeURIComponent(state.urlInfo.pathname);
      let match;
      if(pathprefix) {
        // This should help with some unicode names
        if(pathname.startsWith(pathprefix)) {
          pathname = pathname.replace(pathprefix,'');
          match = potentialRoute.path.exec(pathname);
        } else {
          match = false;
        }
      } else {
        if(typeof potentialRoute.path.exec === 'function') {
          match = potentialRoute.path.exec(pathname);
        }
      }
      if(match && request.method === potentialRoute.method) {
        state.params = [];
        for(let p=1; p<match.length; p++) {
          state.params.push(match[p]);
        }
        return potentialRoute;
      }
    }
    return null;
  };

  SimpleServer.prototype.checkCredentials = function(request,incomingUsername,incomingPassword) {
    const header = request.headers.authorization || "",
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
    let self = this;
    let state = {};
    state.wiki = self.wiki;
    state.server = self;
    state.urlInfo = url.parse(request.url);
    // Find the route that matches this path
    const route = self.findMatchingRoute(request,state);
    // Check for the username and password if we've got one
    const username = self.get("username"),
      password = self.get("password");
    if(username && password) {
      // Check they match
      if(self.checkCredentials(request,username,password) !== "ALLOWED") {
        const servername = state.wiki.getTiddlerText("$:/SiteTitle") || "TiddlyWiki5";
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
        let data = "";
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
    let self = this;
    const httpServer = http.createServer(this.requestHandler.bind(this));
    httpServer.on('error', function (e) {
      if($tw.settings['ws-server'].autoIncrementPort || typeof $tw.settings['ws-server'].autoIncrementPort === 'undefined') {
        if(e.code === 'EADDRINUSE') {
          self.listen(Number(port)+1, host);
        }
      } else {
        $tw.Bob.logger.error(e, {level:0});
      }
    });
    httpServer.listen(port,host, function (e) {
      if(!e) {
        $tw.httpServerPort = port;
        $tw.Bob.logger.log("Serving on " + host + ":" + $tw.httpServerPort, {level:0});
        $tw.Bob.logger.log("(press ctrl-C to exit)", {level:0});
        $tw.settings['ws-server'].port = $tw.httpServerPort;
      } else {
        if($tw.settings['ws-server'].autoIncrementPort || typeof $tw.settings['ws-server'].autoIncrementPort === 'undefined') {
          $tw.Bob.logger.log('Port ', port, ' in use, trying ', port+1, {level:1});
        } else {
          $tw.Bob.logger.error(e, {level:0});
        }
      }
    });
    httpServer.on('upgrade', function(request, socket, head) {
      if (request.headers.upgrade === 'websocket') {
        if (request.url === '/') {
          $tw.wss.handleUpgrade(request, socket, head, function(ws) {
            $tw.wss.emit('connection', ws, request);
          });
        } else if (request.url === '/api/federation/socket' && $tw.federationWss && $tw.settings.enableFederation === 'yes') {
          $tw.federationWss.handleUpgrade(request, socket, head, function(ws) {
            console.log('WSS federation upgrade')
            $tw.federationWss.emit('connection', ws, request);
          })
        }
      }
    });
    return httpServer;
  };

  function findName(url) {
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
    if (name === '') {
      //name = 'RootWiki'
    }
    return name
  }

  const Command = function(params,commander,callback) {
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
    $tw.modules.forEachModuleOfType("serverroute", function(title, routeDefinition) {
      $tw.httpServer.addRoute(routeDefinition);
    });
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
    $tw.modules.forEachModuleOfType("wikiroute", function(title, routeDefinition) {
      $tw.httpServer.addRoute(routeDefinition('RootWiki'));
    });
    if(typeof inputObject === 'object') {
      Object.keys(inputObject).forEach(function (wikiName) {
        if(typeof inputObject[wikiName] === 'string') {
          let fullName = wikiName;
          if(prefix !== '') {
            if(wikiName !== '__path') {
              fullName = prefix + '/' + wikiName;
            } else {
              fullName = prefix;
            }
          }

          $tw.modules.forEachModuleOfType("wikiroute", function(title, routeDefinition) {
            $tw.httpServer.addRoute(routeDefinition(fullName));
          });

          $tw.Bob.logger.log("Added route " + String(new RegExp('^\/' + fullName + '\/?$')), {level:1})
        } else {
          // recurse!
          // This needs to be a new variable or else the rest of the wikis at
          // this level will get the longer prefix as well.
          const nextPrefix = prefix===''?wikiName:prefix + '/' + wikiName;
          addRoutesThing(inputObject[wikiName], nextPrefix);
        }
      })
    }
  }

  Command.prototype.execute = function() {
    $tw.Bob = $tw.Bob || {};
    $tw.Bob.Wikis = $tw.Bob.Wikis || {};
    if(!$tw.boot.wikiTiddlersPath) {
      $tw.utils.warning("Warning: Wiki folder '" + $tw.boot.wikiPath + "' does not exist or is missing a tiddlywiki.info file");
    }
    const port = $tw.settings['ws-server'].port || "8080",
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

    const basePath = $tw.ServerSide.getBasePath();
    $tw.settings.pluginsPath = $tw.settings.pluginsPath || './Plugins';
    if(typeof $tw.settings.pluginsPath === 'string') {
      const resolvedpluginspath = path.resolve(basePath, $tw.settings.pluginsPath);
      if(process.env["TIDDLYWIKI_PLUGIN_PATH"] !== undefined && process.env["TIDDLYWIKI_PLUGIN_PATH"] !== '') {
        process.env["TIDDLYWIKI_PLUGIN_PATH"] = process.env["TIDDLYWIKI_PLUGIN_PATH"] + path.delimiter + resolvedpluginspath;
      } else {
        process.env["TIDDLYWIKI_PLUGIN_PATH"] = resolvedpluginspath;
      }
    }
    $tw.settings.themesPath = $tw.settings.themesPath || './Themes';
    if(typeof $tw.settings.themesPath === 'string') {
      const resolvedthemespath = path.resolve(basePath, $tw.settings.themesPath);
      if(process.env["TIDDLYWIKI_THEME_PATH"] !== undefined && process.env["TIDDLYWIKI_THEME_PATH"] !== '') {
        process.env["TIDDLYWIKI_THEME_PATH"] = process.env["TIDDLYWIKI_THEME_PATH"] + path.delimiter + resolvedthemespath;
      } else {
        process.env["TIDDLYWIKI_THEME_PATH"] = resolvedthemespath;
      }
    }
    $tw.settings.editionsPath = $tw.settings.editionsPath || './Editions';
    if(typeof $tw.settings.editionsPath === 'string') {
      const resolvededitionspath = path.resolve(basePath, $tw.settings.editionsPath)
      if(process.env["TIDDLYWIKI_EDITION_PATH"] !== undefined && process.env["TIDDLYWIKI_EDITION_PATH"] !== '') {
        process.env["TIDDLYWIKI_EDITION_PATH"] = process.env["TIDDLYWIKI_EDITION_PATH"] + path.delimiter + resolvededitionspath;
      } else {
        process.env["TIDDLYWIKI_EDITION_PATH"] = resolvededitionspath;
      }
    }
    $tw.settings.languagesPath = $tw.settings.languagesPath || './Languages';
    if(typeof $tw.settings.languagesPath === 'string') {
      const resolvedlanguagespath = path.resolve(basePath, $tw.settings.languagesPath)
      if(process.env["TIDDLYWIKI_LANGUAGE_PATH"] !== undefined && process.env["TIDDLYWIKI_LANGUAGE_PATH"] !== '') {
        process.env["TIDDLYWIKI_LANGUAGE_PATH"] = process.env["TIDDLYWIKI_LANGUAGE_PATH"] + path.delimiter + resolvedlanguagespath;
      } else {
        process.env["TIDDLYWIKI_LANGUAGE_PATH"] = resolvedlanguagespath;
      }
    }

    const bobVersion = $tw.wiki.getTiddler('$:/plugins/OokTech/Bob').fields.version
    $tw.Bob.logger.log('TiddlyWiki version', $tw.version, 'with Bob version', bobVersion, {level:0})

    /*
      This function checks to see if the current action is allowed with the access
      level given by the supplied token

      If access controls are not enabled than this just returns true and
      everything is allowed.

      If access controls are enabled than this needs to check the token to get
      the list of wikis and actions that are allowed to it and if the action is
      allowed for the wiki return true, otherwise false.
    */
    $tw.Bob.AccessCheck = function(wikiName, token, action) {
      return true;
    }

    const nodeServer = $tw.httpServer.listen(port,host);

    // Get the ip address to display to make it easier for other computers to
    // connect.
    const ip = require('$:/plugins/OokTech/Bob/External/IP/ip.js');
    const ipAddress = ip.address();
    $tw.settings.serverInfo = {
      ipAddress: ipAddress,
      port: port,
      host: host
    };

    $tw.hooks.invokeHook("th-server-command-post-start",$tw.httpServer,nodeServer,"tiddlywiki");
    return null;
  };

  exports.Command = Command;
}
})();
