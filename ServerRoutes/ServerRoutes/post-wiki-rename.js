/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/post-wiki-rename.js
type: application/javascript
module-type: serverroute

POST /^\/api\/wiki\/rename\/<<wikiname>>\/?$/

Rename or move a wiki

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const thePath = /^\/api\/wiki\/rename\/(.+?)?$/;
exports.method = "POST";
exports.path = thePath;
exports.handler = function(request,response,state) {
  $tw.settings.API = $tw.settings.API || {};
  if($tw.settings.API.enableCreate === 'yes') {
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const fromName = request.params[0];
    const URL = require('url')
    const parsed = URL.parse(request.url);
    const params = {};
    if(parsed.query) {
      parsed.query.split('&').forEach(function(item) {
        const parts = item.split('=');
        params[parts[0]] = decodeURIComponent(parts[1]);
      })
    }
    const toName = params['newname'];
    const authorised = $tw.Bob.AccessCheck(fromName, token, 'rename', 'wiki');
    if(authorised) {
      const data = {
        decoded: authorised,
        oldWiki: fromName,
        newWiki: toName
      };
      $tw.ServerSide.renameWiki(data, cb);
      function cb(e) {
        if(e) {
          console.log(e)
          response.writeHead(500).end();
        } else {
          response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "x-from-wiki, x-to-wiki"});
          response.end(JSON.stringify({status:'ok'}));
        }
      }
    } else {
      response.writeHead(403);
      response.end();
    }
  }
}

}());
