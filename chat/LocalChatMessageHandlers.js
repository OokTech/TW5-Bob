/*\
title: $:/plugins/OokTech/Bob/ChatMessageHandlers.js
type: application/javascript
module-type: startup

These are message handler functions for the federated chat server.
This handles messages sent to the node process.
\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.platforms = ["node"];

exports.startup = function () {
  if($tw.node) {
    $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};

    /*
      Receive a chat message from a browser, they are automatically sent to other connected browsers when the tiddlers are synced.
    */
    $tw.nodeMessageHandlers.chatMessage = function(data) {
      $tw.Bob.Shared.sendAck(data);
      const conversationTiddler = data.conversation || 'DefaultChat'
      if(conversationTiddler && data.message) {
        // Get the history tiddler
        const historyTiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(`$:/chat/${conversationTiddler}`)
        let history = {}
        if(historyTiddler) {
          // Make sure that the fields aren't read only
          history = JSON.parse(JSON.stringify(historyTiddler.fields.text));
        }
        const theTime = $tw.utils.stringifyDate(new Date());
        if(typeof history === 'string') {
          history = JSON.parse(history);
        }
        // Add new message
        history[theTime] = {
          message:data.message,
          from: data.from,
          server: data.server,
          conversation: data.conversation
        }
        // save the updated tiddler
        $tw.syncadaptor.saveTiddler(new $tw.Tiddler({
          text:JSON.stringify(history, null, 2),
          title: `$:/chat/${conversationTiddler}`,
          type: 'application/json'
        }), data.wiki);
        if($tw.settings.enableFederation === 'yes') {
          // Send it to any connected servers
          $tw.Bob.Federation.sendToRemoteServers(data);
        }
      }
    }
  }
}
})();
