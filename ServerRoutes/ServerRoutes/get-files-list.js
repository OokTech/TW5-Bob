/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-files-list.js
type: application/javascript
module-type: serverroute

GET /^\/api\/files\/list\/?$/

Returns the list of globally available files

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const thePath = /^\/api\/files\/list\/?$/;
exports.method = "GET";
exports.path = thePath;
exports.handler = function(request,response,state) {
  if($tw.settings.enableFileServer === 'yes') {
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const authorised = $tw.Bob.AccessCheck("", token, 'view', 'wiki');
    if(authorised) {
      const data = {
        folder: "",
        wiki: "",
        decoded: authorised,
        mediaTypes: ""
      }
      // if there is no fullName this lists the files in the globally
      // available folders. This is the default files folder and any
      // additional folders set up to serve files.
      // if there is a fullName this lists the files in the files folder for
      // that wiki.
      $tw.ServerSide.listFiles(data, cb);
      function cb(prefix, items) {
        const text = JSON.stringify({
          prefix:prefix,
          files:items
        })
        response.writeHead(200, {"Content-Type": 'application/json'});
        response.end(text,"utf8");
      }
    }
  }
}
}());
