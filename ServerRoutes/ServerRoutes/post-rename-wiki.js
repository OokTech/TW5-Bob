/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/post-rename-wiki.js
type: application/javascript
module-type: serverroute

POST /^\/api\/rename\/wiki\/?$/

Rename or move a wiki

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const thePath = /^\/api\/rename\/wiki\/?$/;
exports.method = "POST";
exports.path = thePath;
exports.handler = function(request,response,state) {
  $tw.settings.API = $tw.settings.API || {};
  if($tw.settings.API.enableCreate === 'yes') {
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const fromName = request.headers['x-from-wiki'];
    const toName = request.headers['x-to-wiki'];
    const authorised = $tw.Bob.AccessCheck(fromName, token, 'admin');
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
