/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-status.js
type: application/javascript
module-type: serverroute

GET /^\/api\/profile\/<<profilename>>\/?$/

Returns server status information

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const thePath = /^\/api\/profile\/(.+?)\/?$/;
exports.method = "GET";
exports.path = thePath;
exports.handler = function(request,response,state) {
  response.writeHead(200, {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"})
  response.end(JSON.stringify({name:"", about:"", visibility:""}));
}

}());
