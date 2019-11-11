/*\
title: $:/plugins/Bob/ServerRoutes/post-push.js
type: application/javascript
module-type: serverroute

POST /^\/api\/push$/

Push tiddlers to the server

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "POST";

exports.path = new RegExp('^\/api\/push');

exports.handler = function(request,response,state) {
  $tw.settings.API = $tw.settings.API || {};
  if ($tw.settings.API.enablePush === 'yes') {
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
        let bodyData = JSON.parse(body)
        // Make sure that the token sent here matches the https header
        // and that the token has push access to the toWiki
        const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
        const authorised = $tw.Bob.AccessCheck(bodyData.toWiki, token, 'push');
        if(authorised) {
          if($tw.settings.wikis[bodyData.toWiki] || bodyData.toWiki === 'RootWiki') {
            $tw.ServerSide.loadWiki(bodyData.toWiki);
            // Make sure that the wiki exists and is loaded
            if($tw.Bob.Wikis[bodyData.toWiki]) {
              if($tw.Bob.Wikis[bodyData.toWiki].State === 'loaded') {
                if(bodyData.tiddlers && bodyData.toWiki) {
                  Object.keys(bodyData.tiddlers).forEach(function(title) {
                    bodyData.tiddlers[title].fields.modified = $tw.utils.stringifyDate(new Date(bodyData.tiddlers[title].fields.modified));
                    bodyData.tiddlers[title].fields.created = $tw.utils.stringifyDate(new Date(bodyData.tiddlers[title].fields.created));
                    $tw.syncadaptor.saveTiddler(bodyData.tiddlers[title], bodyData.toWiki);
                  });
                  response.writeHead(200)
                  response.end()
                }
              }
            }
          }
        } else {
          response.writeHead(400)
          response.end()
        }
      } catch (e) {
        response.writeHead(400)
        response.end()
      }
    })
  }
};

}());
