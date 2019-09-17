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

if($tw.node) {
  $tw.nodeMessageHandlers = $tw.nodeMessageHandlers || {};
  $tw.Bob.Federation = $tw.Bob.Federation || {};
  $tw.Bob.Federation.remoteConnections = $tw.Bob.Federation.remoteConnections || {};
  $tw.Bob.Federation.messageHandlers = $tw.Bob.Federation.messageHandlers || {};

  /*
    Receive a chat message from a browser, they are automatically sent to other connected browsers when the tiddlers are synced.
  */
  $tw.nodeMessageHandlers.chatMessage = function(data) {
    $tw.Bob.Shared.sendAck(data);
    const conversationTiddler = data.conversation || 'DefaultChat'
    if (conversationTiddler && data.message) {
      // Get the history tiddler
      const historyTiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(`$:/chat/${conversationTiddler}`)
      let history = {}
      if (historyTiddler) {
        // Make sure that the fields aren't read only
        history = JSON.parse(JSON.stringify(historyTiddler.fields.text));
      }
      const theTime = $tw.utils.stringifyDate(new Date());
      history = JSON.parse(history)
      // Add new message
      history[theTime] = data.message
      // save the updated tiddler
      $tw.syncadaptor.saveTiddler(new $tw.Tiddler({text:JSON.stringify(history, null, 2),title: `$:/chat/${conversationTiddler}`, type: 'application/json'}), data.wiki);
    }
  }
}
})();
