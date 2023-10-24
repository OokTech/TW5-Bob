/*\
title: $:/plugins/OokTech/Bob/NodeBasicHandlers.js
type: application/javascript
module-type: startup

These are message handler functions for the web socket servers. Use this file
as a template for extending the web socket funcitons.

This handles messages sent to the node process.
\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.platforms = ["node"];

exports.startup = function() {
if($tw.node) {
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
  $tw.Bob.Shared = require('$:/plugins/OokTech/Bob/SharedFunctions.js');
  /*
    This handles when the browser sends the list of all tiddlers that currently
    exist in the browser version of the wiki. This is different than the list of
    all tiddlers in files.
  */
  $tw.nodeMessageHandlers.browserTiddlerList = function(data) {
    // Save the list of tiddlers in the browser as part of the $tw object so it
    // can be used elsewhere.
    $tw.BrowserTiddlerList[data.source_connection] = data.titles;
    $tw.Bob.Shared.sendAck(data);
  }

  /*
    For a lazily loaded wiki this gets the skinny tiddler list.
  */
  $tw.nodeMessageHandlers.getSkinnyTiddlers = function(data) {
    $tw.Bob.Shared.sendAck(data);
    // We need at least the name of the wiki
    if(data.wiki) {
      $tw.syncadaptor.loadWiki(data.wiki, function() {
        // Get the skinny tiddlers
        const skinny_tiddlers = []
        $tw.Bob.Wikis[data.wiki].wiki.allTitles().forEach(function(title) {
          if(title.slice(0,3) !== '$:/') {
            const theTid = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(title).getFieldStrings({exclude:['text']})
            if(!theTid.revision) {
              theTid.revision = $tw.Bob.Shared.getTiddlerHash($tw.Bob.Wikis[data.wiki].wiki.getTiddler(title));
            }
            skinny_tiddlers.push(theTid)
          }
        })
        const message = {
          type: 'skinnyTiddlers',
          tiddlers: skinny_tiddlers,
          wiki: data.wiki
        }
        $tw.Bob.Shared.sendMessage(message, data.source_connection)
      });
    }
  }

  /*
    For lazy loading this gets a full tiddler
  */
  $tw.nodeMessageHandlers.getFullTiddler = function(data) {
    console.log('getFullTiddler', data.title)
    $tw.Bob.Shared.sendAck(data);
    $tw.syncadaptor.loadWiki(data.wiki, function() {
      const tiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(data.title)
      if($tw.settings['ws-server'].rootTiddler === '$:/core/save/lazy-all' && tiddler && tiddler.fields && tiddler.fields.type && tiddler.fields.type.startsWith("image/")) {
        // if we are lazy-loading and it is am image tiddler the text part isn't loaded on the back-end so we
        // load the full tiddler from the database
        $tw.syncadaptor.loadTiddler(data.title, data.wiki, function(err, theTid) {
          if (err) {
            console.log(err)
          }
          theTid.revision = $tw.Bob.Shared.getTiddlerHash({fields: theTid})
          if($tw.syncadaptor.name === "WikiDBAdaptor" && theTid.type && theTid.type.startsWith("image/")) {
            // THIS IS VERY IMPORTANT! We need the skinny tiddler list to show the same revision on the image tiddler as is in the browser
            // but the server doesn't have the image so we have to set the revision manually here.
            // this should probably only be done for image tiddlers when the WikiDBAdaptor is used
            $tw.Bob.Wikis[data.wiki].wiki.setText(data.title, 'revision', undefined, theTid.revision)
          }
        
          const message = {
            type: 'loadTiddler',
            tiddler: {fields:theTid} || {}
          }
          $tw.Bob.Shared.sendMessage(message, data.source_connection)  
        })
      } else {
        const message = {
          type: 'loadTiddler',
          tiddler: tiddler || {}
        }
        $tw.Bob.Shared.sendMessage(message, data.source_connection)
      }
    });
  }

  /*
    This responds to a ping from the browser. This is used to check and make sure
    that the browser and server are connected.
    It also echos back any data that was sent. This is used by the heartbeat to
    make sure that the server and browser are still connected.
  */
  $tw.nodeMessageHandlers.ping = function(data) {
    let message = {};
    Object.keys(data).forEach(function (key) {
      message[key] = data[key];
    })
    message.type = 'pong';
    if(data.heartbeat) {
      message.heartbeat = true;
    }
    // When the server receives a ping it sends back a pong.
    const response = JSON.stringify(message);
    $tw.connections[data.source_connection].socket.send(response, function ack(err) {if(err) {console.log('failed to send a ping message')}});
  }

  /*
    This handles saveTiddler messages sent from the browser.

    If we always want to ignore draft tiddlers,
    use `[has[draft.of]]` in $:/plugins/OokTech/Bob/ExcludeSync
  */
  $tw.nodeMessageHandlers.saveTiddler = function(data) {
    // Acknowledge the message.
    $tw.Bob.Shared.sendAck(data);
    // Make sure there is actually a tiddler sent
    if(data.tiddler) {
      // Make sure that the tiddler that is sent has fields
      if(data.tiddler.fields) {
        const prefix = data.wiki || '';
        // Set the saved tiddler as no longer being edited. It isn't always
        // being edited but checking eacd time is more complex than just
        // always setting it this way and doesn't benifit us.
        $tw.nodeMessageHandlers.cancelEditingTiddler({
          tiddler:{
            fields:{
              title:data.tiddler.fields.title
            }
          },
          wiki: prefix
        });
        // If we are not expecting a save tiddler event than save the
        // tiddler normally.
        $tw.syncadaptor.saveTiddler(data.tiddler, prefix, data.source_connection);
        delete $tw.Bob.EditingTiddlers[data.wiki][data.tiddler.fields.title];
        $tw.ServerSide.UpdateEditingTiddlers(false, data.wiki);
      }
    }
  }

  /*
    This is the handler for when the browser sends the saveTiddlers message
  */
  $tw.nodeMessageHandlers.saveTiddlers = function(data) {
    // Acknowledge the message
    $tw.Bob.Shared.sendAck(data);
    // Make sure there is actually tiddler data
    if(data.tiddlers && data.tiddlers.length > 0) {
      const prefix = data.wiki || '';
      data.tiddlers.forEach(function(tiddler) {
        $tw.nodeMessageHandlers.cancelEditingTiddler({
          tiddler:{
            fields:{
              title: tiddler.fields.title
            }
          },
          wiki: prefix
        });
        $tw.syncadaptor.saveTiddler(data.tiddler, prefix, data.source_connection);
        delete $tw.Bob.EditingTiddlers[data.wiki][tiddler.fields.title];
      });
      $tw.ServerSide.UpdateEditingTiddlers(false, data.wiki);
    }
  }

  /*
    This is the handler for when the browser sends the deleteTiddler message.
  */
  $tw.nodeMessageHandlers.deleteTiddler = function(data) {
    // Acknowledge the message.
    $tw.Bob.Shared.sendAck(data);
    $tw.Bob.logger.log('Node Delete Tiddler', {level: 4});
    data.tiddler = data.tiddler || {};
    data.tiddler.fields = data.tiddler.fields || {};
    const title = data.tiddler.fields.title;
    if(title) {
      // Delete the tiddler from the local store (e.g. filesystem, database, etc.)
      $tw.syncadaptor.deleteTiddler(title, {wiki: data.wiki});
      // Remove the tiddler from the list of tiddlers being edited.
      if($tw.Bob.EditingTiddlers[data.wiki][title]) {
        delete $tw.Bob.EditingTiddlers[data.wiki][title];
        $tw.ServerSide.UpdateEditingTiddlers(false, data.wiki);
      }
      $tw.Bob.logger.log('Deleted tiddler', data.tiddler.fields.title)
    }
  }

  /*
    This is the handler for when a browser sends the editingTiddler message.
  */
  $tw.nodeMessageHandlers.editingTiddler = function(data) {
    // Acknowledge the message.
    $tw.Bob.Shared.sendAck(data);
    data.tiddler = data.tiddler || {};
    data.tiddler.fields = data.tiddler.fields || {};
    const title = data.tiddler.fields.title;
    if(title) {
      // Add the tiddler to the list of tiddlers being edited to prevent
      // multiple people from editing it at the same time.
      $tw.ServerSide.UpdateEditingTiddlers(title, data.wiki);
    }
  }

  /*
    This is the handler for when a browser stops editing a tiddler.
  */
  $tw.nodeMessageHandlers.cancelEditingTiddler = function(data) {
    // Acknowledge the message.
    $tw.Bob.Shared.sendAck(data);
    data.tiddler = data.tiddler || {};
    data.tiddler.fields = data.tiddler.fields || {};
    let title = data.tiddler.fields.title;
    if(title) {
      // Make sure that the tiddler title is a string
      if(data.tiddler.fields["draft.of"]) {
        title = data.tiddler.fields["draft.of"]
      }
      // Remove the current tiddler from the list of tiddlers being edited.
      if($tw.Bob.EditingTiddlers[data.wiki][title]) {
        delete $tw.Bob.EditingTiddlers[data.wiki][title];
      }
      $tw.ServerSide.UpdateEditingTiddlers(false, data.wiki);
    }
  }

  /*
    This updates what wikis are being served and where they are being served
  */
  $tw.nodeMessageHandlers.updateRoutes = function (data) {
    $tw.Bob.Shared.sendAck(data);
    // Then clear all the routes to the non-root wiki
    $tw.httpServer.clearRoutes();
    // The re-add all the routes from the settings
    // This reads the settings so we don't need to give it any arguments
    $tw.httpServer.addOtherRoutes();
  }

  /*
    This sends back a list of all wikis that are viewable using the current access token.
  */
  $tw.nodeMessageHandlers.getViewableWikiList = function (data) {
    data = data || {};
    $tw.Bob.Shared.sendAck(data);
    const viewableWikis = $tw.ServerSide.getViewableWikiList(data);
    // Send viewableWikis back to the browser
    const message = {
      type: 'setViewableWikis',
      list: $tw.utils.stringifyList(viewableWikis),
      wiki: data.wiki
    };
    $tw.Bob.SendToBrowser($tw.connections[data.source_connection], message);
  }

  /*
    This looks in the wikis folder set in the configuration
    $tw.setting.wikisPath
    If none is set it uses ./Wikis

    This walks though subfolders too.
  */
  $tw.nodeMessageHandlers.findAvailableWikis = function (data) {
    $tw.Bob.Shared.sendAck(data);
    $tw.syncadaptor.updateWikiListing(data);
  }

  /*
    This handles ack messages.
  */
  $tw.nodeMessageHandlers.ack = $tw.Bob.Shared.handleAck;

}
}
})();