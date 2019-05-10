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
		// Enumerate the theme paths
		const languagePaths = $tw.getLibraryItemSearchPaths($tw.config.languagesPath,$tw.config.languagesEnvVar);
		languageInfo = {};
		for(let languageIndex=0; languageIndex<languagePaths.length; languageIndex++) {
			const languagePath = path.resolve(languagePaths[languageIndex]);
			// Enumerate the folders
			try {
				const languages = fs.readdirSync(languagePath);
				languages.forEach(function(language) {
					// Check if directories have a valid plugin.info
					if(!languageInfo[language] && $tw.utils.isDirectory(path.resolve(languagePath,language))) {
						let info = false;
						try {
							info = JSON.parse(fs.readFileSync(path.resolve(languagePath,language,"plugin.info"),"utf8"));
						} catch(ex) {
						}
						if(info) {
							languageInfo[language] = info;
						}
					}
				})
			} catch (e) {
				if(e.code === 'ENOENT') {
					console.log('No Languages Folder ' + languagePaths[languageIndex]);
				} else {
					console.log('Error getting language info', e);
				}
			}
		}
	}
	return languageInfo;
};

})();
