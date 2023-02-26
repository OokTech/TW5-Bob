/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-fetch-tiddler.js
type: application/javascript
module-type: serverroute

GET /^\/api\/tiddlers\/fetch\/<<wikiname>>\/?$/

fetch tiddlers

parameters: filter

example:

localhost:8080/api/tiddlers/fetch/someWiki&filter=[tag[foo]]

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "GET";

exports.path = /^\/api\/tiddlers\/fetch\/(.+?)\/?$/;

exports.handler = function(request,response,state) {
  if($tw.settings.API.enableFetch === 'yes') {
    const wikiName = request.params[0];
    const URL = require('url')
    const parsed = URL.parse(request.url);
    const params = {};
    if(typeof parsed.query !== 'string') {
      response.writeHead(403).end();
    }
    parsed.query.split('&').forEach(function(item) {
      const parts = item.split('=');
      params[parts[0]] = decodeURIComponent(parts[1]);
    })
    let list = []
    let data = {}
    response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"})
    try {
      if(params.filter && wikiName) {
        // Make sure that the person has access to the wiki
        const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
        const authorised = $tw.Bob.AccessCheck(wikiName, token, 'view', 'wiki');
        if(authorised) {
          // Make sure that the wiki is listed
          if($tw.settings.wikis[wikiName] || wikiName === 'RootWiki') {
            // If the wiki isn't loaded than load it
            if(!$tw.Bob.Wikis[wikiName]) {
              $tw.syncadaptor.loadWiki(wikiName);
            } else if($tw.Bob.Wikis[wikiName].State !== 'loaded') {
              $tw.syncadaptor.loadWiki(wikiName);
            }
            // Make sure that the wiki exists and is loaded
            if($tw.Bob.Wikis[wikiName]) {
              if($tw.Bob.Wikis[wikiName].State === 'loaded') {
                list = $tw.Bob.Wikis[wikiName].wiki.filterTiddlers(params.filter);
              }
            }
          }
        }
        let tiddlers = {};
        let info = {};
        list.forEach(function(title) {
          const tempTid = $tw.Bob.Wikis[wikiName].wiki.getTiddler(title);
          tiddlers[title] = tempTid;
          info[title] = {};
          if(params.fields) {
            params.fields.split(' ').forEach(function(field) {
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
      } else {
        response.writeHead(403).end();
      }
    } catch (e) {
      console.log(e)
      data = JSON.stringify(data) || "";
      response.end(data);
    }
  } else {
    response.writeHead(403).end();
  }
}
}());
