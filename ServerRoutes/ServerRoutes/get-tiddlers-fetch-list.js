/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-fetch-list.js
type: application/javascript
module-type: serverroute

get /^\/api\/tiddlers\/fetch\/list\/<<wikiName>>\/?$/

fetch a list of tiddlers returned by a filter

params: ?filter=<<someFilter>>

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "GET";

exports.path = /^\/api\/tiddlers\/fetch\/list\/(.+?)\/?$/;

exports.handler = function(request,response,state) {
  if($tw.settings.API.enableFetch === 'yes') {
    const wikiName = request.params[0];
    const URL = require('url');
    const parsed = URL.parse(request.url);
    const params = {};
    if(typeof parsed.query !== 'string') {
      response.writeHead(403).end();
    }
    parsed.query.split('&').forEach(function(item) {
      const parts = item.split('=');
      params[parts[0]] = decodeURIComponent(parts[1]);
    });
    if(!params['filter']) {
      response.writeHead(403).end();
    }
    // Make sure that the person has access to the wiki
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const authorised = $tw.Bob.AccessCheck(wikiName, token, 'view', 'wiki');
    if(authorised) {
      let list = [];
      let data = {};
      // Make sure that the wiki is listed
      if($tw.settings.wikis[wikiName] || wikiName === 'RootWiki') {
        // Make a temp wiki to run the filter on
        let tempWiki = new $tw.Wiki();
        // If the wiki isn't loaded than load it
        if(!$tw.Bob.Wikis[wikiName]) {
          $tw.syncadaptor.loadWiki(wikiName);
        } else if($tw.Bob.Wikis[wikiName].State !== 'loaded') {
          $tw.syncadaptor.loadWiki(wikiName);
        }
        // Make sure that the wiki exists and is loaded
        if($tw.Bob.Wikis[wikiName]) {
          if($tw.Bob.Wikis[wikiName].State === 'loaded') {
            // Use the filter
            list = $tw.Bob.Wikis[wikiName].wiki.filterTiddlers(params.filter);
          }
        }
        let tiddlers = {};
        let info = {};
        list.forEach(function(title) {
          const tempTid = $tw.Bob.Wikis[wikiName].wiki.getTiddler(title);
          info[title] = {};
          if(params.fields) {
            params.fields.split(' ').forEach(function(field) {
              info[title][field] = tempTid.fields[field];
            })
          } else {
            info[title]['modified'] = tempTid.fields.modified;
          }
        })
        data = {list: list, info: info};
      }
      // Send the info
      data = JSON.stringify(data) || '{"list":[],"info":{}}';
      response.writeHead(200, {"Content-Type": "application/json"})
      response.end(data);
    }
  } else {
    response.writeHead(403).end();
  }
}
}());
