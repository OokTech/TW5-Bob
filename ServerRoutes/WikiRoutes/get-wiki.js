/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-wiki.js
type: application/javascript
module-type: wikiroute

GET /^\/$/
GET /^\/<<fullname>>\/?$/

Returns a wiki

return a function that takes the fullname as the input and returns the route info

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

module.exports = function (fullName) {
  const thePath = (!fullName || fullName === 'RootWiki' || fullName === '')?new RegExp('^\/$'):new RegExp('^\/' + fullName + '\/?$');
  return {
    method: "GET",
    path: thePath,
    handler: function(request,response,state) {
      $tw.settings['ws-server'] = $tw.settings['ws-server'] || {}
      const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
      const authorised = $tw.Bob.AccessCheck(fullName, token, 'view', 'wiki');
      let text;
      if(authorised) {
        // Make sure we have loaded the wiki tiddlers.
        // This does nothing if the wiki is already loaded.
        $tw.syncadaptor.loadWiki(fullName, function(exists) { 
          if(exists) {
            // Check if the external server exists, if so check if there is a
            // decoded token.
            // This allows you to only serve the plugin to logged in people if
            // you have a secure server, so everyone else gets read-only versions
            // of public wikis.
            const loggedIn = (!$tw.ExternalServer || request.decoded || ($tw.ExternalServer && $tw.settings.wsserver.servePluginWithoutLogin !== 'no'))
            // If servePlugin is not false than we strip out the filesystem
            // and tiddlyweb plugins if they are there and add in the
            // Bob plugin.
            const servePlugin = (($tw.settings['ws-server'].servePlugin !== 'no') && loggedIn) ? 'yes' : 'no';
            // Get the full text of the html wiki to send as the response.
            $tw.ServerSide.prepareWiki(fullName, servePlugin, 'yes', function(text) {
              request.settings['ws-server'] = request.settings['ws-server'] || {};
              response.writeHead(200, {"Content-Type": request.settings['ws-server'].serveType || "text/html"});
              response.end(text,"utf8");
            });
          } else {
            text = "<html><p>No wiki found! Either there is no usable tiddlywiki.info file in the listed location or it isn't listed.</p></html>"
            request.settings['ws-server'] = request.settings['ws-server'] || {};
            response.writeHead(200, {"Content-Type": request.settings['ws-server'].serveType || "text/html"});
            response.end(text,"utf8");
          }
        });
      }
    }
  }
}

}());
