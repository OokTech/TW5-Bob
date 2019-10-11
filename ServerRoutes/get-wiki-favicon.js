/*\
title: $:/plugins/Bob/ServerRoutes/get-wiki-favicon.js
type: application/javascript
module-type: wikiroute

GET /^\/$/

Returns the root wiki

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

module.exports = function(fullName) {
  const thePath = (!fullName || fullName === 'RootWiki' || fullName === '')?new RegExp('^\/favicon.ico$'):new RegExp('^\/' + fullName + '\/favicon.ico$');
  return {
    method: "GET",
    path: thePath,
    handler: function(request,response,state) {
      const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
      const authorised = $tw.Bob.AccessCheck('RootWiki', token, 'view');
      if(authorised) {
        // Load the wiki
        const exists = $tw.ServerSide.loadWiki('RootWiki');
        let buffer = ''
        if(exists) {
          response.writeHead(200, {"Content-Type": "image/x-icon"});
          if($tw.Bob.Wikis['RootWiki']) {
            buffer = $tw.Bob.Wikis['RootWiki'].wiki.getTiddlerText('$:/favicon.ico')
          }
        } else {
          buffer = "";
        }
        response.end(buffer,"base64");
      } else {
        response.writeHead(404);
        response.end();
      }
    }
  }
}

}());
