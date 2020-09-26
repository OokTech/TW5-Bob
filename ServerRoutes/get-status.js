/*\
title: $:/plugins/Bob/ServerRoutes/get-status.js
type: application/javascript
module-type: wikiroute

GET /^\/api\/status\/?/

Returns server status information

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

module.exports = function(fullName) {
  const thePath = new RegExp('^\/api\/status');
  return {
    method: "GET",
    path: thePath,
    handler: function(request,response,state) {
      const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
      const authorised = $tw.Bob.AccessCheck('RootWiki', token, 'view');
      const availableWikis = $tw.ServerSide.getViewableWikiList({decoded: authorised});

      // build the status object
      const status = {
        logged_in: authorised && (authorised !== true),
        username: "",
        authentication_level: "Guest",
        available_wikis: availableWikis,
        tiddlywiki_version: $tw.version,
        bob_version: $tw.Bob.version,
        read_only: false,
        available_themes: $tw.ServerSide.getViewableThemesList({decoded: authorised}),
        available_plugins: $tw.ServerSide.getViewablePluginsList({decoded: authorised}),
        available_languages: $tw.ServerSide.getViewableLanguagesList({decoded: authorised}),
        available_editions: $tw.ServerSide.getViewableEditionsList({decoded: authorised}),
        settings: $tw.ServerSide.getViewableSettings()
      }
      response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*"});
      response.end(JSON.stringify(status));
    }
  }
}

}());
