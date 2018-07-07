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
  - This is without editing the tiddlywiki.info file
  - This requires the wiki to be able to be unloaded and reloaded without
    restarting the server.
- Add error correction for server->browser messages
- Make the message queuing a bit clever to reduce the memory requirements
  - Only keep the newest 'saveTiddler' message for a tiddler.
  - If a 'deleteTiddler' message comes in and there is a 'saveTiddler' message
    queued for the same tiddler, remove the saveTiddler message.
  - Similarly, if there is a 'saveTiddler' message for a tiddler that has a
    'deleteTiddler' message queued, remove the 'deleteTiddler' message.
  - Make a note somewehre in the documentation about how this doesn't play well
    with multi-user situations.
- Figure out which other messages should get the same sort of error correction
