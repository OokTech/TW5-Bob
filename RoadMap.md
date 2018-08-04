# Roadmap for version 1.1.0

- Create Bob wikis from existing single file wikis. (This mostly already exists)
  - From inside the control panel select an existing wiki file and give a name
    and then the file is split into individual tiddler files and made into a
    wiki.
  - (maybe) determine if the plugins used in the single file are available
    locally as node plugins and preferentially use the node plugins
  - (maybe) determine if the plugins in the single file are available locally
    and if not create the plugin locally to make it available in the future
- Serve single file wikis as multi-user wikis (by cheating!)
  - The single file wiki will be split into a (possibly temporary) multi-user
    wiki and any editing can be done as a normal multi-user wiki.
  - Saving exports the changed wiki to overwrite the single file wiki (or save
    under a new name if that is what you want)
- Let the plugins a wiki uses be set from inside the wiki.
  - This is without editing the tiddlywiki.info file directly so we need an
    interface inside the wiki.
- Make sure that closed connections are being pruned (make sure that
  connections are being closed!)
- If a connection isn't authenticated than serve the wiki without the Bob
  plugin to make it smaller.
- Figure out if there is a 'no change' http thing I can do for page reloads.
- Add an option to wait for a response from the server before being allowed to
  edit a tiddler to prevent editing conflicts. (THIS MAY BE HARD, it changes
  some core behaviour)
- See if we can store the tiddlywiki core and Bob plugin in localstorage and
  then serve an html page that just has the wiki content. That could greatly
  reduce loading times and network traffic.
- Make a new function that lets you pick and choose tiddlers and plugins from
  any that are available.
- Add wiki syncing!
  - Sync local to remote state: make a list of all wiki tiddlers and send that
    to another wiki which checks that list against its own list and sends back
    any differences.
  - (Be careful with this) Sync remote to local state: make a list of all wiki
    tiddlers, send it to remote, remote checks it against its list and sends
    back a list of differences, the local then sends the differences to the
    remote.
  - Wiki diffs: same process as above, but export a json file that has all of
    the changes in it. This could use the same thing as the history of changed
    tiddlers thing.
- Make the server save a compact list of changes so that it can quickly resync
  wikis that reconnect after being disconnected
  - Any conflicts should be up to people to resolve. Both versions should be
    kept, a 'server' version and a 'browser' version.
    - This means I need to make a conflict resolution tool for it.
- When reconnecting to a server the wiki may have to be loaded before any
  messages with updates can be accepted. This may take some more involved work
  than I had hoped.
  - Also there is a problem where a save message can make a new tiddler file instead of overwriting the old one after a reconnection
