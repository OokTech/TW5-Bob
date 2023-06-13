/*\
title: $:/plugins/OokTech/Bob/ServerRoutes/get-files.js
type: application/javascript
module-type: serverroute

GET /^\/files\/<<filename>>/

GET /^\/<<wikiName\/files\/<<filename>>\/?/

Returns a media file

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "GET";

// Start with the same base path as the --listen command
let pathRegExp = /^\/?(.*)(?<!api\/.*)(?:\/files\/)(.+)/;
if(typeof $tw.settings.fileURLPrefix === 'string' && $tw.settings.fileURLPrefix !== 'files' && ($tw.settings.fileURLPrefix !== '' || $tw.settings.accptance === "I Will Not Get Tech Support For This")) {
  if($tw.settings.fileURLPrefix === '') {
    pathRegExp = new RegExp('^/.+$');
  } else {
    pathRegExp = new RegExp('^\/?(.*)\/' + $tw.settings.fileURLPrefix + '\/.+$');
  }
}

exports.path = pathRegExp;

exports.handler = function(request,response,state) {
  if($tw.settings.enableFileServer === 'yes') {
    const filePathRoot = $tw.syncadaptor.getFilePathRoot();
    $tw.settings.servingFiles = $tw.settings.servingFiles || {};
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
    const filePrefix = $tw.settings.fileURLPrefix?$tw.settings.fileURLPrefix:'files';
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
    let secondPathPart = '';
    if($tw.settings.servingFiles[urlPieces[urlPieces.indexOf(filePrefix)+1]]) {
      secondPathPart = $tw.settings.servingFiles[urlPieces[urlPieces.indexOf(filePrefix)+1]];
      offset += 1;
    }
    const filePath = decodeURIComponent(urlPieces.slice(urlPieces.indexOf(filePrefix)+offset).join('/'));
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const authorised = $tw.Bob.AccessCheck(wikiName, token, 'view', 'wiki');
    if(authorised && ok) {
      const basePath = $tw.syncadaptor.getBasePath();
      let pathRoot = path.resolve(basePath,filePathRoot);
      if(typeof wikiName === 'string' && wikiName !== '') {
        pathRoot = path.resolve($tw.syncadaptor.getWikiPath(wikiName), 'files');
      }
      const pathname = path.resolve(pathRoot, secondPathPart, filePath);
      // Make sure that someone doesn't try to do something like ../../ to get to things they shouldn't get.
      if(pathname.startsWith(pathRoot) || pathname.startsWith(secondPathPart)) {
        fs.exists(pathname, function(exists) {
          if(!exists || fs.statSync(pathname).isDirectory()) {
            response.statusCode = 404;
            response.end();
          }
          const ext = path.parse(pathname).ext.toLowerCase();
          const mimeMap = $tw.settings.mimeMap || {
            '.aac': 'audio/aac',
            '.avi': 'video/x-msvideo',
            '.csv': 'text/csv',
            '.doc': 'application/msword',
            '.epub': 'application/epub+zip',
            '.gif': 'image/gif',
            '.html': 'text/html',
            '.htm': 'text/html',
            '.ico': 'image/x-icon',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.mp3': 'audio/mpeg',
            '.mpeg': 'video/mpeg',
            '.oga': 'audio/ogg',
            '.ogv': 'video/ogg',
            '.ogx': 'application/ogg',
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.svg': 'image/svg+xml',
            '.weba': 'audio/weba',
            '.webm': 'video/webm',
            '.wav': 'audio/wav',
            '.md': 'text/markdown'
          };
          // Special handling for streaming video types
          // ref: https://gist.github.com/paolorossi/1993068
          if(mimeMap[ext] || ($tw.settings.allowUnsafeMimeTypes && $tw.settings.accptance === "I Will Not Get Tech Support For This")) {
            fs.stat(pathname, function(err, stat) {
              if(err) {
                $tw.Bob.logger.error(err, {level:1})
                response.statusCode = 500;
                response.end();
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
                  response.writeHead(206, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': mimeMap[ext] });
                  file.pipe(response);
                } else {
                  response.writeHead(200, { 'Content-Length': total, 'Content-Type': mimeMap[ext] });
                  fs.createReadStream(pathname).pipe(response);
                }
              }
            })
          } else {
            response.writeHead(403);
            response.end();
          }
        })
      }
    }
  }
}
}());
