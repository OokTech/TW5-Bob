/*\
title: $:/plugins/Bob/ServerRoutes/post-upload.js
type: application/javascript
module-type: serverroute

POST /^\/api\/upload/

Upload media

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "POST";

exports.path = new RegExp('^\/api\/upload');

exports.handler = function(request,response,state) {
  const fs = require('fs')
  const path = require('path')
  const buffer = require('buffer')
  $tw.settings.API = $tw.settings.API || {};
  let body = ''
  request.on('data', function(chunk){
    body += chunk;
    // We limit the size of an upload to 10mb for now.
    if(body.length > 10e6) {
      response.writeHead(413, {'Content-Type': 'text/plain'}).end();
      request.connection.destroy();
    }
  });
  request.on('end', function() {
    try {
      let bodyData = JSON.parse(body)
      // Make sure that the token sent here matches the https header
      // and that the token has upload access to the toWiki
      const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
      const authorised = $tw.Bob.AccessCheck(bodyData.wiki, token, 'upload');
      if(authorised) {
        /*
        let filesPath;
        const basePath = $tw.ServerSide.getBasePath();
        let midPath;
        if(bodyData.storeIn !== 'wiki') {
          console.log(7)
          midPath = path.join($tw.settings.wikisPath, bodyData.wiki);
        } else {
          console.log(8)
          midPath = $tw.settings.filePathRoot;
        }
        filesPath = path.resolve(basePath, midPath, 'files');
        */
        const filesPath = path.resolve($tw.ServerSide.getWikiPath(bodyData.wiki), 'files');
        var buf = Buffer.from(bodyData.tiddler.fields.text,'base64');
        fs.writeFile(path.join(filesPath, bodyData.tiddler.fields.title), buf, function(error) {
          if (error) {
            console.log(error);
          } else {
            console.log("C'est fini!");
            return true;
          }
        });
      } else {
        response.writeHead(400);
        response.end();
      }
    } catch (e) {
      $tw.Bob.logger.error('Error parsing uploaded file', e, {'level': 2});
      response.writeHead(400);
      response.end();
    }
  })
};

}());
