/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/post-upload.js
type: application/javascript
module-type: serverroute

POST /^\/api\/upload\/?$/

Upload media

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "POST";

exports.path = /^\/api\/upload\/?$/;

exports.handler = function(request,response,state) {
  const fs = require('fs')
  const path = require('path')
  const buffer = require('buffer')
  $tw.settings.API = $tw.settings.API || {};
  const authorised = $tw.Bob.AccessCheck(decodeURIComponent(request.headers['x-wiki-name']), response, 'upload', 'wiki');
  if (authorised) {
    let body = ''
    request.on('data', function(chunk){
      body += chunk;
      // We limit the size of an upload to 10mb for now.
      if(body.length > 10e6) {
        response.writeHead(413, {'Content-Type': 'text/plain'}).end();
        request.connection.destroy();
      }
    });
    request.setTimeout(5000, function() {
      request.writeHead(400);
      request.end();
    });
    request.on('end', function() {
      try {
        let bodyData = JSON.parse(body)
        if(bodyData.wiki !== decodeURIComponent(request.headers['x-wiki-name'])) {
          if(!$tw.Bob.AccessCheck(bodyData.wiki, response, 'upload', 'wiki')) {
            request.writeHead(400).end();
            $tw.Bob.logger.log("Missing permissions to upload a file.", {level: 3});
            return;
          }
        }
        const filesPath = path.resolve($tw.syncadaptor.getWikiPath(bodyData.wiki), 'files');
        $tw.utils.createDirectory(filesPath);
        const buf = Buffer.from(bodyData.tiddler.fields.text,'base64');
        fs.writeFile(path.join(filesPath, bodyData.tiddler.fields.title), buf, function(error) {
          if(error) {
            response.writeHead(500).end();
            $tw.Bob.logger.error(error, {level: 2});
          } else {
            $tw.Bob.logger.log("File saved on server: ", bodyData.tiddler.fields.title, {level: 3});
            // Send browser message letting the person know that the file has been uploaded.
            response.writeHead(200).end();
          }
        });
      } catch (e) {
        $tw.Bob.logger.error('Error parsing uploaded file', e, {'level': 2});
        response.writeHead(400).end();
      }
    })
  } else {
    $tw.Bob.logger.log("Missing permissions to upload a file.", {level: 3});
    response.writeHead(400).end();
  }
};

}());
