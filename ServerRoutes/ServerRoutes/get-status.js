/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-status.js
type: application/javascript
module-type: serverroute

GET /^\/api\/status\/?$/

Returns server status information

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const thePath = /^\/api\/status\/?$/;
exports.method = "GET";
exports.path = thePath;
exports.handler = function(request,response,state) {
  const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
  const authorised = $tw.Bob.AccessCheck('RootWiki', token, 'view', 'wiki');

  // build the status object
  const status = {
    logged_in: (authorised && (authorised !== true)) ? 'yes' : 'no',
    username: undefined,
    authentication_level: undefined,
    tiddlywiki_version: $tw.version,
    bob_version: $tw.Bob.version,
    read_only: false,
    available_wikis: $tw.ServerSide.getViewableWikiList({decoded: authorised}),
    available_themes: $tw.ServerSide.getViewableThemesList({decoded: authorised}),
    available_plugins: $tw.ServerSide.getViewablePluginsList({decoded: authorised}),
    available_languages: $tw.ServerSide.getViewableLanguagesList({decoded: authorised}),
    available_editions: $tw.ServerSide.getViewableEditionsList({decoded: authorised}),
    settings: $tw.ServerSide.getViewableSettings({decoded: authorised}),
    profile: {}
  }
  response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*"});
  response.end(JSON.stringify(status));
}

}());
