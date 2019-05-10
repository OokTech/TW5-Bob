/*\
title: $:/plugins/OokTech/Bob/theme-info.js
type: application/javascript
module-type: utils-node

Information about the available themes

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const fs = require("fs");
const path = require("path");

let themeInfo;

exports.getThemeInfo = function() {
	if(!themeInfo || true) {
		// Enumerate the theme paths
		const themePaths = $tw.getLibraryItemSearchPaths($tw.config.themesPath,$tw.config.themesEnvVar);
		themeInfo = {};
		for(let themeIndex=0; themeIndex<themePaths.length; themeIndex++) {
			const themePath = path.resolve(themePaths[themeIndex]);
			// Enumerate the folders
			try {
				const authors = fs.readdirSync(themePath);
				for(let authorIndex=0; authorIndex<authors.length; authorIndex++) {
					const themeAuthor = authors[authorIndex];
          if($tw.utils.isDirectory(path.resolve(themePath,themeAuthor))) {
  	        const themeNames = fs.readdirSync(path.join(themePath,themeAuthor));
  	        themeNames.forEach(function(themeName) {
  	  				// Check if directories have a valid plugin.info
  	  				if(!themeInfo[themeAuthor + '/' + themeName] && $tw.utils.isDirectory(path.resolve(themePath,themeAuthor,themeName))) {
  	  					let info = false;
  	  					try {
  	  						info = JSON.parse(fs.readFileSync(path.resolve(themePath,themeAuthor, themeName,"plugin.info"),"utf8"));
  	  					} catch(ex) {
  	  					}
  	  					if(info) {
  	  						themeInfo[themeAuthor + '/' + themeName] = info;
  	  					}
  	  				}
  	        })
          }
				}
			} catch (e) {
				if(e.code === 'ENOENT') {
					$tw.Bob.logger.log('No Themes Folder ' + themePaths[themeIndex], {level:2});
				} else {
					$tw.Bob.logger.error('Error getting theme info', e, {level:2});
				}
			}
		}
	}
	return themeInfo;
};

})();
