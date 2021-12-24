/*\
title: $:/plugins/OokTech/Bob/edition-info-safe.js
type: application/javascript
module-type: utils-node

Information about the available editions

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const fs = require("fs");
const path = require("path");

let editionInfo = undefined;

exports.getEditionInfoSafe = function() {
  // Enumerate the language paths
  $tw.Bob.logger.log('Getting edition paths', {level:4});
  const editionPaths = $tw.getLibraryItemSearchPaths($tw.config.editionsPath,$tw.config.editionsEnvVar);
  editionInfo = {};
  for(let editionIndex=0; editionIndex<editionPaths.length; editionIndex++) {
    const languagePath = path.resolve(editionPaths[editionIndex]);
    $tw.Bob.logger.log('Getting info for edition from ', editionPaths[editionIndex], {level:4});
    // Enumerate the folders
    try {
      const editions = fs.readdirSync(languagePath);
      editions.forEach(function(language) {
        // Check if directories have a valid plugin.info
        if(!editionInfo[language] && $tw.utils.isDirectory(path.resolve(languagePath,language))) {
          let info = false;
          try {
            info = JSON.parse(fs.readFileSync(path.resolve(languagePath,language,"plugin.info"),"utf8"));
            $tw.Bob.logger.log('Got info for ', language, {level: 4});
          } catch(ex) {
            $tw.Bob.logger.error('Reading language info failed ', ex, {level: 3});
            $tw.Bob.logger.error('Failed to read language ', language, {level:4})
          }
          if(info) {
            editionInfo[language] = info;
          }
        }
      })
    } catch (e) {
      if(e.code === 'ENOENT') {
        $tw.Bob.logger.log('No editions Folder ' + editionPaths[editionIndex], {level:3});
      } else {
        $tw.Bob.logger.error('Error getting language info', e, {level:2});
      }
    }
  }
  return editionInfo;
};

})();
