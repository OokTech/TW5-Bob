/*\
title: $:/plugins/OokTech/Bob/language-info.js
type: application/javascript
module-type: utils-node

Information about the available languages

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const fs = require("fs");
const path = require("path");

let languageInfo = undefined;

exports.getLanguageInfo = function() {
  if(!languageInfo || true) {
    // Enumerate the language paths
    $tw.Bob.logger.error('Getting language paths', {level:4});
    const languagePaths = $tw.getLibraryItemSearchPaths($tw.config.languagesPath,$tw.config.languagesEnvVar);
    languageInfo = {};
    for(let languageIndex=0; languageIndex<languagePaths.length; languageIndex++) {
      const languagePath = path.resolve(languagePaths[languageIndex]);
      $tw.Bob.logger.error('Getting info for language from ', languagePaths[languageIndex], {level:4});
      // Enumerate the folders
      try {
        const languages = fs.readdirSync(languagePath);
        languages.forEach(function(language) {
          // Check if directories have a valid plugin.info
          if(!languageInfo[language] && $tw.utils.isDirectory(path.resolve(languagePath,language))) {
            let info = false;
            try {
              info = JSON.parse(fs.readFileSync(path.resolve(languagePath,language,"plugin.info"),"utf8"));
              $tw.Bob.logger.log('Got info for ', language, {level: 4});
            } catch(ex) {
              $tw.Bob.logger.error('Reading language info failed ', ex, {level: 3});
              $tw.Bob.logger.error('Failed to read language ', language, {level:4})
            }
            if(info) {
              languageInfo[language] = info;
            }
          }
        })
      } catch (e) {
        if(e.code === 'ENOENT') {
          $tw.Bob.logger.log('No Languages Folder ' + languagePaths[languageIndex], {level:3});
        } else {
          $tw.Bob.logger.error('Error getting language info', e, {level:2});
        }
      }
    }
  }
  return languageInfo;
};

})();
