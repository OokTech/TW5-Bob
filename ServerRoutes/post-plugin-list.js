/*\
title: $:/plugins/Bob/ServerRoutes/post-plugin-list.js
type: application/javascript
module-type: serverroute

GET /^\/api\/plugins\/list/

fetch a list of available plugins

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "POST";

exports.path = new RegExp('^\/api\/plugins\/list');

exports.handler = function(request,response,state) {
  $tw.settings.API = $tw.settings.API || {};
  if($tw.settings.API.pluginLibrary === 'yes') {
    const getPluginList = function () {
      let pluginList = []
      if(typeof $tw.settings.pluginsPath === 'string') {
        const basePath = $tw.ServerSide.getBasePath();
        const pluginsPath = path.resolve(basePath, $tw.settings.pluginsPath)
        if(fs.existsSync(pluginsPath)) {
          try {
            const pluginAuthors = fs.readdirSync(pluginsPath)
            pluginAuthors.forEach(function (author) {
              const pluginAuthorPath = path.join(pluginsPath, './', author)
              if(fs.statSync(pluginAuthorPath).isDirectory()) {
                const pluginAuthorFolders = fs.readdirSync(pluginAuthorPath)
                for(let t=0; t<pluginAuthorFolders.length; t++) {
                  const fullPluginFolder = path.join(pluginAuthorPath,pluginAuthorFolders[t])
                  const pluginFields = $tw.loadPluginFolder(fullPluginFolder)
                  if(pluginFields) {
                    let readme = ""
                    let readmeText = ''
                    try {
                      // Try pulling out the plugin readme
                      const pluginJSON = JSON.parse(pluginFields.text).tiddlers
                      readme = pluginJSON[Object.keys(pluginJSON).filter(function(title) {
                        return title.toLowerCase().endsWith('/readme')
                      })[0]]
                    } catch (e) {
                      $tw.Bob.logger.error('Error parsing plugin', e, {level:1})
                    }
                    if(readme) {
                      readmeText = readme.text
                    }
                    const nameParts = pluginFields.title.split('/')
                    const name = nameParts[nameParts.length-2] + '/' + nameParts[nameParts.length-1]
                    const listInfo = {
                      name: name,
                      description: pluginFields.description,
                      tiddlerName: pluginFields.title,
                      version: pluginFields.version,
                      author: pluginFields.author,
                      readme: readmeText
                    }
                    pluginList.push(listInfo)
                  }
                }
              }
            })
          } catch (e) {
            $tw.Bob.logger.error('Problem loading plugin', e, {level:1})
          }
        }
      }
      return pluginList
    }
    const token = $tw.Bob.getCookie(request.headers.cookie, 'token');
    const authorised = $tw.Bob.AccessCheck("RootWiki", token, 'list');
    if(authorised) {
      const pluginList = getPluginList()
      //response.setHeader('Access-Control-Allow-Origin', '*')
      response.writeHead(200, {"Access-Control-Allow-Origin": "*"})
      response.end(JSON.stringify(pluginList))
    } else {
      response.writeHead(403)
      response.end()
    }
  }
};

}());
