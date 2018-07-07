/*\
title: $:/plugins/OokTech/Bob/SharedFunctions.js
type: application/javascript
module-type: library

This has some functions that are needed by Bob in different places.

\*/
(function () {

  /*jslint node: true, browser: true */
  /*global $tw: false */
  "use strict";

  // Export name and synchronous status
  exports.name = "web-sockets-setup";
  exports.platforms = ["browser", "node"];
  exports.after = ["render"];
  exports.synchronous = true;

  var Shared = {};
  var idNumber = 0;

  /*
    Check if the file version matches the in-browser version of a tiddler
  */
  Shared.TiddlerHasChanged = function (tiddler, otherTiddler) {
    if (!otherTiddler) {
      return true;
    }
    if (!tiddler) {
      return true;
    }

    var changed = false;
    // Some cleverness that gives a list of all fields in both tiddlers without
    // duplicates.
    var allFields = Object.keys(tiddler.fields).concat(Object.keys(otherTiddler.fields).filter(function (item) {
      return Object.keys(tiddler.fields).indexOf(item) < 0;
    }));
    // check to see if the field values are the same, ignore modified for now
    allFields.forEach(function(field) {
      if (field !== 'modified' && field !== 'created' && field !== 'list' && field !== 'tags') {
        if (!otherTiddler.fields[field] || otherTiddler.fields[field] !== tiddler.fields[field]) {
          // There is a difference!
          changed = true;
        }
      } else if (field === 'list' || field === 'tags') {
        if (tiddler.fields[field] && otherTiddler.fields[field]) {
          if ($tw.utils.parseStringArray(otherTiddler.fields[field]).length !== tiddler.fields[field].length) {
            changed = true;
          } else {
            var arrayList = $tw.utils.parseStringArray(otherTiddler.fields[field]);
            arrayList.forEach(function(item) {
              if (tiddler.fields[field].indexOf(item) === -1) {
                changed = true;
              }
            })
          }
        } else {
          changed = true;
        }
      }
    })
    return changed;
  };

  /*
    This returns an array of values. The values are the indicies of messages
    that this message invalidates for some reason.
    For example if there are two save tiddler messages for the same tiddler one
    right after the other the first message is not important because the second
    one will overwirte whatever the first one does. Therefore the first message
    can safely be dropped.
    Alternately, any number of 'saveTiddler' messages can be ignored if the
    tiddler in question is deleted by a later enqueued message.
  */
  Shared.findDuplicateMessages = function (message) {
    var overrides = $tw.Bob.MessageQueue.map(function(item, index) {
      // For any sequence of editing/cancel editing tiddler messages the latest
      // one for a specific tiddler overrules the previous ones.
      // A delete tiddler message overrules any delete, save, editing or cancel
      // editing messages for the same tiddler.
      if (message.type === 'deleteTiddler' && ['deleteTiddler', 'editingTiddler', 'cancelEditingTiddler'].includes(item.message.type) && message.tidder === item.message.tiddler) {
        return index;
      }
      if (message.type === 'deleteTiddler' && item.message.type === 'saveTiddler') {
        // We need this to protect against malformed saveTiddler messages
        if (typeof item.message.tiddler === 'object') {
          if (typeof item.message.tiddler.fields === 'object') {
            if (message.tiddler === item.message.tiddler.fields.title) {
              // A malformed saveTiddler message will break this!
              return index;
            }
          }
        }
      }
      // A save tiddler message overrules any existing deleteTiddler,
      // editingTiddler, cancelEditingTiddler or saveTiddler messages for the
      // same tiddler.
      if (message.type === 'saveTiddler') {
        // Protect against malformed messages
        if (typeof message.tiddler === 'object') {
          if (typeof message.tiddler.fields === 'object') {
            if (['deleteTiddler', 'editingTiddler', 'cancelEditingTiddler'].includes(item.message.type) && message.tiddler.fields.title === item.message.tiddler) {
              return index;
            } else if (item.message.type === 'saveTiddler') {
              if (typeof item.message.tiddler === 'object') {
                if (typeof item.message.tiddler.fields === 'object') {
                  if (message.tiddler.fields.title === item.message.tiddler.fields.title) {
                    return index;
                  }
                }
              }
            }
          }
        }
      }
      // An editingTiddler or cancelEditingTiddler message overrides any
      // previous editingTiddler or cancelEditingTiddler messages.
      if (message.type === 'editingTiddler' || message.type === 'cancelEditingTiddler' && ['editingTiddler', 'cancelEditingTiddler'].includes(item.message.type) && message.tiddler === item.message.tiddler) {
        return index;
      }
      // Finally if it isn't any of the basic messages check to see if the
      // message is a direct duplicate of an existing message.
      // match lists all the keys in message that don't have the same value in
      // item.message and all the keys in item.message that don't have the same
      // value in message.
      // If match has any elements in it than they are different messages.
      var match = Object.keys(message).filter(function(key) {
        return (message[key] !== item.message[key])
      }).concat(Object.keys(item.message).filter(function(key) {
        return (message[key] !== item.message[key])
      }));
      if (match.length > 0) {
        return index;
      }
      // If none of the above returned than there is no match.
      return -1;
    }).filter(function(item) {return item > -1;});
    // Return a list of indeicies of messages that the given message overrides.
    return overrides;
  }

  /*
    messageQueue [messageData]
    messageData {
      message: message,
      time: original sending timestamp,
      ctime: the time when all active connections have given an ack (for pruning old messages)
      id: messageId,
      connections: [connectionData],
      timer: timerId
    }
    connectionData {
      index: connectionIndex,
      ack: ack
    }
  */
  Shared.checkMessageQueue = function (messageQueue) {
    // If the queue isn't empty
    if(messageQueue.length > 0) {
      // Check if there are any messages that are more than 500ms old
      var oldMessages = messageQueue.filter(function(messageData) {
        if (Date.now() - messageData.time > 500) {
          return true;
        } else {
          return false;
        }
      });
      oldMessages.forEach(function (messageData) {
        if ($tw.browser && typeof $tw.socket !== 'undefined') {
          // In the browser there is only one connection (the one to the
          // server).
          if (!messageData.connections[0][messageData.id].ack) {
            // If we are in a browser, there is only one connection
            $tw.socket.send(JSON.stringify(messageData.message));
          }
        } else {
          // We are in the browser and have a variable number of connections
          $tw.connections.forEach(function(index) {
            // Here make sure that the connection is live and hasn't already
            // sent an ack for the current message.
            if (!messageQueue.connections[index][messageData.id].ack && $tw.connections[index].active) {
              // If we haven't received an ack from this connection yet than
              // resend the message
              $tw.connections[index].socket.send(JSON.stringify(messageData.message));
            }
          });
        }
      });
      if($tw.Bob.MessageQueueTimer) {
        clearTimeout($tw.Bob.MessageQueueTimer);
      }
      $tw.Bob.MessageQueueTimer = setTimeout(checkMessageQueue, 500);
    } else {
      clearTimeout($tw.Bob.MessageQueueTimer);
      $tw.Bob.MessageQueueTimer = false;
    }
  }

  Shared.makeId = function () {
    idNumber = idNumber + 1;
    var newId = ($tw.browser?'b':'s') + idNumber;
    return newId;
  }

  module.exports = Shared;

})();
