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

  // switch this to use promeses, as annoying as they are
  const thePromises = [
    $tw.syncadaptor.getViewablePluginsList({decoded: authorised}),
    $tw.ServerSide.getViewableWikiList({decoded: authorised}),
    $tw.syncadaptor.getViewableThemesList({decoded: authorised}),
    $tw.ServerSide.getViewableLanguagesList({decoded: authorised}),
    $tw.ServerSide.getViewableEditionsList({decoded: authorised}),
    $tw.ServerSide.getViewableSettings({decoded: authorised}),
  ]
  Promise.all(thePromises)
  .then(function(theData) {
    // build the status object
    const status = {
      logged_in: (authorised && (authorised !== true)) ? 'yes' : 'no',
      username: undefined,
      authentication_level: undefined,
      tiddlywiki_version: $tw.version,
      bob_version: $tw.Bob.version,
      read_only: false,
      available_plugins: theData[0],
      available_wikis: theData[1],
      available_themes: theData[2],
      available_languages: theData[3],
      available_editions: theData[4],
      settings: theData[5],
      profile: {}
    }
    response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*"});
    response.end(JSON.stringify(status));
  })
}

}());
