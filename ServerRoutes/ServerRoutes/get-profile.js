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

const thePath = /^\/api\/profile\/(.+?)\/?$/;
exports.method = "GET";
exports.path = thePath;
exports.handler = function(request,response,state) {
  response.end(JSON.stringify({name:"", aboutMe:"", publicStatus:""}));
}

}());
