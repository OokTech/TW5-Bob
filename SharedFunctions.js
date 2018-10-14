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
    This function takes two tiddler objects and returns a boolean value
    indicating if they are the same or not.
  */
  Shared.TiddlerHasChanged = function (tiddler, otherTiddler) {
    if (!otherTiddler) {
      return true;
    }
    if (!tiddler) {
      return true;
    }
    if (!otherTiddler.fields && tiddler.fields) {
      return true;
    }
    if (!tiddler.fields && otherTiddler.fields) {
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
        if (otherTiddler.fields[field] !== tiddler.fields[field]) {
          // There is a difference!
          changed = true;
        }
      } else if (field === 'list' || field === 'tags') {
        if ((tiddler.fields[field] || tiddler.fields[field] === '' || tiddler.fields[field] === []) && (otherTiddler.fields[field] || otherTiddler.fields[field] === '' || otherTiddler.fields[field] === [])) {
          // We need a special check to check against empty arrays and empty
          // strings, which in this context match.
          var empty1 = false;
          var empty2 = false;
          var field1 = tiddler.fields[field]
          if (!Array.isArray(field1)) {
            field1 = $tw.utils.parseStringArray(field1);
          }
          var field2 = otherTiddler.fields[field]
          if (!Array.isArray(field2)) {
            field2 = $tw.utils.parseStringArray(field2);
          }
          if (field1) {
            if (field1.length === 0) {
              empty1 = true;
            }
          }
          if (field2) {
            if (field2.length === 0) {
              empty2 = true;
            }
          }
          if (!empty1 && !empty2) {
            if (field1.length !== field2.length) {
              changed = true;
            } else {
              var arrayList = field2;
              arrayList.forEach(function(item) {
                if (field1.indexOf(item) === -1) {
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
        } else if (typeof tiddler.fields[field] === 'object') {
          date1 = $tw.utils.stringifyDate(tiddler.fields[field]);
        }
        if (typeof otherTiddler.fields[field] === 'string') {
          date2 = otherTiddler.fields[field];
        } else if (typeof otherTiddler.fields[field] === 'object'){
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
    messageQueue [messageData]
    messageData {
      message: message,
      time: original sending timestamp,
      ctime: the time when all active connections have given an ack (for pruning old messages)
      id: messageId,
      ack: ackObject,
      title: tidTitle,
      type: messageType
    }
    ackObject {
      index: ackReceived,
      index2: ackReceived2
    }

    message - the json object that is actually sent as the message.
    time - the time the messageData is created
    id - the message id (should be unique per-session)
    ack - an object that holds each connection that the message is sent to and
      if an ack has been received or not yet
    title - for messages that refer to a tiddler this is the tiddler title,
      otherwise it is undefined.
    type - the message type

    for the ackObject the index is the connection index and ackReceived is a
    boolean indicating if the ack has been received yet or not.
  */
  Shared.createMessageData = function (message) {
    var id = $tw.Bob.Shared.makeId();
    message.id = id;
    var title = undefined;
    if (['saveTiddler', 'deleteTiddler', 'editingTiddler', 'cancelEditingTiddler'].indexOf(message.type) !== -1) {
      title = message.tiddler.fields.title;
    }
    var messageData = {
      message: message,
      id: id,
      time: Date.now(),
      type: message.type,
      title: title,
      ack: {}
    };
    return messageData;
  }

  /*
    This function checks the message queue to see if anything should be done.

    It first checks to see if there are any messages in the message queue, if
    not than it does nothing other than removing the timer to recheck the
    queue. The timer is restarted elsewhere if a message is sent.

    It then prunes the message queue, removing any messages that have been
    send and acknoweldeged so there is nothing more to do with them.

    It then checks any remaining messages to check if there are any that are
    older than 500ms.
    These messages are assumed to have been missed by the other end and are
    resent.

    If the queue isn't empty the timeout is reset for this function to run
    again in 500ms
  */
  Shared.checkMessageQueue = function () {
    // If the queue isn't empty
    if($tw.Bob.MessageQueue.length > 0) {
      // Remove messages that have already been sent and have received all
      // their acks and have waited the required amonut of time.
      $tw.Bob.MessageQueue = Shared.pruneMessageQueue($tw.Bob.MessageQueue);
      // Check if there are any messages that are more than 500ms old and have
      // not received the acks expected.
      // These are assumed to have been lost and need to be resent
      var oldMessages = $tw.Bob.MessageQueue.filter(function(messageData) {
        if (Date.now() - messageData.time > 500) {
          return true;
        } else {
          return false;
        }
      });
      oldMessages.forEach(function (messageData) {
        // If we are in the browser there is only one connection, but
        // everything here is the same.
        $tw.connections.forEach(function(item) {
          var index = item.index;
          // Here make sure that the connection is live and hasn't already
          // sent an ack for the current message.
          if (!messageData.ack[index] && $tw.connections[index].socket.readyState === 1) {
            // If we haven't received an ack from this connection yet than
            // resend the message
            $tw.connections[index].socket.send(JSON.stringify(messageData.message));
          }
        });
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

  /*
    This returns a new id for a message.
    Messages from the browser have ids that start with b, messages from the
    server have an idea that starts with s.
  */
  Shared.makeId = function () {
    idNumber = idNumber + 1;
    var newId = ($tw.browser?'b':'s') + idNumber;
    return newId;
  }

  /*
    This takes a new message and a message queue.

    It returns an updated queue that has any messages made irrelevant by the
    new message removed.

    Irrelevant messages are defined as:

    - Any saveTiddler or deleteTiddler message make any previous saveTiddler,
      deleteTiddler, editingTiddler or cancelEditingTiddler messages for the
      same tiddler irrelevant.
    - Any editingTiddler or cancelEditingTiddler messages make any previous
      editingTiddler or cancelEditingTiddler messages for the same tiddler
      irrelevant.
    - Finally a message that is an exact duplicate of a previous message
      overrides the previous message.

    For example if there are two save tiddler messages for the same tiddler one
    right after the other the first message is not important because the second
    one will overwirte whatever the first one does. Therefore the first message
    can safely be dropped.
    Alternately, any number of 'saveTiddler' messages can be ignored if the
    tiddler in question is deleted by a later enqueued message.
  */
  Shared.removeRedundantMessages = function (messageData, queue) {
    // Get a list of any duplicate messages or any that are now redundant
    // because of the new message.
    var duplicateIndicies = queue.map(function(item, index) {
      // Messages with the same id are the same message and not considered
      // redudant here. There are other checks to make sure that the same
      // message isn't enqueued twice.
      // This is needed here or we lose the ack state of our connections if we
      // send the same message to multiple connections.
      if (messageData.id === item.id) {
        return -1;
      }
      // A delete or save tiddler message overrules any delete, save, editing
      // or cancel editing messages for the same tiddler.
      if (['deleteTiddler', 'saveTiddler'].includes(messageData.type) && ['deleteTiddler', 'editingTiddler', 'cancelEditingTiddler', 'saveTiddler'].includes(item.type)) {
        if (messageData.title === item.title) {
          return index;
        }
      }
      // An editingTiddler or cancelEditingTiddler message overrides any
      // previous editingTiddler or cancelEditingTiddler messages.
      if (['editingTiddler', 'cancelEditingTiddler'].includes(messageData.type) && ['editingTiddler', 'cancelEditingTiddler'].includes(item.type)) {
        if (messageData.title === item.title) {
          return index;
        }
      }
      // Finally if it isn't any of the basic messages check to see if the
      // message is a direct duplicate of an existing message.
      // match lists all the keys in message that don't have the same value in
      // item.message and all the keys in item.message that don't have the same
      // value in message.
      // If match has any elements in it than they are different messages.
      var match = Object.keys(messageData.message).filter(function(key) {
        return (messageData.message[key] !== item.message[key])
      }).concat(Object.keys(item.message).filter(function(key) {
        return (messageData.message[key] !== item.message[key])
      }));
      if (match.length === 0) {
        return index;
      }
      // If none of the above returned than there is no match.
      return -1;
    }).filter(function(item) {return item > -1;});
    // Remove the messages that are overruled by the new message.
    var outQueue = queue.filter(function(item, index) {
      return duplicateIndicies.indexOf(index) < 0;
    });
    // return the new queue
    return outQueue;
  }

  /*
    This checks if a message is eligable to be sent and returns a boolean value
    true means the message should be sent or stored and false means it
    shouldn't.

    This checks:

    - If the wiki listed on the connection is the same as the wiki the message
      is for, or if it is in the browser, or if there is no wiki listed
    - If the tiddler the message is about is in the exclude list
    - If the message is either saveTiddler, deleteTiddler, editingTiddler or
      cancelEditingTiddler and there is a newer saverTiddler or deleteTiddler
      message for the same tiddler in the queue than ignore the message
    - If the message is either editingTiddler or cancelEditingTiddler and there
      is a newer saveTiddler, deleteTiddler, editingTiddler or
      cancelEditingTiddler message for the same tiddler in the queue than
      ignore the message
    - If the message is a saveTiddler message and there is another saveTiddler
      message for the same tiddler and the tiddler hasn't changed ignore the
      message
  */
  Shared.messageIsEligible = function (messageData, connectionIndex, queue) {
    // Make sure that the connectionIndex and queue exist. This may be over
    // paranoid
    connectionIndex = connectionIndex || 0;
    queue = queue || [];
    // Start out saying that a message shouldn't be sent
    var send = false;
    // Make sure that the tags field is an array so it fits what is expected
    if (messageData.type === 'saveTiddler') {
      if (messageData.message.tiddler.fields.tags) {
        if (!Array.isArray(messageData.message.tiddler.fields.tags)) {
          messageData.message.tiddler.fields.tags = $tw.utils.parseStringArray(messageData.message.tiddler.fields.tags);
          if (!Array.isArray(messageData.message.tiddler.fields.tags)) {
            messageData.message.tiddler.fields.tags = [];
          }
        }
      }
      if (messageData.message.tiddler.fields.tags === '')  {
        messageData.message.tiddler.fields.tags = [];
      }
      if (messageData.message.tiddler.fields.list) {
        // Make sure that the list field is an array so it fits what is expected
        if (!Array.isArray(messageData.message.tiddler.fields.list)) {
          messageData.message.tiddler.fields.list = $tw.utils.parseStringArray(messageData.message.tiddler.fields.list);
          if (!Array.isArray(messageData.message.tiddler.fields.list)) {
            messageData.message.tiddler.fields.list = [];
          }
        }
      }
    }
    // Only send things if the message is meant for the wiki or if the browser
    // is sending a message to the server. No wiki listed in the message means
    // it is a general message from the browser to all wikis.
    if (messageData.message.wiki === $tw.connections[connectionIndex].wiki || $tw.browser || !messageData.message.wiki) {
      var ignore = false;
      // Ignore saveTiddler, deleteTiddler and editingTiddler messages for
      // tiddlers that are listed by the sync exclude filter.
      // We do not ignore cancelEditingTiddler messages because they are sent
      // with draft tiddler titles which would be ignored, but that prevents
      // the lock from being removed from the non-draft tiddler.
      if (['deleteTiddler', 'saveTiddler', 'editingTiddler'].indexOf(messageData.type) !== -1) {
        if ($tw.node) {
          var list = $tw.Bob.Wikis[messageData.message.wiki].wiki.filterTiddlers($tw.Bob.ExcludeFilter);
        } else {
          var list = $tw.wiki.filterTiddlers($tw.Bob.ExcludeFilter);
        }
        if (list.indexOf(messageData.title) !== -1) {
          ignore = true;
        }
      }
      if (!ignore) {
        // If the new message is one of these types for a tiddler and the
        // timestamp of the queued message is newer than the current message
        // ignore the new message
        if (['deleteTiddler', 'saveTiddler', 'editingTiddler', 'cancelEditingTiddler'].indexOf(messageData.type) !== -1) {
          // Look at each queued message
          queue.forEach(function(queuedMessageData){
            // If the queued message has one of these types
            if (['deleteTiddler', 'saveTiddler'].indexOf(queuedMessageData.type) !== -1) {
              // if the queued message is newer than the current message ignore
              // the current message
              if (queuedMessageData.title === messageData.title && queuedMessageData.timestamp > messageData.timestamp) {
                ignore = true;
              }
            }
          })
        }
      }
      if (!ignore) {
        // If the new message is one of these types for a tiddler and the
        // timestamp of the queued message is newer than the current message
        // ignore the new message
        if (['editingTiddler', 'cancelEditingTiddler'].indexOf(messageData.type) !== -1) {
          // Look at each queued message
          queue.forEach(function(queuedMessageData){
            // If the queued message has one of these types
            if (['editingTiddler', 'cancelEditingTiddler'].indexOf(queuedMessageData.type) !== -1) {
              // if the queued message is newer than the current message ignore
              // the current message
              if (queuedMessageData.title === messageData.title && queuedMessageData.timestamp > messageData.timestamp) {
                ignore = true;
              }
            }
          })
        }
      }
      if (!ignore) {
        // Ignore saveTiddler messages if the tiddler hasn't changed
        if (messageData.type === 'saveTiddler') {
          queue.forEach(function(message, messageIndex) {
            if (message.type === 'saveTiddler' && message.title === messageData.title) {
              if (!$tw.Bob.Shared.TiddlerHasChanged(messageData.message.tiddler, queue[messageIndex].message.tiddler)) {
                ignore = true;
              }
            }
          })
        }
      }
      if (!ignore) {
        send = true;
      }
    }
    return send;
  }

  /*
    This sends the message described by messageData to the connection indicated by connectionIndex, if appropriate.

    First the message is checked to make sure it is eligible to be send using
    Shared.messageIsEligible, if it isn't than nothing is sent but the messageQueue timer is still reset.

    If the message is eligible to be sent than the message queue is checked any
    any existing messages that the current message makes redundant are removed
    from the queue. Note that the same message (that is the direct duplicate
    with the same messageId) is not removed here, if it were than the same
    message being sent from the server to multiple browsers would overwrite the
    ack state of each browser as the message was sent to the next one.

    Then the queue is checked to see if the same message is already enqueued,
    if so than only the ack state is updated so it is waiting for an ack from
    the current connectionIndex. If the message is not already enqueued than
    the ack state is updated in the messageData and it is added to the queue.

    For same tiddler messages there is a short timer between the saveTiddler
    message being queued up and being sent so that any new saveTiddler message
    for the same tiddler overrides it. This is to prevent race conditions
    caused by a sequence of saveTiddler messages being sent in very quick
    succession and possibly being handled out of order by the reciving end or
    leading to an infinite update loop.

    For every other message type it is just sent.

    This modifies $tw.Bob.MessageQueue as a side effect
  */
  Shared.sendMessage = function(messageData, connectionIndex) {
    if (Shared.messageIsEligible(messageData, connectionIndex, $tw.Bob.MessageQueue)) {
      $tw.Bob.Timers = $tw.Bob.Timers || {};
      connectionIndex = connectionIndex || 0;
      // Empty tags fields will be converted to empty strings.
      if (messageData.type === 'saveTiddler') {
        if (!Array.isArray(messageData.message.tiddler.fields.tags)) {
          messageData.message.tiddler.fields.tags = $tw.utils.parseStringArray(messageData.message.tiddler.fields.tags);
          if (!Array.isArray(messageData.message.tiddler.fields.tags)) {
            messageData.message.tiddler.fields.tags = [];
          }
        }
      }

      // Remove any messages made redundant by this message
      $tw.Bob.MessageQueue = Shared.removeRedundantMessages(messageData, $tw.Bob.MessageQueue);
      // If the message is already in the queue (as determined by the message
      // id), than just add the new target to the ackObject
      var enqueuedIndex = Object.keys($tw.Bob.MessageQueue).findIndex(function(enqueuedMessageData) {
        return enqueuedMessageData.id === messageData.id;
      });
      if (enqueuedIndex !== -1) {
        $tw.Bob.MessageQueue[enqueuedIndex].ack[connectionIndex] = false;
      } else {
        // If the message isn't in the queue set the ack status for the current
        // connectionIndex and enqueue the message
        messageData.ack[connectionIndex] = false;
        $tw.Bob.MessageQueue.push(messageData);
      }
      // We have a slight delay before sending saveTiddler messages, this
      // is because if you send them right away than you have trouble with
      // fields that are edited outside the tiddler edit view (like setting
      // the site title or subtitle) because a message is sent on each key
      // press and it creates race conditions with the server and which was
      // the last message can get confused and it can even get stuck in
      // infinite update loops.
      if (messageData.type === 'saveTiddler' && $tw.browser) {
        // Each tiddler gets a timer invalidate the timer and reset it each time
        // we get a saveTiddler message for a tiddler
        clearTimeout($tw.Bob.Timers[messageData.title]);
        // then reset the timer
        $tw.Bob.Timers[messageData.title] = setTimeout(function(){$tw.connections[connectionIndex].socket.send(JSON.stringify(messageData.message));}, 200);
      } else {
        $tw.connections[connectionIndex].socket.send(JSON.stringify(messageData.message));
      }
    }
    clearTimeout($tw.Bob.MessageQueueTimer);
    $tw.Bob.MessageQueueTimer = setTimeout($tw.Bob.Shared.checkMessageQueue, 500);
  }

  /*
    This is the function for handling ack messages on both the server and
    browser. It is the same on both sides so it is here to prevent duplicate
    code.

    It takes a messadeData object as input and checks it against the message
    queue. If the queue contains a message with the same id as node input
    messageData than the ack state for the connection the ack came from is set
    to true.

    If all acks for the messageData in the queue are set to true than the ctime
    for that messageData is set to the current time so it can be properly
    removed later.
  */
  Shared.handleAck = function (data) {
    if (data.id) {
      // a quick hack to make this work
      if ($tw.browser) {
        data.source_connection = 0;
      }
      var index = $tw.Bob.MessageQueue.findIndex(function(messageData) {
        return messageData.id === data.id;
      })
      if ($tw.Bob.MessageQueue[index]) {
        // Set the message as acknowledged.
        $tw.Bob.MessageQueue[index].ack[data.source_connection] = true;
        // Check if all the expected acks have been received
        var complete = Object.keys($tw.Bob.MessageQueue[index].ack).findIndex(function(value){
          return $tw.Bob.MessageQueue[index].ack[value] === false;
        }) === -1;
        // If acks have been received from all connections than set the ctime.
        if (complete && !$tw.Bob.MessageQueue[index].ctime) {
          $tw.Bob.MessageQueue[index].ctime = Date.now();
        }
      }
    }
  }

  /*
    This takes a messageQueue as input and returns a queue with old messages
    removed.

    As part of the ack handling, once a message receives an ack from every
    connection it is sent to the ctime is set.
    This checks each message in the queue and if the ctime exists and is more
    than 10000ms old than it removes the message from the returned queue.

    A message is kept past the final ack because some messages can be sent
    multiple times and things get stuck in an infinite loop if we don't detect
    that they are duplicates.
  */
  Shared.pruneMessageQueue = function (inQueue) {
    inQueue = inQueue || [];
    // We can not remove messages immediately or else they won't be around to
    // prevent duplicates when the message from the file system monitor comes
    // in.
    // But we don't want a huge history of messages taking up all the ram, so
    // we set some long time to live on the message queue and remove any
    // messages older than this TTL when we receive a new ack.
    // remove the message with the id from the message queue
    // try removing messages that received an ack more than 10 seconds ago.

    // messageData.ack.ctime is the time that a message received all the acks
    // it was waiting for. If it doesn't exist than it is still waiting.
    var outQueue = inQueue.filter(function(messageData) {
      // if there is a ctime than check if it is more than 10000ms ago, if so
      // remove the message.
      if (messageData.ctime) {
        if (Date.now() - messageData.ctime > 10000) {
          return false;
        } else {
          return true;
        }
      } else {
        return true;
      }
    })

    return outQueue;
  }

  module.exports = Shared;

})();
