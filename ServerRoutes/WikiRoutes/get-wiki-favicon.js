/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-wiki-favicon.js
type: application/javascript
module-type: wikiroute

GET /^\/favicon.ico/
GET /^\/<<fullname>>\/favicon.ico/

Returns the favicon of the root wiki

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

module.exports = function(fullName) {
  const thePath = (!fullName || fullName === 'RootWiki' || fullName === '')?new RegExp('^\/favicon.ico'):new RegExp('^\/' + fullName + '\/favicon.ico');
  return {
    method: "GET",
    path: thePath,
    handler: function(request,response,state) {
      const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
      const authorised = $tw.Bob.AccessCheck(fullName, token, 'view', 'wiki');
      if(authorised) {
        // Load the wiki
        const exists = $tw.syncadaptor.loadWiki(fullName, (result) => {return result});
        let buffer = ''
        if(exists) {
          response.writeHead(200, {"Content-Type": "image/x-icon"});
          if($tw.Bob.Wikis[fullName]) {
            buffer = $tw.Bob.Wikis[fullName].wiki.getTiddlerText('$:/favicon.ico')
          }
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
