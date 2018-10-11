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
- Make sure that closed connections are being pruned (make sure that
  connections are being closed!)
- If a connection isn't authenticated than serve the wiki without the Bob
  plugin to make it smaller.
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
  - Syncing between servers: Each server has its compact list of changes, they
    are exchanged and examined for conflicts, non-conflicting tiddlers are sent
    and any conflicts are handled like browser-server conflicts.
    - If there is security than the initiating server needs to get an access
      token from the other server.
      - Syncing should be pretty much the same as when a browser reconnects otherwise. The local server logs into the remote server to get a token, then sends over the changes in the syncChanges message and the remote server then sends any new things to the local server. The conflicts are handled the same way as browser-server conflicts.
- Add `@iarna/toml` as an external library and use toml instead of json for
  configuration.
