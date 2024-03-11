/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-backups.js
type: application/javascript
module-type: serverroute

GET /^\/<<wikiName\/backups\/<<filename>>\/?/

Returns a media file

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "GET";

// Start with the same base path as the --listen command
let pathRegExp = /^\/?(.*)(?<!api\/.*)(?:\/backups\/)(.+)/;
$tw.settings.backups = $tw.settings.backups || {}
if(typeof $tw.settings.backups.URLPrefix === 'string' && $tw.settings.backups.URLPrefix !== 'backups' && ($tw.settings.backups.URLPrefix !== '' || $tw.settings.accptance === "I Will Not Get Tech Support For This")) {
  if($tw.settings.backups.URLPrefix === '') {
    pathRegExp = new RegExp('^/.+$');
  } else {
    pathRegExp = new RegExp('^\/?(.*)\/' + $tw.settings.backups.URLPrefix + '\/.+$');
  }
}

exports.path = pathRegExp;

exports.handler = function(request,response,state) {
  if($tw.settings.backups.enable === 'yes') {
    //$tw.settings.servingFiles = $tw.settings.servingFiles || {};
    const path = require('path');
    const fs = require('fs');
    const URL = require('url');
    const strippedURL = request.url.replace($tw.settings['ws-server'].pathprefix,'').replace(/^\/*/, '');
    const wikiName = $tw.ServerSide.findName(strippedURL);
    // Check to see if the wiki matches the referer url, if not respond with a 403 if the setting is set
    let referer = {path: ""}
    try {
      referer = URL.parse(request.headers.referer);
    } catch(e) {

    }
    const filePrefix = $tw.settings.backups.URLPrefix?$tw.settings.backups.URLPrefix:'backups';
    if($tw.settings.perWikiFiles === 'yes'
      && !(request.url.startsWith(path.join(referer.path,filePrefix)) || ((wikiName === 'RootWiki' || wikiName === '') && request.url.startsWith(path.join(referer.path, 'RootWiki', filePrefix))))
      && !(strippedURL.startsWith(filePrefix) && (wikiName === filePrefix || wikiName === ''))) {
      // return 403
      response.writeHead(403);
      response.end();
      return;
    }
    let urlPieces = request.url.split('/');
    // Check to make sure that the wiki name actually matches the URL
    // Without this you could put in foo/bar/baz and get files from
    // foo/bar if there was a wiki tehre and not on foo/bar/baz and then
    // it would break when someone made a wiki on foo/bar/baz
    // If there isn't a wiki name before the file prefix the files are
    // available to all wikis.
    let ok = (strippedURL.split('/')[0] === filePrefix);
    if(!ok && wikiName === '') {
      ok = request.url.startsWith(path.join(referer.path, 'RootWiki', filePrefix));
    } else if(!ok && wikiName !== '') {
      ok = (strippedURL.split('/')[wikiName.split('/').length] === filePrefix);
    }
    let offset = 1;
    const filePath = decodeURIComponent(urlPieces.slice(urlPieces.indexOf(filePrefix)+offset).join('/'));
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const authorised = $tw.Bob.AccessCheck(wikiName, token, 'view', 'wiki');
    if(authorised && ok) {
      const basePath = $tw.syncadaptor.getBasePath();
      const pathname = path.resolve(basePath, 'backups', wikiName, filePath);
      // Make sure that someone doesn't try to do something like ../../ to get to things they shouldn't get.
      fs.exists(pathname, function(exists) {
        if(!exists || fs.statSync(pathname).isDirectory()) {
          response.statusCode = 404;
          response.end();
        }
        const ext = path.parse(pathname).ext.toLowerCase();
        // Special handling for streaming video types
        // ref: https://gist.github.com/paolorossi/1993068
        if(ext === '.html' || ext === '.htm' || ($tw.settings.allowUnsafeMimeTypes && $tw.settings.accptance === "I Will Not Get Tech Support For This")) {
          fs.stat(pathname, function(err, stat) {
            if(err) {
              $tw.Bob.logger.error(err, {level:1})
              if(err.code === 'ENOENT') {
                response.statusCode = 404;
                response.end("This File Doesn't Exist")
              } else {
                response.statusCode = 500;
                response.end();
              }
            } else {
              const total = stat.size;
              if(request.headers['range']) {
                const range = request.headers.range;
                const parts = range.replace(/bytes=/, "").split("-");
                const partialstart = parts[0];
                const partialend = parts[1];
                const start = parseInt(partialstart, 10);
                const end = partialend ? parseInt(partialend, 10) : total-1;
                const chunksize = (end-start)+1;
                const file = fs.createReadStream(pathname, {start: start, end: end});
                response.writeHead(206, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'text/html' });
                file.pipe(response);
              } else {
                response.writeHead(200, { 'Content-Length': total, 'Content-Type': 'text/html' });
                fs.createReadStream(pathname).pipe(response);
              }
            }
          })
        } else {
          response.writeHead(403);
          response.end();
        }
      })
    } else {
      response.writeHead(403);
      response.end();
    }
  } else {
    response.writeHead(403);
    response.end()
  }
}
}());
