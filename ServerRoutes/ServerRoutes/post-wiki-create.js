/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/post-wiki-create.js
type: application/javascript
module-type: serverroute

POST /^\/api\/wiki\/create\/:wikiname\/?$/

Create a new wiki

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const thePath = /^\/api\/wiki\/create\/(.+?)\/?$/;
exports.method = "POST";
exports.path = thePath;
exports.handler = function(request,response,state) {
  $tw.settings.API = $tw.settings.API || {};
  if($tw.settings.API.enableCreate === 'yes') {
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const URL = require('url')
    const parsed = URL.parse(request.url);
    const params = {};
    if(parsed.query) {
      parsed.query.split('&').forEach(function(item) {
        const parts = item.split('=');
        params[parts[0]] = decodeURIComponent(parts[1]);
      })
    }
    const edition = params['edition'];
    const duplicate = params['duplicate'];
    const authorised = $tw.Bob.AccessCheck('', token, 'create/wiki', 'server');
    if(authorised) {
      const data = {
        decoded: authorised,
        edition: edition,
        fromWiki: duplicate,
        newWiki: request.params[0]

      };
      $tw.syncadaptor.createWiki(data, cb);
      function cb(e) {
        if(e) {
          console.log(e)
          response.writeHead(500, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*"}).end();
        } else {
          response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*"});
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
