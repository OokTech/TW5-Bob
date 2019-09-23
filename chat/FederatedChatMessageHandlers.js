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
    Receive a federated chat message
  */
  $tw.Bob.Federation.messageHandlers.chatMessage = function(data) {
    console.log('1')
    console.log(data)
    data.wiki = data.wiki || 'RootWiki';
    const conversationTiddler = data.conversation || 'DefaultChat';
    if (conversationTiddler && data.message) {
      console.log('2')
      // Get the history tiddler
      const historyTiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(`$:/chat/${conversationTiddler}`);
      let history = {};
      if (historyTiddler) {
        // Make sure that the fields aren't read only
        history = JSON.parse(JSON.stringify(historyTiddler.fields));
      }
      const theTime = $tw.utils.stringifyDate(new Date());
      history = JSON.parse(history);
      history[theTime] = {
        message:data.message,
        from: data.from,
        server: data.server
      }
      // Add new message
      history[data.time] = data.message
      console.log('3')
      // save the updated tiddler
      $tw.syncadaptor.saveTiddler(new $tw.Tiddler({
        text:JSON.stringify(history, null, 2),
        title: `$:/chat/${conversationTiddler}`,
        type: 'application/json'
      }), data.wiki);
      console.log('4')
    }
  }

  /*
    Receive a chat history from a federated server

    This is for when you join an existing conversation.

    It combines the local messages with the received messages.
  */
  $tw.Bob.Federation.messageHandlers.chatHistory = function(data) {
    //$tw.Bob.Shared.sendAck(data);
    const conversationTiddler = data.conversation || 'DefaultChat'
    if (data.conversation && data.messages) {
      // Get the history tiddler
      const historyTiddler = $tw.Bob.Wikis[data.wiki].wiki.getTiddler(`$:/chat/${conversationTiddler}`)
      let history = {}
      if (historyTiddler) {
        // Update the history tiddler
        history = JSON.parse(JSON.stringify(historyTiddler.fields));
      }
      Object.keys(data.messages).forEach(function(message) {
        history[message.time] = message.message;
      })
      // save the updated tiddler
      $tw.syncadaptor.saveTiddler(new $tw.Tiddler({
        text:JSON.stringify(history, null, 2),
        title: `$:/chat/${conversationTiddler}`,
        type: 'application/json'
      }), data.wiki);
    }
  }
}
})();
