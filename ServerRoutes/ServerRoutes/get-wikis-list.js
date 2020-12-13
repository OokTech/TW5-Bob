/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-wikis-list.js
type: application/javascript
module-type: serverroute

GET /^\/api\/wikis\/list\/?$/

Returns the list of available wikis

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const thePath = /^\/api\/wikis\/list\/?$/;
exports.method = "GET";
exports.path = thePath;
exports.handler = function(request,response,state) {
  const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
  const authorised = $tw.Bob.AccessCheck("", token, 'view', 'wiki');
  if(authorised) {
    const data = {
      decoded: authorised
    }
    const wikiList = $tw.ServerSide.getViewableWikiList(data);
    const text = JSON.stringify({
      wikis:wikiList
    })
    response.writeHead(200, {"Content-Type": 'application/json'});
    response.end(text,"utf8");
  } else {
    response.writeHead(404).end();
  }
}
}());
