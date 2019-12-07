/*\
title: $:/plugins/Bob/ServerRoutes/get-files.js
type: application/javascript
module-type: serverroute

GET /^\/files\/<<filename>>/

Returns a wiki

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "GET";

// Start with the same base path as the --listen command
let pathRegExp = new RegExp('\/files\/.+');
if(typeof $tw.settings.fileURLPrefix === 'string' && ($tw.settings.fileURLPrefix !== '' || $tw.settings.accptance === "I Will Not Get Tech Support For This")) {
  if($tw.settings.fileURLPrefix === '') {
    pathRegExp = new RegExp('^/.+$');
  } else {
    pathRegExp = new RegExp('\/' + $tw.settings.fileURLPrefix + '\/.+$');
  }
}

exports.path = pathRegExp;

function findName(url) {
  const pieces = url.split('/')
  let name = ''
  let settingsObj = $tw.settings.wikis[pieces[0]]
  if(settingsObj) {
    name = pieces[0]
  }
  for (let i = 1; i < pieces.length; i++) {
    if(settingsObj) {
      if(typeof settingsObj[pieces[i]] === 'object') {
        name = name + '/' + pieces[i]
        settingsObj = settingsObj[pieces[i]]
      } else if(typeof settingsObj[pieces[i]] === 'string') {
        name = name + '/' + pieces[i]
        break
      } else {
        break
      }
    }
  }
  if (name === '') {
    name = 'RootWiki'
  }
  return name
}

exports.handler = function(request,response,state) {
  if($tw.settings.enableFileServer === 'yes') {
    $tw.settings.servingFiles = $tw.settings.servingFiles || {};
    const path = require('path');
    const fs = require('fs');
    const wikiName = findName(request.url.replace(/^\//, ''));
    const filePrefix = $tw.settings.fileURLPrefix?$tw.settings.fileURLPrefix:'files';
    let urlPieces = request.url.split('/');
    // Check to make sure that the wiki name actually matches the URL
    // Without this you could put in foo/bar/baz and get files from
    // foo/bar if there was a wiki tehre and not on foo/bar/baz and then
    // it would break when someone made a wiki on foo/bar/baz
    let ok = false;
    if(wikiName !== '' && wikiName !== 'RootWiki') {
      ok = (request.url.replace(/^\//, '').split('/')[wikiName.split('/').length] === filePrefix);
    } else {
      ok = (request.url.replace(/^\//, '').split('/')[0] === filePrefix);
    }
    let offset = 1;
    let secondPathPart = '';
    if ($tw.settings.servingFiles[urlPieces[urlPieces.indexOf(filePrefix)+1]]) {
      secondPathPart = $tw.settings.servingFiles[urlPieces[urlPieces.indexOf(filePrefix)+1]];
      offset += 1;
    }
    const filePath = decodeURIComponent(urlPieces.slice(urlPieces.indexOf(filePrefix)+offset).join('/'));
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const authorised = $tw.Bob.AccessCheck(wikiName, token, 'view');
    if(authorised && ok) {
      const basePath = $tw.ServerSide.getBasePath();
      let pathRoot = path.resolve(basePath,$tw.settings.filePathRoot);
      if(wikiName !== '') {
        pathRoot = path.resolve($tw.ServerSide.getWikiPath(wikiName), 'files');
      }
      const pathname = path.resolve(pathRoot, secondPathPart, filePath);
      // Make sure that someone doesn't try to do something like ../../ to get to things they shouldn't get.
      if(pathname.startsWith(pathRoot) || pathname.startsWith(secondPathPart)) {
        fs.exists(pathname, function(exists) {
          if(!exists || fs.statSync(pathname).isDirectory()) {
            response.statusCode = 404;
            response.end();
          }
          fs.readFile(pathname, function(err, data) {
            if(err) {
              $tw.Bob.logger.error(err, {level:1})
              response.statusCode = 500;
              response.end();
            } else {
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
                '.wav': 'audio/wav'
              };
              if(mimeMap[ext] || ($tw.settings.allowUnsafeMimeTypes && $tw.settings.accptance === "I Will Not Get Tech Support For This")) {
                response.writeHead(200, {"Content-type": mimeMap[ext] || "text/plain"});
                response.end(data);
              } else {
                response.writeHead(403);
                response.end();
              }
            }
          })
        })
      }
    }
  }
}
}());
