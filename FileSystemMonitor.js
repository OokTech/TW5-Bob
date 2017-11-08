/*\
title: $:/plugins/OokTech/MultiUser/FileSystemMonitor.js
type: application/javascript
module-type: startup

This module watches the file system in the tiddlers folder and any changes to
the files in the folder that don't come from the browser are reported to the
browser. So if you make a new .tid file in the tiddlers folder it will appear
in the wiki in the browser without needing to restart the server. You can also
delete files to remove the tiddlers from the browser.

Note: For now this only watches the tiddlers folder that is in the same place
as the tiddlywiki.info file and doesn't watch for changes in any subfolders
inside that folder.
This is due to differences in how different operating systems handle watching
for changes to files.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// require the fs module if we are running node
var fs = $tw.node ? require("fs"): undefined;
var path = $tw.node ? require("path"): undefined;

if (fs) {
  // Initialise objects
  $tw.MultiUser = $tw.MultiUser || {};
  $tw.MultiUser.WaitingList = $tw.MultiUser.WaitingList || {};
  $tw.MultiUser.EditingTiddlers = $tw.MultiUser.EditingTiddlers || {};

  /*
    TODO Create a message that lets us set excluded tiddlers from inside the wikis
    A per-wiki exclude list would be best but that is going to have annoying
    logic so it will come later.
  */
  $tw.MultiUser.ExcludeList = $tw.MultiUser.ExcludeList || ['$:/StoryList', '$:/HistoryList'];
  /*
    Watch the tiddlers folder for chanegs
  */
  fs.watch($tw.boot.wikiTiddlersPath, function (eventType, filename) {
    // Make sure that the file name isn't undefined
    if (filename) {
      // If the event is that the file has been deleted than it won't exist
      // but we still need to act here.
      if(fs.existsSync(`${$tw.boot.wikiTiddlersPath}/${filename}`)) {
        // Load tiddler data from the file
        var tiddlerObject = $tw.loadTiddlersFromFile(`${$tw.boot.wikiTiddlersPath}/${filename}`);
        // Don't update tiddlers on the exclude list
        if (tiddlerObject.tiddlers[0].title && $tw.MultiUser.ExcludeList.indexOf(tiddlerObject.tiddlers[0].title) === -1 && !tiddlerObject.tiddlers[0]['draft.of']) {
          var tiddler = $tw.wiki.getTiddler(tiddlerObject.tiddlers[0].title);
          if (!tiddler) {
            tiddler = new $tw.Tiddler({fields:tiddlerObject.tiddlers[0]});
            $tw.wiki.addTiddler(tiddler);
          }
          var changed = $tw.MultiUser.FileSystemFunctions.TiddlerHasChanged(tiddler, tiddlerObject);
          if (changed) {
            Object.keys($tw.connections).forEach(function(connection) {
              if (!$tw.MultiUser.WaitingList[connection]) {
                $tw.MultiUser.WaitingList[connection] = {};
              }
              $tw.MultiUser.WaitingList[connection][tiddler.fields.title] = true;
            });
            // Update the list of tiddlers currently in the browser
            $tw.connections.forEach(function (connection, index, connections) {
              if (connection.active) {
                var send = false;
                if ($tw.MultiUser.WaitingList[connection]) {
                  if ($tw.MultiUser.WaitingList[connection][tiddlerObject.tiddlers[0].title]) {
                    send = true;
                  } else {
                    $tw.MultiUser.WaitingList[connection] = {};
                    send = true;
                  }
                }
                if (send || true) {
                  try {
                    connection.socket.send(JSON.stringify({type: 'makeTiddler', fields: tiddlerObject.tiddlers[0]}));
                  } catch (err) {
                    console.log(err);
                    $tw.connections[index].active = false;
                  }
                }
              }
            });
          }
        }
      } else {
        console.log('Deleting tiddler')
        // Non draft tiddler has been deleted
        // Send message to every connected wiki to remove the tiddler
        $tw.connections.forEach(function (connection, index, connections) {
          if (connection.active) {
            try {
              connection.socket.send(JSON.stringify({type: 'removeTiddler', title: filename.slice(0,-4)}));
            } catch (err) {
              console.log(err);
              $tw.connections[index].active = false;
            }
          }
        });
      }
    } else {
      console.log('No filename given!');
    }
  });

  $tw.MultiUser.UpdateEditingTiddlers = function (tiddler) {
    if (tiddler && !$tw.MultiUser.EditingTiddlers[tiddler]) {
      $tw.MultiUser.EditingTiddlers[tiddler] = true;
    }
    var tiddlerFields = {title: "$:/MultiUser/EditingTiddlers", list: $tw.utils.stringifyList(Object.keys($tw.MultiUser.EditingTiddlers))};
    $tw.connections.forEach(function (connection, index, connections) {
      if (connection.active) {
        try {
          connection.socket.send(JSON.stringify({type: 'makeTiddler', fields: tiddlerFields}));
        } catch (err) {
          console.log(err);
          $tw.connections[index].active = false;
        }
      }
    });
  }
}

})();
