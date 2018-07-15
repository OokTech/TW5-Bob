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
- See if we can have it so that imported images are saved in a images folder
  and canonical uri tiddlers are created for them instead of making an image
  tiddler.
- Let the prepareWiki function take an array of plugins to include in the wiki
  even if they aren't listed in the tiddlywiki.info file.
  - This should just be a change to the servePlugin input. We could also add an
    exclude array that lists plugins to not include even if they are in the
    .info file.
  - It may be better to just make a new function that lets you pick and choose
    tiddlers and plugins from any that are available.
- Maybe keep a history of changed tiddlers and timestamps (with the same bits
  of cleverness as the message queue pruning to keep it smaller) so that when a
  wiki disconnects it can reconnect and see changes since the last time it was
  in sync, and then resync itself without reloading.
