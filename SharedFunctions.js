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

  $tw.Bob = $tw.Bob || {};
  $tw.Bob.MessageQueue = $tw.Bob.MessageQueue || [];
  $tw.connections = $tw.connections || [];

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
    if (!otherTiddler.fields) {
      return true;
    }
    if (!tiddler.fields) {
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
          // We need a special check to check against empty arrays and empty
          // strings, which in this context match.
          var empty1 = false;
          var empty2 = false;
          if (Array.isArray(tiddler.fields[field])) {
            if (tiddler.fields[field].length === 0) {
              empty1 = true;
            }
          } else if (tiddler.fields[field].trim() === '') {
            empty1 = true;
          }
          if (Array.isArray(otherTiddler.fields[field])) {
            if (otherTiddler.fields[field].length === 0) {
              empty2 = true;
            }
          } else if (otherTiddler.fields[field].trim() === '') {
            empty2 = true;
          }
          if (!empty1 && !empty2) {
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
          }
        } else {
          changed = true;
        }
      } else if (field === 'modified' || field === 'created') {
        // Make sure the fields are parsed as strings then check if they match.
        var date1;
        var date2;
        if (typeof tiddler.fields[field] === 'string') {
          date1 = tiddler.fields[field];
        } else {
          date1 = $tw.utils.stringifyDate(tiddler.fields[field]);
        }
        if (typeof otherTiddler.fields[field] === 'string') {
          date2 = otherTiddler.fields[field];
        } else {
          date2 = $tw.utils.stringifyDate(otherTiddler.fields[field]);
        }
        if (date1 !== date2) {
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
      if (match.length === 0) {
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
  Shared.checkMessageQueue = function () {
    // If the queue isn't empty
    if($tw.Bob.MessageQueue.length > 0) {
      pruneMessageQueue()
      // Check if there are any messages that are more than 500ms old
      var oldMessages = $tw.Bob.MessageQueue.filter(function(messageData) {
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
            $tw.connections[0].socket.send(JSON.stringify(messageData.message));
          }
        } else {
          // We are in the browser and have a variable number of connections
          $tw.connections.forEach(function(item) {
            var index = item.index;
            // Here make sure that the connection is live and hasn't already
            // sent an ack for the current message.
            if (!messageData.ack && $tw.connections[index].active) {
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
      $tw.Bob.MessageQueueTimer = setTimeout(Shared.checkMessageQueue, 500);
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

  /*
    This sends a message to the server and gives it an id. The ids are unique
    to the session, but not globally.
    Duplicate messages are rejected.

    TODO add a check to make it so that messages are only queued up to be sent
    to the correct wikis

    TODO add a check to make it so that if a saveTiddler message is going to be
    sent but it is the same as a previous saveTiddler message but has a
    different id it is ignored.
  */
  Shared.sendMessage = function(messageData, connectionIndex) {
    // Empty tags fields will be converted to empty strings.
    if (messageData.message.type === 'saveTiddler') {
      if (!Array.isArray(messageData.message.tiddler.fields.tags)) {
        messageData.message.tiddler.fields.tags = [];
      }
    }
    connectionIndex = connectionIndex || 0;
    $tw.Bob.MessageQueue = $tw.Bob.MessageQueue || [];
    // Only send things if the message is meant for the wiki or if the browser
    // is sending a message to the server. No wiki listed in the message means
    // it is a general message from the browser to all wikis.
    if (messageData.message.wiki === $tw.connections[connectionIndex].wiki || $tw.browser || !messageData.message.wiki) {
      // First see if the same message is already enqueued to a different
      // destination
      var existingMessage = $tw.Bob.MessageQueue.findIndex(function(item, index) {
        return item.id === messageData.id;
      });
      if (existingMessage > -1) {
        if (typeof $tw.Bob.MessageQueue[existingMessage].ack[connectionIndex] === 'undefined') {
          // If the there is an existing message with the same id and it doesn't
          // already have an ack from the current destination.
          $tw.Bob.MessageQueue[existingMessage].ack[connectionIndex] = false;
          $tw.connections[connectionIndex].socket.send(JSON.stringify(messageData.message));
        }
        // If there is already an ack for this message than we do nothing here.
      } else {
        // If there is no message with the sam id already in the queue
        // Get the list of indicies for messages that this message overrules
        var duplicateIndicies = $tw.Bob.Shared.findDuplicateMessages(messageData.message);
        // Check each of the duplicate indicies, if it is a saveTiddler message
        // and the tiddler is the same in the old one as the new one ignore the
        // new one.
        var ignore = false;
        if (messageData.message.type === 'saveTiddler') {
          duplicateIndicies.forEach(function(messageIndex) {
            if (!$tw.Bob.Shared.TiddlerHasChanged(messageData.message.tiddler, $tw.Bob.MessageQueue[messageIndex].message.tiddler)) {
              ignore = true;
            }
          })
        }
        if (!ignore) {
          // Remove the messages that are overruled by the new message.
          $tw.Bob.MessageQueue = $tw.Bob.MessageQueue.filter(function(item, index) {
            return duplicateIndicies.indexOf(index) < 0;
          });
          messageData.ack[connectionIndex] = false;
          $tw.Bob.MessageQueue.push(messageData);
          $tw.connections[connectionIndex].socket.send(JSON.stringify(messageData.message));
        }
      }
      clearTimeout($tw.Bob.MessageQueueTimer);
      $tw.Bob.MessageQueueTimer = setTimeout($tw.Bob.Shared.checkMessageQueue, 500);
    }
  }

  /*
    This is the function for handling ack messages on both the server and
    browser. It is the same on both sides so it is here to prevent duplicate
    code.
  */
  Shared.handleAck = function (data) {
    if (data.id) {
      // a quick hack to make this work
      if ($tw.browser) {
        data.source_connection = 0;
      }
      // Set the message as acknowledged.
      $tw.Bob.MessageQueue.forEach(function(value,index) {
        if (value.id === data.id) {
          $tw.Bob.MessageQueue[index].ack[data.source_connection] = true;
        }
      })
    }
  }

  function pruneMessageQueue() {
    // We can not remove messages immediately or else they won't be around to
    // prevent duplicates when the message from the file system monitor comes
    // in.
    // But we don't want a huge history of messages taking up all the ram, so
    // we set some long time to live on the message queue and remove any
    // messages older than this TTL when we receive a new ack.
    // remove the message with the id from the message queue
    // try removing messages that received an ack more than 10 seconds ago.
    $tw.Bob.MessageQueue = $tw.Bob.MessageQueue.filter(function(messageData) {
      // Check if any acks are false
      messageData.ack = messageData.ack || {};
      // Temp is a list of messages that haven't received all of the acks yet
      var temp = Object.keys(messageData.ack).filter(function(ackData) {
        return Object.keys(ackData).filter(function(connectionIndex) {
          return ackData[connectionIndex] === false;
        }).length > 0;
      });
      if (temp.length > 0) {
        return true;
      } else if (Date.now() - messageData.time > 10000) {
        // If none are check if the message is over 10s old
        return false;
      } else {
        return true;
      }
    });
  }

  module.exports = Shared;

})();
