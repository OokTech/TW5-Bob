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

$tw.Bob = $tw.Bob || {};
if(!$tw.Bob.Shared) {
  let Shared = {};
  let idNumber = 0;
  let messageQueueTimer = false;

  $tw.Bob.MessageQueue = $tw.Bob.MessageQueue || [];
  $tw.connections = $tw.connections || {};
  $tw.settings = $tw.settings || {};
  $tw.settings.advanced = $tw.settings.advanced || {};

  /*
    This is used to parse cookie strings, both on the server and in the browser.
  */
  $tw.Bob.getCookie = function(cookie, cname) {
    cookie = cookie || ""
    const name = cname + "=";
    const ca = cookie.split(';');
    for(let i = 0; i <ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) == ' ') {
        c = c.substring(1);
      }
      if(c.indexOf(name) == 0) {
        return c.substring(name.length, c.length);
      }
    }
    return false;
  }

  /*
    This function takes two tiddler objects and returns a boolean value
    indicating if they are the same or not.
  */
  Shared.TiddlerHasChanged = function (tiddler, otherTiddler) {
    if(!otherTiddler) {
      return true;
    }
    if(!tiddler) {
      return true;
    }
    if(!otherTiddler.fields && tiddler.fields) {
      return true;
    }
    if(!tiddler.fields && otherTiddler.fields) {
      return true;
    }
    const hash1 = tiddler.hash || $tw.Bob.Shared.getTiddlerHash(tiddler);
    const hash2 = otherTiddler.hash || $tw.Bob.Shared.getTiddlerHash(otherTiddler);
    return hash1 !== hash2;
  };

  Shared.getMessageToken = function(connectionIndex) {
    if($tw.browser) {
      // In the browser we check if the token is still valid and if so attach
      // it to the message, otherwise don't send a token.
      if(localStorage.getItem('token-eol') > Date.now()) {
        return localStorage.getItem('ws-token');
      }
    } else if($tw.node) {
      // Use the connection index to get the token
    }
  }

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

    // Add token stuff here const token = localStorage.getItem('ws-token');s

    for the ackObject the index is the connection index and ackReceived is a
    boolean indicating if the ack has been received yet or not.
  */
  Shared.createMessageData = function (message, sessionId) {
    const id = makeId()//message.id || makeId();
    message.id = id;
    message.token = $tw.Bob.Shared.getMessageToken();
    let title = undefined;
    if(['saveTiddler', 'deleteTiddler', 'editingTiddler', 'cancelEditingTiddler'].indexOf(message.type) !== -1) {
      message.tiddler = JSON.parse(JSON.stringify(message.tiddler));
      title = message.tiddler.fields.title;
      message.tiddler.hash = $tw.Bob.Shared.getTiddlerHash(message.tiddler);
    }
    let messageData = {
      message: message,
      id: id,
      time: Date.now(),
      type: message.type,
      title: title,
      ack: {
        tries: 0
      },
      wiki: message.wiki,
      sessionId: sessionId
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
  function checkMessageQueue() {
    // If the queue isn't empty
    if($tw.Bob.MessageQueue.length > 0) {
      // Remove messages that have already been sent and have received all
      // their acks and have waited the required amonut of time.
      $tw.Bob.MessageQueue = pruneMessageQueue($tw.Bob.MessageQueue);
      // Check if there are any messages that are more than 500ms old and have
      // not received the acks expected.
      // These are assumed to have been lost and need to be resent
      const oldMessages = $tw.Bob.MessageQueue.filter(function(messageData) {
        if((Date.now() - messageData.time > $tw.settings.advanced.localMessageQueueTimeout || 500) && !messageData.ctime) {
          return true;
        } else {
          return false;
        }
      });
      oldMessages.forEach(function (messageData) {
        // If we are in the browser there is only one connection, but
        // everything here is the same.
        const targetConnections = $tw.node?(messageData.wiki?Object.values($tw.connections).filter(function(item) {
          return item.wiki === messageData.wiki && !messageData.ack[item.socket.index]
        }):[]):[Object.values($tw.connections)[0]].filter(function(item){!messageData.ack[item.socket.index]});
        targetConnections.forEach(function(connection) {
          _sendMessage(connection, messageData)
        });
      });
      if(messageQueueTimer) {
        clearTimeout(messageQueueTimer);
      }
      messageQueueTimer = setTimeout(checkMessageQueue, $tw.settings.advanced.localMessageQueueTimeout || 500);
    } else {
      clearTimeout(messageQueueTimer);
      messageQueueTimer = false;
    }
  }

  function _sendMessage(connection, messageData) {
    if(typeof connection == 'undefined') {
      return
    }
    const index = connection.index;
    // Here make sure that the connection is live and hasn't already
    // sent an ack for the current message.
    if(connection.socket !== undefined) {
      if(!messageData.ack[index] && connection.socket.readyState === 1) {
        messageData.ack.tries += 1
        connection.socket.send(JSON.stringify(messageData.message), function ack(err) {
          if(err) {
            console.log('there was an error sending a websocket message')
          }
        });
      }
    }
  }

  /*
    This returns a new id for a message.
    Messages from the browser have ids that start with b, messages from the
    server have an idea that starts with s.
  */
  function makeId() {
    idNumber += 1;
    let newId = ($tw.browser?'b':'s') + idNumber;
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
    const duplicateIndicies = queue.map(function(item, index) {
      // Messages with the same id are the same message and not considered
      // redudant here. There are other checks to make sure that the same
      // message isn't enqueued twice.
      // This is needed here or we lose the ack state of our connections if we
      // send the same message to multiple connections.
      if(messageData.id === item.id) {
        return -1;
      }
      // A delete or save tiddler message overrules any delete, save, editing
      // or cancel editing messages for the same tiddler.
      if(['deleteTiddler', 'saveTiddler'].includes(messageData.type) && ['deleteTiddler', 'editingTiddler', 'cancelEditingTiddler', 'saveTiddler'].includes(item.type)) {
        if(messageData.title === item.title) {
          return index;
        }
      }
      // An editingTiddler or cancelEditingTiddler message overrides any
      // previous editingTiddler or cancelEditingTiddler messages.
      if(['editingTiddler', 'cancelEditingTiddler'].includes(messageData.type) && ['editingTiddler', 'cancelEditingTiddler'].includes(item.type)) {
        if(messageData.title === item.title) {
          return index;
        }
      }
      // Finally if it isn't any of the basic messages check to see if the
      // message is a direct duplicate of an existing message.
      // match lists all the keys in message that don't have the same value in
      // item.message and all the keys in item.message that don't have the same
      // value in message.
      // If match has any elements in it than they are different messages.
      const match = Object.keys(messageData.message).filter(function(key) {
        return (messageData.message[key] !== item.message[key])
      }).concat(Object.keys(item.message).filter(function(key) {
        return (messageData.message[key] !== item.message[key])
      }));
      if(match.length === 0) {
        return index;
      }
      // If none of the above returned than there is no match.
      return -1;
    }).filter(function(item) {return item > -1;});
    // Remove the messages that are overruled by the new message.
    const outQueue = queue.filter(function(item, index) {
      if(duplicateIndicies.indexOf(index) !== -1) {
        if($tw.browser) {
          const receivedAck = new CustomEvent('handle-ack', {bubbles: true, detail: item.id})
          $tw.rootWidget.dispatchEvent(receivedAck)
        }
        return false
      } else {
        return true
      }
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
    let send = false;
    if($tw.node && messageData.message.wiki) {
      return $tw.syncadaptor.loadWiki(messageData.message.wiki, nextBit);
    } else {
      return nextBit();
    }
    function nextBit() {
      // Make sure that the connectionIndex and queue exist. This may be over
      // paranoid
      connectionIndex = connectionIndex || 0;
      queue = queue || [];
      // Start out saying that a message shouldn't be sent
      // Make sure that the tags field is an array so it fits what is expected
      if(messageData.type === 'saveTiddler') {
        messageData.message.tiddler = $tw.Bob.Shared.normalizeTiddler(messageData.message.tiddler)
      }
      // Only send things if the message is meant for the wiki or if the browser
      // is sending a message to the server. No wiki listed in the message means
      // it is a general message from the browser to all wikis.
      const hasThing = Object.keys($tw.connections).indexOf(connectionIndex) > -1;
      if(hasThing || messageData.message.wiki === Object.values($tw.connections)[connectionIndex].wiki || $tw.browser || !messageData.message.wiki) {
        let ignore = false;
        // Ignore saveTiddler, deleteTiddler and editingTiddler messages for
        // tiddlers that are listed by the sync exclude filter.
        // We do not ignore cancelEditingTiddler messages because they are sent
        // with draft tiddler titles which would be ignored, but that prevents
        // the lock from being removed from the non-draft tiddler.
        let list = [];
        if(['deleteTiddler', 'saveTiddler', 'editingTiddler'].indexOf(messageData.type) !== -1) {
          if($tw.node) {
            if(!messageData.message.wiki) {
              // TODO fix this terrible workaround
              list = []
            } else {
              if(Object.keys($tw.Bob.Wikis).indexOf(messageData.message.wiki) === -1) {
                ignore = true;
              } else {
                list = $tw.Bob.Wikis[messageData.message.wiki].wiki.filterTiddlers($tw.Bob.ExcludeFilter);
              }
            }
          } else {
            list = $tw.wiki.filterTiddlers($tw.Bob.ExcludeFilter);
          }
          if(list.indexOf(messageData.title) !== -1) {
            ignore = true;
          }
        }
        if(!ignore) {
          // If the new message is one of these types for a tiddler and the
          // timestamp of the queued message is newer than the current message
          // ignore the new message
          const nonMultipleMessageTypes = ['deleteTiddler', 'saveTiddler', 'editingTiddler', 'cancelEditingTiddler', 'setViewableWikis', 'listTiddlers', 'setLoggedIn', 'updateEditingTiddlers'];
          if(nonMultipleMessageTypes.indexOf(messageData.type) !== -1) {
            // Look at each queued message
            queue.forEach(function(queuedMessageData){
              // If the queued message has one of these types
              if(nonMultipleMessageTypes.indexOf(queuedMessageData.type) !== -1) {
                // if the queued message is newer than the current message ignore
                // the current message
                if(queuedMessageData.title === messageData.title && queuedMessageData.timestamp > messageData.timestamp) {
                  ignore = true;
                }
              }
            })
          }
        }
        if(!ignore) {
          // If the new message is one of these types for a tiddler and the
          // timestamp of the queued message is newer than the current message
          // ignore the new message
          if(['editingTiddler', 'cancelEditingTiddler'].indexOf(messageData.type) !== -1) {
            // Look at each queued message
            queue.forEach(function(queuedMessageData){
              // If the queued message has one of these types
              if(['editingTiddler', 'cancelEditingTiddler'].indexOf(queuedMessageData.type) !== -1) {
                // if the queued message is newer than the current message ignore
                // the current message
                if(queuedMessageData.title === messageData.title && queuedMessageData.timestamp > messageData.timestamp) {
                  ignore = true;
                }
              }
            })
          }
        }
        if(!ignore) {
          // Ignore saveTiddler messages if there is already a saveTiddler
          // message in the queue for that tiddler and the tiddler is the same in
          // both messages.
          if(messageData.type === 'saveTiddler') {
            queue.forEach(function(message, messageIndex) {
              if(message.type === 'saveTiddler' && messageData.sessionId === queue[messageIndex].sessionId) {
                if(!$tw.Bob.Shared.TiddlerHasChanged(messageData.message.tiddler, queue[messageIndex].message.tiddler)) {
                  ignore = true;
                }
              }
            })
          }
        }
        if(!ignore) {
          send = true;
        }
      }
      return send;
    }
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
  Shared.sendMessage = function(message, connectionIndex) {
    let messageData = Shared.createMessageData(message, connectionIndex)
    if(Shared.messageIsEligible(messageData, connectionIndex, $tw.Bob.MessageQueue)) {
      $tw.Bob.Timers = $tw.Bob.Timers || {};
      connectionIndex = connectionIndex || 0;
      if(messageData.message.tiddler) {
        messageData.message.tiddler = $tw.Bob.Shared.normalizeTiddler(messageData.message.tiddler);
      }
      // Remove any messages made redundant by this message
      $tw.Bob.MessageQueue = Shared.removeRedundantMessages(messageData, $tw.Bob.MessageQueue);
      if($tw.browser) {
        // Check to see if the token has changed
        $tw.Bob.MessageQueue = removeOldTokenMessages($tw.Bob.MessageQueue);
      }
      // If the message is already in the queue (as determined by the message
      // id), than just add the new target to the ackObject
      const enqueuedIndex = Object.keys($tw.Bob.MessageQueue).findIndex(function(enqueuedMessageData) {
        return enqueuedMessageData.id === messageData.id;
      });
      if(enqueuedIndex !== -1) {
        $tw.Bob.MessageQueue[enqueuedIndex].ack[connectionIndex] = false;
      } else {
        // If the message isn't in the queue set the ack status for the current
        // connectionIndex and enqueue the message
        messageData.ack[connectionIndex] = false;
        $tw.Bob.MessageQueue.push(messageData);
      }
      if (Object.keys($tw.connections).indexOf(connectionIndex) > -1) {
        _sendMessage($tw.connections[connectionIndex], messageData)
      } else {
        _sendMessage(Object.values($tw.connections)[connectionIndex], messageData)
      }
    } else if($tw.browser) {
      // If we are not sending the message then we have to emit the 'received-ack' event so that the syncer thinks it is finished.
      const receivedAck = new CustomEvent('handle-ack', {bubbles: true, detail: messageData.id})
      $tw.rootWidget.dispatchEvent(receivedAck)
    }
    clearTimeout(messageQueueTimer);
    $tw.settings.advanced = $tw.settings.advanced || {};
    messageQueueTimer = setTimeout(checkMessageQueue, $tw.settings.advanced.localMessageQueueTimeout || 500);
    return messageData;
  }

  /*
    If the token in the queued messages changes than remove messages that use
    the old token
  */
  function removeOldTokenMessages(messageQueue) {
    let outQueue = [];
    if(localStorage) {
      if(typeof localStorage.getItem === 'function') {
        const token = $tw.Bob.Shared.getMessageToken();
        outQueue = messageQueue.filter(function(messageData) {
          return messageData.message.token === token
        })
      }
    } else {
      outQueue = messageQueue;
    }
    return outQueue
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
    if($tw.browser) {
      // Events to let the syncadaptor work in the browser
      const receivedAck = new CustomEvent('handle-ack', {bubbles: true, detail: data.id})
      $tw.rootWidget.dispatchEvent(receivedAck)
    }
    if(data.id) {
      // a quick hack to make this work
      if($tw.browser) {
        // The source connection is always 0 in the browser
        data.source_connection = 0;
      }
      const index = $tw.Bob.MessageQueue.findIndex(function(messageData) {
        return messageData.id === data.id;
      })
      if($tw.Bob.MessageQueue[index]) {
        // Set the message as acknowledged.
        $tw.Bob.MessageQueue[index].ack[data.source_connection] = true;
        // Check if all the expected acks have been received
        const complete = Object.keys($tw.Bob.MessageQueue[index].ack).findIndex(function(value){
          return value !== 'tries' && $tw.Bob.MessageQueue[index].ack[value] !== true;
        }) === -1;
        // If acks have been received from all connections than set the ctime.
        if(complete && !$tw.Bob.MessageQueue[index].ctime) {
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
  function pruneMessageQueue(inQueue) {
    inQueue = inQueue || [];
    let token = false
    if($tw.browser && localStorage) {
      token = localStorage.getItem('ws-token');
    }
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
    const outQueue = inQueue.filter(function(messageData) {
      if((token && messageData.message.token && messageData.message.token !== token) || (token && !messageData.message.token) ) {
        // If we have a token, the message has a token and they are not the
        // same than drop the message. (possible imposter)
        // If we have a token and the message doesn't have a token than drop it
        // (someone unathenticated trying to make changes)
        // If we don't have a token and the message does than what?
        return false
      } else if(messageData.ctime) {
        // if there is a ctime than check if it is more than 10000ms ago, if so
        // remove the message.
        if(Date.now() - messageData.ctime > 10000) {
          return false;
        } else {
          return true;
        }
      } else if (messageData.ack.tries > ($tw.settings.retries || 5)) {
        return false;
      } else {
        return true;
      }
    })
    return outQueue;
  }

  /*
    This normalizes a tiddler so that it can be compared to another tiddler to
    determine if they are the same.

    Any two tiddlers that have the same fields and content (including title)
    will return exactly the same thing using this function.

    Fields are included in alphabetical order, as defined by the javascript
    array sort method.

    The tag field gets sorted and the list field is interpreted as a string
    array. If either field exists but it is an empty string it is replaced with
    an empty array.

    Date fields (modified and created) are stringified.
  */
  Shared.normalizeTiddler = function(tiddler) {
    let newTid = {};
    if(tiddler) {
      if(tiddler.fields) {
        let fields = Object.keys(tiddler.fields) || []
        fields.sort()
        fields.forEach(function(field) {
          if(field === 'list' || field === 'tags') {
            if(Array.isArray(tiddler.fields[field])) {
              newTid[field] = tiddler.fields[field].slice()
              if(field === 'tags') {
                newTid[field] = newTid[field].sort()
              }
            } else if(tiddler.fields[field] === '') {
              newTid[field] = []
            } else {
              newTid[field] = $tw.utils.parseStringArray(tiddler.fields[field]).slice()
              if(field === 'tags') {
                newTid[field] = newTid[field].sort()
              }
            }
          } else if(field === 'modified' || field === 'created') {
            if(typeof tiddler.fields[field] === 'object' && tiddler.fields[field] !== null) {
              newTid[field] = $tw.utils.stringifyDate(tiddler.fields[field]);
            } else {
              newTid[field] = tiddler.fields[field]
            }
          } else {
            newTid[field] = tiddler.fields[field]
          }
        })
        if(typeof newTid.text === 'undefined' || !newTid.text) {
          newTid.text = '';
        }
      }
    }
    return {fields: newTid}
  }

  /*
    This is a simple and fast hashing function that we can use to test if a
    tiddler has changed or not.
    This doesn't need to be at all secure, and doesn't even need to be that
    robust against collisions, it just needs to make collisions rare for a very
    easy value of rare, like 0.1% would be more than enough to make this very
    useful, and this should be much better than that.

    Remember that this just cares about collisions between one tiddler and its
    previous state after an edit, not between all tiddlers in the wiki or
    anything like that.
  */
  // This is a stable json stringify function from https://github.com/epoberezkin/fast-json-stable-stringify
  function stableStringify (data, opts) {
    if(!opts) opts = {};
    if(typeof opts === 'function') opts = { cmp: opts };
    let cycles = (typeof opts.cycles === 'boolean') ? opts.cycles : false;

    let cmp = opts.cmp && (function (f) {
        return function (node) {
            return function (a, b) {
                const aobj = { key: a, value: node[a] };
                const bobj = { key: b, value: node[b] };
                return f(aobj, bobj);
            };
        };
    })(opts.cmp);

    let seen = [];
    return (function stringify (node) {
        if(node && node.toJSON && typeof node.toJSON === 'function') {
            node = node.toJSON();
        }

        if(node === undefined) return;
        if(typeof node == 'number') return isFinite(node) ? '' + node : 'null';
        if(typeof node !== 'object') return JSON.stringify(node);

        let i, out;
        if(Array.isArray(node)) {
            out = '[';
            for (i = 0; i < node.length; i++) {
                if(i) out += ',';
                out += stringify(node[i]) || 'null';
            }
            return out + ']';
        }

        if(node === null) return 'null';

        if(seen.indexOf(node) !== -1) {
            if(cycles) return JSON.stringify('__cycle__');
            throw new TypeError('Converting circular structure to JSON');
        }

        let seenIndex = seen.push(node) - 1;
        let keys = Object.keys(node).sort(cmp && cmp(node));
        out = '';
        for (i = 0; i < keys.length; i++) {
            let key = keys[i];
            let value = stringify(node[key]);

            if(!value) continue;
            if(out) out += ',';
            out += JSON.stringify(key) + ':' + value;
        }
        seen.splice(seenIndex, 1);
        return '{' + out + '}';
    })(data);
  };
  Shared.getTiddlerHash = function(tiddler) {
    const tiddlerString = stableStringify(Shared.normalizeTiddler(tiddler))
    let hash = 0;
    if(tiddlerString.length === 0) {
        return hash;
    }
    for (let i = 0; i < tiddlerString.length; i++) {
        const char = tiddlerString.charCodeAt(i);
        hash = ((hash<<5)-hash)+char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  /*
    This acknowledges that a message has been received.
  */
  Shared.sendAck = function (data) {
    data = data || {};
    if($tw.browser) {
      const token = $tw.Bob.Shared.getMessageToken();
      Object.values($tw.connections)[0].socket.send(JSON.stringify({
        type: 'ack',
        id: data.id,
        token: token,
        wiki: $tw.wikiName,
        sessionId: sessionStorage.getItem('sessionId')
      }), function ack(err) {
        if(err) {
          console.log('sending ack failed: ', err, data)
        }
      });
    } else {
      if(data.id) {
        if(data.source_connection !== undefined && data.source_connection !== -1) {// && $tw.connections[data.source_connection]) {
          if(!$tw.connections[data.source_connection]) {
            return
          }
          $tw.connections[data.source_connection].socket.send(JSON.stringify({
            type: 'ack',
            id: data.id
          }), function ack(err) {
            if (err) {
              console.log('sending ack failed', err)
            }
          });
        }
      }
    }
  }

  module.exports = Shared;
} else {
  return $tw.Bob.Shared;
}

})();
