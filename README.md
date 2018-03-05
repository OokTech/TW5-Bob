# TW5-MultiUser

BIG DISCLAMER OF DOOM - Back up your data. Do it. This has been tested but
there may be bugs that I don't know about.

A lot of the documentation is in the tiddler files in the Documentation folder
of the plugin, or in the wiki in the plugin information on the control panel.

With the node modules included you can now use the globally installed
tiddlywiki version. To do this you either need to place the plugin tiddler
files in the plugins sub-folder of the folder that contains the tiddlywiki.info
file

If you want to use a fresh local install of tiddlywiki here are command line
instructions:

Clone the tiddlywiki repo and get the plugin:
```
git clone --depth=1 https://github.com/Jermolene/TiddlyWiki5.git
git clone --depth=1 https://github.com/OokTech/TW5-MultiUser.git TiddlyWiki5/plugins/OokTech/TW5-MultiUser
cp -r TiddlyWiki5/plugins/OokTech/TW5-MultiUser/MultiUserWiki TiddlyWiki5/editions/
```

In a terminal navigate to the TiddlyWiki5 folder and type:

`node ./tiddlywiki.js editions/MultiUserWiki  --wsserver`

In a browser go to `127.0.0.1:8080` and the wiki should load. From here any
tiddlers you create should have .tid files created in the
`editions/MultiUserWiki/tiddlers` folder, any edits you do to those files
should be immediately reflected in the browser. Open the tiddler called
`$:/ServerIP`, if you go to the ip address listed there on port `8080` (on mine
right now the tiddler says `192.168.0.15`, so I put `192.168.0.15:8080` in the
browser of another computer on the network to access the wiki). Now any changes
you make to tiddlers on one computer will be reflected almost immediately on
the other, and any chaneges you make to tiddlers or the file system will be
almost immediately reflected in all connected wikis.

If you want to use the global tiddlywiki install you have to set the
environment variable `TIDDLYWIKI_PLUGIN_PATH` and `TIDDLYWIKI_EDITION_PATH` to
the folder where you have your plugins. On OSX or Linux you open a terminal and
type these commands:

```
export TIDDLYWIKI_PLUGIN_PATH="/path/to/your/plugins"
export TIDDLYWIKI_EDITION_PATH="/path/to/your/editions"
tiddlywiki editions/MultiUserWiki  --wsserver
```

*A note about command line arguments and configuration:*
I am terrible with command line arguments.
To prevent the need to have 10 or 15 command line arguments in order to fully
configure a wiki I instead added a `settings` folder in the same folder that
holds the `tiddlers` folder and the `tiddlywiki.info` file. Inside this folder
there is a `settings.json` file that you can use the configure the wiki.
This also lets you change the wiki's settings from within the wiki. Most of the
settings wouldn't take effect until the wiki server is reset, so I made a way
to reset the wiki server from inside the wiki. You can also shutdown the wiki
server from inside the wiki.

---

This plugin does a few things:

- Makes tiddlywiki watch the tiddlers folder and updates any tiddlers in the
wiki when there are changes to any tiddler files.
- Makes tiddlywiki save any changes to tiddlers made in the wiki immediately to
the file system
- Uses an exclude list to ignore certain tiddlers when syncing in the browser
- Prevents multiple people from editing the same tiddler at the same time by
  disabling the edit button for tiddlers currently being edited
- Allows any number of people or computers to connect to the wiki server and
  use or edit the same wiki simultaneously.
- Adds a websocket interface to tiddlywiki (currently only used by this plugin,
  a git plugin is currently being developed as well as plugins to run scripts
  on the local computer from tiddlywiki)
- Adds an action widget that allows you to send arbitrary websocket messages to
  the server. This can be used to do things like trigger shell scripts from
  inside the wiki.
- Adds some new hooks to the navigator widget that were needed (this doesn't
  change anything about how the navigator widget acts, it just adds some new
  places for hooks)
- Adds a new command `wsserver` that starts up a minimal http server so the
  websockets work and so that the node process can spawn child processses which
  serve other wikis.
  - If the `autoIncrementPort` setting is set to `true` than it will start at
    the given port and if it is in use than it will try the next port until an
    open port is found.
- Is compatible with the `NodeSettings` plugin.
- Allows you to reset the tiddlywiki server from the browser using a websocket
  message.
- MultiUser ability on multiple wikis simultaneously
- Adds a way to run shell scripts from the wiki
- Adds a utility to configure everything from inside the wiki
- Your connection to the server is monitored and you are warned if there is a
  problem

- *coming soon* Exclude lists on a per-wiki and per-user basis
- *coming soon* a list of all wikis currently being served
- *coming soon* each new wiki is made as a child process which allows messages
to be passed between the different wikis. I need to find how to use this to
make sure each wiki is accessible to all the others.

Some notes:

There will be a lot of messages in the terminal where you started the node
process. Messages saying `Cancel Editing Tiddler`, `Node Delete Tiddler`, the
messages come from every connected browser so the more connections there are
the more times they will be repeated. I am leaving them in for now for
debugging but they can be safely ignored.

As soon as you edit anything the browser will make the save button turn red,
this doesn't mean anything. I need to look at how to change the dirty status of
the wiki because there are ways to tell if changes have been saved or not using
this. Changes are saved very quickly so the red save button can be safely
ignored for now.
