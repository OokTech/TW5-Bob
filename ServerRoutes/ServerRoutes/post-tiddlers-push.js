/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/post-tiddlers-push.js
type: application/javascript
module-type: serverroute

POST /^\/api\/tiddlers\/push\/:wikiname\/?$/

Push tiddlers to the wiki :wikiname on the server

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "POST";

exports.path = /^\/api\/tiddlers\/push\/(.+?)\/?$/;

exports.handler = function(request,response,state) {
  $tw.settings.API = $tw.settings.API || {};
  if($tw.settings.API.enablePush === 'yes') {
    // Make sure that the token sent here matches the https header
    // and that the token has push access to the toWiki
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const authorised = $tw.Bob.AccessCheck(request.params[0], token, 'push', 'wiki');
    if(authorised) {
      let body = ''
      request.on('data', function(chunk){
        body += chunk;
        // We limit the size of a push to 5mb for now.
        if(body.length > 5e6) {
          response.writeHead(413, {'Content-Type': 'text/plain'}).end();
          request.connection.destroy();
        }
      });
      request.on('end', function() {
        try {
          const bodyData = JSON.parse(body)
          if($tw.syncadaptor.existsListed(request.params[0])) {
            $tw.syncadaptor.loadWiki(request.params[0]);
            // Make sure that the wiki exists and is loaded
            if($tw.Bob.Wikis[request.params[0]]) {
              if($tw.Bob.Wikis[request.params[0]].State === 'loaded') {
                if(bodyData.tiddlers && request.params[0]) {
                  Object.keys(bodyData.tiddlers).forEach(function(title) {
                    bodyData.tiddlers[title].fields.modified = $tw.utils.stringifyDate(new Date(bodyData.tiddlers[title].fields.modified));
                    bodyData.tiddlers[title].fields.created = $tw.utils.stringifyDate(new Date(bodyData.tiddlers[title].fields.created));
                    $tw.syncadaptor.saveTiddler(bodyData.tiddlers[title], request.params[0]);
                  });
                  response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*"}).end('{"status": "ok"}')
                }
              }
            }
          } else {
            response.writeHead(404).end()
          }
        } catch (e) {
          console.log(e)
          response.writeHead(400).end()
        }
      })
    } else {
      response.writeHead(400).end()
    }
  } else {
    response.writeHead(400).end()
  }
};

}());
