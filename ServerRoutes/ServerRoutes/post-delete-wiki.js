/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/post-delete-wiki.js
type: application/javascript
module-type: serverroute

POST /^\/api\/delete\/wiki\/<<wikiName>>\/?/

Delete a wiki

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const thePath = /^\/api\/delete\/wiki\/(.+?)\/?$/;
exports.method = "POST";
exports.path = thePath;
exports.handler = function(request,response,state) {
  $tw.settings.API = $tw.settings.API || {};
  if($tw.settings.API.enableDelete === 'yes') {
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const deleteChildren = request.headers['x-delete-children'];
    const toDelete = state.params[0];
    const authorised = $tw.Bob.AccessCheck(toDelete, token, 'admin');
    if(authorised) {
      const data = {
        decoded: authorised,
        deleteWiki: toDelete,
        deleteChildren: deleteChildren
      }
      $tw.ServerSide.deleteWiki(data, cb);
      function cb(e) {
        if(e) {
          response.writeHead(500, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*"});
          response.end("{status:'error', error: "+e+"}");
        }
        response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*"});
        response.end("{status:'ok'}");
      }
    } else {
      response.writeHead(403);
      response.end();
    }
  }
}

}());
