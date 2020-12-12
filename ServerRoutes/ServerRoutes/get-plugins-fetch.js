/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-plugins-fetch.js
type: application/javascript
module-type: serverroute

GET /^\/api\/plugins\/fetch\/<<author>>/<<plugin>>\/?$/

Fetch a plugin

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "GET";

exports.path = /^\/api\/plugins\/fetch\/(.+)\/?$/;

exports.handler = function(request,response,state) {
  $tw.settings.API = $tw.settings.API || {};
  if($tw.settings.API.pluginLibrary === 'yes') {
    const path = require('path');
    const fs = require('fs');
    const getPlugin = function (request) {
      const urlParts = request.url.split('/')
      const pluginPaths = $tw.getLibraryItemSearchPaths($tw.config.pluginsPath,$tw.config.pluginsEnvVar);
      const pluginPath = $tw.findLibraryItem(urlParts[urlParts.length-2]+'/'+urlParts[urlParts.length-1],pluginPaths)
      if(pluginPath && fs.statSync(pluginPath, {throwIfNoEntry: false}).isDirectory()) {
        const pluginFields = $tw.loadPluginFolder(pluginPath)
        return pluginFields
      }
      return false
    }
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const authorised = $tw.Bob.AccessCheck('', token, 'fetch', 'plugin');
    if(authorised) {
      const plugin = getPlugin(request)
      if(plugin) {
        response.writeHead(200, {"Access-Control-Allow-Origin":"*", "Content-Type": "application/json"})
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
};

}());
