/*\
title: $:/plugins/Bob/ServerRoutes/post-fetch.js
type: application/javascript
module-type: serverroute

POST /^\/api\/fetch/

fetch tiddlers

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "POST";

exports.path = new RegExp('^\/api\/fetch');

exports.handler = function(request,response,state) {
  if($tw.settings.API.enableFetch === 'yes') {
    let body = ''
    let list = []
    let data = {}
    //response.setHeader('Access-Control-Allow-Origin', '*')
    response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"})
    request.on('data', function(chunk){
      body += chunk;
      // We limit this to 1mb, it should never be anywhere near that
      // big
      if(body.length > 1e6) {
        response.writeHead(413, {'Content-Type': 'text/plain'}).end();
        request.connection.destroy();
      }
    });
    request.on('end', function() {
      body = body.replace(/^message=/, '')
      try {
        const bodyData = JSON.parse(body)
        if(bodyData.filter && bodyData.fromWiki) {
          // Make sure that the person has access to the wiki
          const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
          const authorised = $tw.Bob.AccessCheck(bodyData.fromWiki, token, 'view');
          if(authorised) {
            // Make sure that the wiki is listed
            if($tw.settings.wikis[bodyData.fromWiki] || bodyData.fromWiki === 'RootWiki') {
              // If the wiki isn't loaded than load it
              if(!$tw.Bob.Wikis[bodyData.fromWiki]) {
                $tw.ServerSide.loadWiki(bodyData.fromWiki);
              } else if($tw.Bob.Wikis[bodyData.fromWiki].State !== 'loaded') {
                $tw.ServerSide.loadWiki(bodyData.fromWiki);
              }
              // Make sure that the wiki exists and is loaded
              if($tw.Bob.Wikis[bodyData.fromWiki]) {
                if($tw.Bob.Wikis[bodyData.fromWiki].State === 'loaded') {
                  list = $tw.Bob.Wikis[bodyData.fromWiki].wiki.filterTiddlers(bodyData.filter);
                }
              }
            }
          }
          let tiddlers = {};
          let info = {};
          list.forEach(function(title) {
            const tempTid = $tw.Bob.Wikis[bodyData.fromWiki].wiki.getTiddler(title);
            tiddlers[title] = tempTid;
            info[title] = {};
            if(bodyData.fieldList) {
              bodyData.fieldList.split(' ').forEach(function(field) {
                info[title][field] = tempTid.fields[field];
              })
            } else {
              info[title]['modified'] = tempTid.fields.modified;
            }
          })
          // Send the tiddlers
          data = {list: list, tiddlers: tiddlers, info: info};
          data = JSON.stringify(data) || "";
          response.end(data);
        }
      } catch (e) {
        data = JSON.stringify(data) || "";
        response.end(data);
      }
    })
  }
}
}());
