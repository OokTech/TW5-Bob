/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-files-list-path.js
type: application/javascript
module-type: serverroute

GET /^\/api\/files\/list\/path\/<<prefix>>/

Returns the list of globally avilable files in a non-default path

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const thePath = /^\/api\/files\/list\/path\/(.+?)\/?$/;
exports.method = "GET";
exports.path = thePath;
exports.handler = function(request,response,state) {
  if($tw.settings.enableFileServer === 'yes') {
    const path = require('path');
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const authorised = $tw.Bob.AccessCheck("", token, 'view', 'wiki');
    if(authorised) {
      $tw.settings.fileURLPrefix = $tw.settings.fileURLPrefix || 'files'
      const data = {
        //folder:  path.join($tw.settings.fileURLPrefix,state.params[0]),
        folder:  path.join($tw.settings.fileURLPrefix,request.params[0]),
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
    } else {
      response.writeHead(404).end();
    }
  }
}
}());
