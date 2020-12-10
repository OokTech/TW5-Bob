/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-fetch-list.js
type: application/javascript
module-type: serverroute

get /^\/api\/fetch\/list\/?$/

fetch a list of tiddlers returned by a filter

params: ?wiki=wikiName&filter=<<someFilter>>&fields=tags

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "GET";

exports.path = /^\/api\/fetch\/list\/?$/;

exports.handler = function(request,response,state) {
  if($tw.settings.API.enableFetch === 'yes') {
    const URL = require('url');
    const parsed = URL.parse(request.url);
    const params = {};
    if(typeof parsed.query !== 'string') {
      response.writeHead(403).end();
    }
    parsed.query.split('&').forEach(function(item) {
      const parts = item.split('=');
      params[parts[0]] = parts[1];
    });
    if(!params['wiki'] || !params['filter']) {
      response.writeHead(403).end();
    }
    // Make sure that the person has access to the wiki
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const authorised = $tw.Bob.AccessCheck(params.wiki, token, 'view', 'wiki');
    if(authorised) {
      let list = [];
      let data = {};
      // Make sure that the wiki is listed
      if($tw.settings.wikis[params.wiki] || params.wiki === 'RootWiki') {
        // Make a temp wiki to run the filter on
        let tempWiki = new $tw.Wiki();
        // If the wiki isn't loaded than load it
        if(!$tw.Bob.Wikis[params.wiki]) {
          $tw.ServerSide.loadWiki(params.wiki);
        } else if($tw.Bob.Wikis[params.wiki].State !== 'loaded') {
          $tw.ServerSide.loadWiki(params.wiki);
        }
        // Make sure that the wiki exists and is loaded
        if($tw.Bob.Wikis[params.wiki]) {
          if($tw.Bob.Wikis[params.wiki].State === 'loaded') {
            // Use the filter
            list = $tw.Bob.Wikis[params.wiki].wiki.filterTiddlers(params.filter);
          }
        }
        let tiddlers = {};
        let info = {};
        list.forEach(function(title) {
          const tempTid = $tw.Bob.Wikis[params.wiki].wiki.getTiddler(title);
          info[title] = {};
          if(params.fields) {
            params.fields.split(',').forEach(function(field) {
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
      response.end(data);
    }
  } else {
    response.writeHead(403).end();
  }
}
}());
