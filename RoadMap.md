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
