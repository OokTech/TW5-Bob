/*\
title: $:/plugins/OokTech/Bob/plugin-info.js
type: application/javascript
module-type: utils-node

Information about the available plugins

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const fs = require("fs");
const path = require("path");

let pluginInfo;

exports.getPluginInfo = function() {
	if(!pluginInfo || true) {
		// Enumerate the plugin paths
		const pluginPaths = $tw.getLibraryItemSearchPaths($tw.config.pluginsPath,$tw.config.pluginsEnvVar);
		pluginInfo = {};
		for(let pluginIndex=0; pluginIndex<pluginPaths.length; pluginIndex++) {
			const pluginPath = path.resolve(pluginPaths[pluginIndex]);
			// Enumerate the folders
			try {
				const authors = fs.readdirSync(pluginPath);
				for(let authorIndex=0; authorIndex<authors.length; authorIndex++) {
					const pluginAuthor = authors[authorIndex];
          if($tw.utils.isDirectory(path.resolve(pluginPath,pluginAuthor))) {
  	        const pluginNames = fs.readdirSync(path.join(pluginPath,pluginAuthor));
  	        pluginNames.forEach(function(pluginName) {
  	  				// Check if directories have a valid plugin.info
  	  				if(!pluginInfo[pluginAuthor + '/' + pluginName] && $tw.utils.isDirectory(path.resolve(pluginPath,pluginAuthor,pluginName))) {
  	  					let info = false;
  	  					try {
  	  						info = JSON.parse(fs.readFileSync(path.resolve(pluginPath,pluginAuthor, pluginName,"plugin.info"),"utf8"));
  	  					} catch(ex) {
  	  					}
  	  					if(info) {
  	  						pluginInfo[pluginAuthor + '/' + pluginName] = info;
  	  					}
  	  				}
  	        })
          }
				}
			} catch (e) {
				if(e.code === 'ENOENT') {
					$tw.Bob.logger.log('No Plugins Folder ' + pluginPaths[pluginIndex], {level:2});
				} else {
					$tw.Bob.logger.error('Error getting plugin info', e, {level:2})
				}
			}
		}
	}
	return pluginInfo;
};

})();
