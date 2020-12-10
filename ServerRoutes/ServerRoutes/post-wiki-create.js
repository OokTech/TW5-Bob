/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/post-create-wiki.js
type: application/javascript
module-type: serverroute

POST /^\/api\/create\/wiki\/:wikiname\/?$/

Create a new wiki

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const thePath = /^\/api\/create\/wiki\/(.+?)\/?$/;
exports.method = "POST";
exports.path = thePath;
exports.handler = function(request,response,state) {
  $tw.settings.API = $tw.settings.API || {};
  if($tw.settings.API.enableCreate === 'yes') {
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const edition = request.headers['x-edition'];
    const duplicate = request.headers['x-duplicate'];
    const authorised = $tw.Bob.AccessCheck('', token, 'create/wiki', 'server');
    if(authorised) {
      const data = {
        decoded: authorised,
        edition: edition,
        fromWiki: duplicate,
        newWiki: request.params[0]

      };
      $tw.ServerSide.createWiki(data, cb);
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
