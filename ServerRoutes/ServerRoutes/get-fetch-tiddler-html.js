/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-fetch-tiddler-html.js
type: application/javascript
module-type: serverroute

GET /^\/api\/fetch\/tiddler\/html\/?$/

The wiki and tiddler can be given either via headers or url parameters

localhost:8080/api/fetch/tiddler/html?wiki=some/wiki/name&tiddler=some-tiddler

Get a tiddler rendered as html

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "GET";

exports.path = /^\/api\/fetch\/tiddler\/html\/?$/;

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
    })
		const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
		// make sure that the wiki exists
		const exists = $tw.ServerSide.existsListed(params['wiki']);
		const authorised = $tw.Bob.AccessCheck(params['wiki'], token, 'view');
		if(exists && authorised) {
			const fromWiki = params['wiki']
			$tw.ServerSide.loadWiki(fromWiki);
			const tiddler = $tw.Bob.Wikis[fromWiki].wiki.getTiddler(params['tiddler']);
			if(tiddler) {
				let renderType = tiddler.getFieldString("_render_type"),
					renderTemplate = tiddler.getFieldString("_render_template");
				// Tiddler fields '_render_type' and '_render_template' overwrite
				// system wide settings for render type and template
				if($tw.Bob.Wikis[fromWiki].wiki.isSystemTiddler(params['tiddler'])) {
					renderType = renderType || $tw.httpServer.get("system-tiddler-render-type");
					renderTemplate = renderTemplate || $tw.httpServer.get("system-tiddler-render-template");
				} else {
					renderType = renderType || $tw.httpServer.get("tiddler-render-type");
					renderTemplate = renderTemplate || $tw.httpServer.get("tiddler-render-template");
				}
				let text = $tw.Bob.Wikis[fromWiki].wiki.renderTiddler(renderType,renderTemplate,{parseAsInline: true, variables: {currentTiddler: params['tiddler']}});
				// Naughty not to set a content-type, but it's the easiest way to ensure the browser will see HTML pages as HTML, and accept plain text tiddlers as CSS or JS
				response.writeHead(200);
				response.end(text,"utf8");
			} else {
				response.writeHead(404);
				response.end("No Tiddler");
			}
		} else {
			response.writeHead(403).end();
		}
	} else {
		response.writeHead(403).end();
	}
};

}());
