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

  const util = require("util"),
    fs = require("fs"),
    url = require("url"),
    path = require("path"),
    http = require("http"),
    qs = require("querystring");

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
      console.log('upgrade type:', request.headers.upgrade)
      if (request.headers.upgrade === 'websocket') {
        if (request.url === '/') {
          $tw.wss.handleUpgrade(request, socket, head, function(ws) {
            $tw.wss.emit('connection', ws, request);
          });
        } else if (request.url === '/api/federation/socket' && $tw.federationWss && $tw.settings.enableFederation) {
          $tw.federationWss.handleUpgrade(request, socket, head, function(ws) {
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
      name = 'RootWiki'
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
    $tw.httpServer.addRoute({
      method: "GET",
      path: /^\/$/,
      handler: function(request,response,state) {
        const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
        const authorised = $tw.Bob.AccessCheck('RootWiki', token, 'view');
        if(authorised) {
          let text;
          // Load the wiki
          const exists = $tw.ServerSide.loadWiki('RootWiki');
          if(exists) {
            // Get the raw html to send
            text = $tw.ServerSide.prepareWiki('RootWiki', true);
          } else {
            text = "<html><p>RootWiki not found! If you have autoUnloadWikis set to true setting it to false may fix this problem.</p></html>"
          }
          // Send the html to the server
          response.writeHead(200, {"Content-Type": state.server.get("serveType")});
          response.end(text,"utf8");
        }
      }
    });
    // Add favicon route
    $tw.httpServer.addRoute({
      method: "GET",
      path: /^\/favicon.ico$/,
      handler: function(request,response,state) {
        const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
        const authorised = $tw.Bob.AccessCheck('RootWiki', token, 'view');
        if(authorised) {
          // Load the wiki
          const exists = $tw.ServerSide.loadWiki('RootWiki');
          let buffer = ''
          if(exists) {
            response.writeHead(200, {"Content-Type": "image/x-icon"});
            if($tw.Bob.Wikis['RootWiki']) {
              buffer = $tw.Bob.Wikis['RootWiki'].wiki.getTiddlerText('$:/favicon.ico')
            }
          } else {
            buffer = "";
          }
          response.end(buffer,"base64");
        } else {
          response.writeHead(404);
          response.end();
        }
      }
    });
    $tw.settings.API = $tw.settings.API || {};
    if($tw.settings.API.pluginLibrary === 'yes') {
      const getPluginList = function () {
        let pluginList = []
        if(typeof $tw.settings.pluginsPath === 'string') {
          const basePath = $tw.ServerSide.getBasePath();
          const pluginsPath = path.resolve(basePath, $tw.settings.pluginsPath)
          if(fs.existsSync(pluginsPath)) {
            try {
              const pluginAuthors = fs.readdirSync(pluginsPath)
              pluginAuthors.forEach(function (author) {
                const pluginAuthorPath = path.join(pluginsPath, './', author)
                if(fs.statSync(pluginAuthorPath).isDirectory()) {
                  const pluginAuthorFolders = fs.readdirSync(pluginAuthorPath)
                  for(let t=0; t<pluginAuthorFolders.length; t++) {
                    const fullPluginFolder = path.join(pluginAuthorPath,pluginAuthorFolders[t])
                    const pluginFields = $tw.loadPluginFolder(fullPluginFolder)
                    if(pluginFields) {
                      let readme = ""
                      let readmeText = ''
                      try {
                        // Try pulling out the plugin readme
                        const pluginJSON = JSON.parse(pluginFields.text).tiddlers
                        readme = pluginJSON[Object.keys(pluginJSON).filter(function(title) {
                          return title.toLowerCase().endsWith('/readme')
                        })[0]]
                      } catch (e) {
                        $tw.Bob.logger.error('Error parsing plugin', e, {level:1})
                      }
                      if(readme) {
                        readmeText = readme.text
                      }
                      const nameParts = pluginFields.title.split('/')
                      const name = nameParts[nameParts.length-2] + '/' + nameParts[nameParts.length-1]
                      const listInfo = {
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
            } catch (e) {
              $tw.Bob.logger.error('Problem loading plugin', e, {level:1})
            }
          }
        }
        return pluginList
      }
      const getPlugin = function (request) {
        const urlParts = request.url.split('/')
        if(typeof $tw.settings.pluginsPath === 'string') {
          const basePath = $tw.ServerSide.getBasePath();
          const pluginsPath = path.resolve(basePath, $tw.settings.pluginsPath)
          const pluginPath = path.resolve(pluginsPath, urlParts[urlParts.length-2], urlParts[urlParts.length-1])
          if(fs.statSync(pluginPath).isDirectory()) {
            const pluginFields = $tw.loadPluginFolder(pluginPath)
            return pluginFields
          }
        }
        return false
      }
      // Add list route
      const pluginListRoute = new RegExp('^\/api\/plugins\/list')
      $tw.httpServer.addRoute({
        method: "POST",
        path: pluginListRoute,
        handler: function (request, response, state) {
          const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
          const authorised = $tw.Bob.AccessCheck("RootWiki", token, 'list');
          if(authorised) {
            const pluginList = getPluginList()
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
      const fetchPluginRoute = new RegExp('^\/api\/plugins\/fetch\/.+')
      $tw.httpServer.addRoute({
        method: "POST",
        path: fetchPluginRoute,
        handler: function (request, response, state) {
          const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
          const authorised = $tw.Bob.AccessCheck("RootWiki", token, 'fetchPlugin');
          if(authorised) {
            const plugin = getPlugin(request)
            if(plugin) {
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
    if($tw.settings.API.enablePush === 'yes') {
      const pushPathRegExp = new RegExp('^\/api\/push');
      $tw.httpServer.addRoute({
        method: "POST",
        path: pushPathRegExp,
        handler: function (request, response, state) {
          let body = ''
          request.on('data', function(chunk){
            body += chunk;
            // We limit the size of a push to 5mb for now.
            if(body.length > 5e6) {
              response.writeHead(413, {'Content-Type': 'text/plain'}).end();
              request.connection.destroy();
            }
          });
          request.on('end', function() {
            try {
              let bodyData = JSON.parse(body)
              // Make sure that the token sent here matches the https header
              // and that the token has push access to the toWiki
              const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
              const authorised = $tw.Bob.AccessCheck(bodyData.toWiki, token, 'push');
              if(authorised) {
                if($tw.settings.wikis[bodyData.toWiki] || bodyData.toWiki === 'RootWiki') {
                  $tw.ServerSide.loadWiki(bodyData.toWiki);
                  // Make sure that the wiki exists and is loaded
                  if($tw.Bob.Wikis[bodyData.toWiki]) {
                    if($tw.Bob.Wikis[bodyData.toWiki].State === 'loaded') {
                      if(bodyData.tiddlers && bodyData.toWiki) {
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
      });
    }
    if($tw.settings.API.enableFetch === 'yes') {
      const fetchPathRegExp = new RegExp('^\/api\/fetch&');
      $tw.httpServer.addRoute({
        method: "POST",
        path: fetchPathRegExp,
        handler: function(request,response,state) {
          let body = ''
          let list = []
          let data = {}
          response.setHeader('Access-Control-Allow-Origin', '*')
          response.writeHead(200, {"Content-Type": "application/json"})
          request.on('data', function(chunk){
            body += chunk;
            // We limit this to 1mb, it should never be anywhere near that
            // big
            if(body.length > 1e6) {
              response.writeHead(413, {'Content-Type': 'text/plain'}).end();
              request.connection.destroy();
            }
          });
          request.on('end', function() {
            body = body.replace(/^message=/, '')
            try {
              const bodyData = JSON.parse(body)
              if(bodyData.filter && bodyData.fromWiki) {
                // Make sure that the person has access to the wiki
                const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
                const authorised = $tw.Bob.AccessCheck(bodyData.fromWiki, token, 'view');
                if(authorised) {
                  // Make sure that the wiki is listed
                  if($tw.settings.wikis[bodyData.fromWiki] || bodyData.fromWiki === 'RootWiki') {
                    // If the wiki isn't loaded than load it
                    if(!$tw.Bob.Wikis[bodyData.fromWiki]) {
                      $tw.ServerSide.loadWiki(bodyData.fromWiki);
                    } else if($tw.Bob.Wikis[bodyData.fromWiki].State !== 'loaded') {
                      $tw.ServerSide.loadWiki(bodyData.fromWiki);
                    }
                    // Make sure that the wiki exists and is loaded
                    if($tw.Bob.Wikis[bodyData.fromWiki]) {
                      if($tw.Bob.Wikis[bodyData.fromWiki].State === 'loaded') {
                        list = $tw.Bob.Wikis[bodyData.fromWiki].wiki.filterTiddlers(bodyData.filter);
                      }
                    }
                  }
                }
                let tiddlers = {};
                let info = {};
                list.forEach(function(title) {
                  const tempTid = $tw.Bob.Wikis[bodyData.fromWiki].wiki.getTiddler(title);
                  tiddlers[title] = tempTid;
                  info[title] = {};
                  if(bodyData.fieldList) {
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
            } catch (e) {
              data = JSON.stringify(data) || "";
              response.end(data);
            }
          })
        }
      });
      const fetchListPathRegExp = new RegExp('^\/api\/fetch\/list');
      $tw.httpServer.addRoute({
        method: "POST",
        path: fetchListPathRegExp,
        handler: function(request,response,state) {
          let body = ''
          let list
          let data = {}
          response.setHeader('Access-Control-Allow-Origin', '*')
          response.writeHead(200, {"Content-Type": "application/json"})
          request.on('data', function(chunk){
            body += chunk;
            // We limit this to 1mb, it should never be anywhere near that
            // big
            if(body.length > 1e6) {
              response.writeHead(413, {'Content-Type': 'text/plain'}).end();
              request.connection.destroy();
            }
          });
          request.on('end', function() {
            body = body.replace(/^message=/, '')
            try {
              const bodyData = JSON.parse(body)
              if(bodyData.filter && bodyData.fromWiki) {
                // Make sure that the person has access to the wiki
                const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
                const authorised = $tw.Bob.AccessCheck(bodyData.fromWiki, token, 'view');
                if(authorised) {
                  // Make sure that the wiki is listed
                  if($tw.settings.wikis[bodyData.fromWiki] || bodyData.fromWiki === 'RootWiki') {
                    // If the wiki isn't loaded than load it
                    if(!$tw.Bob.Wikis[bodyData.fromWiki]) {
                      $tw.ServerSide.loadWiki(bodyData.fromWiki);
                    } else if($tw.Bob.Wikis[bodyData.fromWiki].State !== 'loaded') {
                      $tw.ServerSide.loadWiki(bodyData.fromWiki);
                    }
                    // Make sure that the wiki exists and is loaded
                    if($tw.Bob.Wikis[bodyData.fromWiki]) {
                      if($tw.Bob.Wikis[bodyData.fromWiki].State === 'loaded') {
                        // Make a temp wiki to run the filter on
                        let tempWiki = new $tw.Wiki();
                        $tw.Bob.Wikis[bodyData.fromWiki].tiddlers.forEach(function(internalTitle) {
                          const tiddler = $tw.wiki.getTiddler(internalTitle);
                          let newTiddler = JSON.parse(JSON.stringify(tiddler));
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
                let tiddlers = {}
                let info = {}
                list.forEach(function(title) {
                  const tempTid = tempWiki.getTiddler(title)
                  info[title] = {}
                  if(bodyData.fieldList) {
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
            } catch (e) {
              data = JSON.stringify(data) || "";
              response.end(data);
            }
          })
        }
      });
    }
    if($tw.settings.enableFileServer === 'true') {
      // Start with the same base path as the --listen command
      let pathRegExp = new RegExp('\/files\/.+$');
      if(typeof $tw.settings.fileURLPrefix === 'string' && ($tw.settings.fileURLPrefix !== '' || $tw.settings.accptance === "I Will Not Get Tech Support For This")) {
        if($tw.settings.fileURLPrefix === '') {
          pathRegExp = new RegExp('^/.+$');
        } else {
          pathRegExp = new RegExp('\/' + $tw.settings.fileURLPrefix + '\/.+$');
        }
      }
      // Add the external files route handler
      $tw.httpServer.addRoute({
        method: "GET",
        path: pathRegExp,
        handler: function(request, response, state) {
          const wikiName = findName(request.url.replace(/^\//, ''));
          const filePrefix = $tw.settings.fileURLPrefix?$tw.settings.fileURLPrefix:'files';
          let urlPieces = request.url.split('/');
          // Check to make sure that the wiki name actually matches the URL
          // Without this you could put in foo/bar/baz and get files from
          // foo/bar if there was a wiki tehre and not on foo/bar/baz and then
          // it would break when someone made a wiki on foo/bar/baz
          let ok = false;
          if(wikiName !== '' && wikiName !== 'RootWiki') {
            ok = (request.url.replace(/^\//, '').split('/')[wikiName.split('/').length] === filePrefix);
          } else {
            ok = (request.url.replace(/^\//, '').split('/')[0] === filePrefix);
          }
          const filePath = decodeURIComponent(urlPieces.slice(urlPieces.indexOf(filePrefix)+1).join('/'));
          const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
          const authorised = $tw.Bob.AccessCheck(wikiName, token, 'view');
          if(authorised && ok) {
            const basePath = process.pkg?path.dirname(process.argv[0]):process.cwd();
            let pathRoot = path.resolve(basePath,$tw.settings.filePathRoot);
            if(wikiName !== '') {
              pathRoot = path.resolve($tw.Bob.Wikis[wikiName].wikiPath, 'files')
            }
            const pathname = path.resolve(pathRoot, filePath)
            // Make sure that someone doesn't try to do something like ../../ to get to things they shouldn't get.
            if(pathname.startsWith(pathRoot)) {
              fs.exists(pathname, function(exists) {
                if(!exists || fs.statSync(pathname).isDirectory()) {
                  response.statusCode = 404;
                  response.end();
                }
                fs.readFile(pathname, function(err, data) {
                  if(err) {
                    $tw.Bob.logger.error(err, {level:1})
                    response.statusCode = 500;
                    response.end();
                  } else {
                    const ext = path.parse(pathname).ext.toLowerCase();
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
                    if(mimeMap[ext] || ($tw.settings.allowUnsafeMimeTypes && $tw.settings.accptance === "I Will Not Get Tech Support For This")) {
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

          // Make route handler
          $tw.httpServer.addRoute({
            method: "GET",
            path: new RegExp('^\/' + fullName + '\/?$'),
            handler: function(request, response, state) {
              const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
              const authorised = $tw.Bob.AccessCheck(fullName, token, 'view');
              let text;
              if(authorised) {
                // Make sure we have loaded the wiki tiddlers.
                // This does nothing if the wiki is already loaded.
                const exists = $tw.ServerSide.loadWiki(fullName);
                if(exists) {
                  // If servePlugin is not false than we strip out the filesystem
                  // and tiddlyweb plugins if they are there and add in the
                  // Bob plugin.
                  const servePlugin = !$tw.settings['ws-server'].servePlugin || $tw.settings['ws-server'].servePlugin !== false;
                  // Get the full text of the html wiki to send as the response.
                  text = $tw.ServerSide.prepareWiki(fullName, servePlugin);
                } else {
                  text = "<html><p>No wiki found! Either there is no usable tiddlywiki.info file in the listed location or it isn't listed.</p></html>"
                }

                response.writeHead(200, {"Content-Type": state.server.get("serveType")});
                response.end(text,"utf8");
              }
            }
          });
          // And add the favicon route for the child wikis
          $tw.httpServer.addRoute({
            method: "GET",
            path: new RegExp('^\/' + fullName + '\/favicon.ico$'),
            handler: function(request,response,state) {
              const exists = $tw.ServerSide.loadWiki(fullName);
              if(exists) {
                response.writeHead(200, {"Content-Type": "image/x-icon"});
                const buffer = $tw.Bob.Wikis[fullName].wiki.getTiddlerText('$:/favicon.ico');
                response.end(buffer,"base64");
              } else {
                response.writeHead(404);
                response.end();
              }
            }
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
