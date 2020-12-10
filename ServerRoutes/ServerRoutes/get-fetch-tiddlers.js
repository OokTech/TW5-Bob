/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-fetch-tiddler.js
type: application/javascript
module-type: serverroute

GET /^\/api\/fetch\/?$/

fetch tiddlers

parameters: wiki, filter, tiddler

examples:

localhost:8080/api/fetch/tiddlers?wiki=someWiki&filter=[tag[foo]]
localhost:8080/api/fetch/tiddlers?wiki=someWiki&tiddler=tidName

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "GET";

exports.path = /^\/api\/fetch\/tiddlers\/?$/;

exports.handler = function(request,response,state) {
  if($tw.settings.API.enableFetch === 'yes') {
    const URL = require('url')
    const parsed = URL.parse(request.url);
    const params = {};
    if(typeof parsed.query !== 'string') {
      response.writeHead(403).end();
    }
    parsed.query.split('&').forEach(function(item) {
      const parts = item.split('=');
      params[parts[0]] = parts[1];
    })
    let list = []
    let data = {}
    response.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"})
    try {
      if(params.filter && params.wiki) {
        // Make sure that the person has access to the wiki
        const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
        const authorised = $tw.Bob.AccessCheck(params.wiki, token, 'view', 'wiki');
        if(authorised) {
          // Make sure that the wiki is listed
          if($tw.settings.wikis[params.wiki] || params.wiki === 'RootWiki') {
            // If the wiki isn't loaded than load it
            if(!$tw.Bob.Wikis[params.wiki]) {
              $tw.ServerSide.loadWiki(params.wiki);
            } else if($tw.Bob.Wikis[params.wiki].State !== 'loaded') {
              $tw.ServerSide.loadWiki(params.wiki);
            }
            // Make sure that the wiki exists and is loaded
            if($tw.Bob.Wikis[params.wiki]) {
              if($tw.Bob.Wikis[params.wiki].State === 'loaded') {
                list = $tw.Bob.Wikis[params.wiki].wiki.filterTiddlers(params.filter);
              }
            }
          }
        }
        let tiddlers = {};
        let info = {};
        list.forEach(function(title) {
          const tempTid = $tw.Bob.Wikis[params.wiki].wiki.getTiddler(title);
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
