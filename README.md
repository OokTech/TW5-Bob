# TW5-MultiUser

BIG DISCLAMER OF DOOM - Back up your data. Do it. This has been tested but
there may be bugs that I don't know about. Also see notes below.

## What does it do?

- Multi-User support for using/editing the same wiki(s) simultaneously
- Multi-Wiki support - run it once and server multiple wikis
- Create new wikis from inside the root wiki
- Two-way real-time syncing between the browser and file system
- All configuration can be done from inside the wiki
- Server external files (like images) so you can include them in your wikis
- Allows you to run shell scripts and commands from inside the wiki

A lot of the documentation is in the tiddler files in the Documentation folder
of the plugin, or in the wiki in the plugin information on the control panel.

## How do I set it up?

### Easiest Version (Bundled Application)

To make this more accessible to people I made it so you can download a single
file and then run it and everything should work. When you run it it should even
open the wiki in your default browser.

To do use this go here
(https://github.com/OokTech/TW5-SingleExecutable/releases) and download the
file for your system (tiddlyLinux for linux, tiddlyWin.exe for windows and
tiddlyOSX for mac). Then run the file.

- On windows it may ask if you want to allow node through your firewall. Say
  yes.

It will create an index wiki in the same folder where you run the file, so if
you want you can copy the file somewhere else. If you want to move it after you
have run it the first time just be sure to copy the `IndexWiki` folder to the
same location or it will create a new one without any changes you have made.

### Manual Version

If you are familiar with using tiddlywiki on node than you just need to put
the plugin into your plugins folder and include it in your `tiddlywiki.info`
file. For the moment this plugin must be located in the `OokTech/MultiUser`
subfolder of your plugins folder and listed as `OokTech/MultiUser` in the
`tiddlywiki.info` file. You start the server using the `wsserver` command
instead of the `server` command.

Also see <a href='./Configuration.md'>Configuration.md</a>.

#### Step by step instructions (using Node)

If you want to use a fresh local install of tiddlywiki here are command line
instructions:

Clone the tiddlywiki repo and get the plugin (Only do this the first time to
install everything):
```
git clone --depth=1 https://github.com/Jermolene/TiddlyWiki5.git
git clone --depth=1 https://github.com/OokTech/TW5-MultiUser.git TiddlyWiki5/plugins/OokTech/MultiUser
cp -r TiddlyWiki5/plugins/OokTech/MultiUser/MultiUserWiki TiddlyWiki5/editions/
```

After that is finished, and to start up tiddlywiki later type:

```
cd TiddlyWiki5
node ./tiddlywiki.js editions/MultiUserWiki  --wsserver
```

In a browser go to `127.0.0.1:8080` and the wiki should load. From here any
tiddlers you create should have .tid files created in the
`editions/MultiUserWiki/tiddlers` folder, any edits you do to those files
should be immediately reflected in the browser. Open the tiddler called
`$:/ServerIP`, if you go to the ip address listed there on port `8080` (on mine
right now the tiddler says `192.168.0.15`, so I put `192.168.0.15:8080` in the
browser of another computer on the same network to access the wiki). Now any
changes you make to tiddlers on one computer will be reflected almost
immediately on the other, and any chaneges you make to tiddlers or the file
system will be almost immediately reflected in all connected wikis.

If you want to use the global tiddlywiki install you have to set the
environment variable `TIDDLYWIKI_PLUGIN_PATH` and `TIDDLYWIKI_EDITION_PATH` to
the folder where you have your plugins. On OSX or Linux you open a terminal and
type these commands:

```
export TIDDLYWIKI_PLUGIN_PATH="/path/to/your/plugins"
export TIDDLYWIKI_EDITION_PATH="/path/to/your/editions"
tiddlywiki editions/MultiUserWiki  --wsserver
```

If you want to change settings see
<a href='./Configuration.md'>Configuration.md</a> for information.

### Notes

*NOTE 1 - .meta files:* there isn't full support for .meta files. The only
currently known limitation is that when you rename either the .meta file or the
file it describes the changes aren't correctly reflected in the browsers.
Renaming in the browser works as expected. Also empty .tid files are created
for any tiddler with a `_canonical_uri` field in addition to the .meta file.
This has no effect on the wiki.

*NOTE 2 - command line arguments and configuration:*
I am terrible with command line arguments.
To prevent the need to have 10 or 15 command line arguments in order to fully
configure a wiki I instead added a `settings` folder in the same folder that
holds the `tiddlers` folder and the `tiddlywiki.info` file. Inside this folder
there is a `settings.json` file that you can use the configure the wiki.
This also lets you change the wiki's settings from within the wiki. Most of the
settings wouldn't take effect until the wiki server is reset, so I made a way
to reset the wiki server from inside the wiki. You can also shutdown the wiki
server from inside the wiki.

*NOTE 3 - Terminal output:*
There will be a lot of messages in the terminal where you started the node
process. Messages saying `Cancel Editing Tiddler`, `Node Delete Tiddler`, the
messages come from every connected browser so the more connections there are
the more times they will be repeated. I am leaving them in for now for
debugging but they can be safely ignored.

---

## More Details

Here is a more detailed list of things added or changed by this plugin

- Two-way real-time syncing between the browser and file system
  - Makes tiddlywiki watch the tiddlers folder and updates any tiddlers in the
    wiki when there are changes to any tiddler files.
    - Makes tiddlywiki save any changes to tiddlers made in the wiki
    immediately to the file system
  - Uses an exclude list to ignore certain tiddlers when syncing in the browser
- Multi-User support
  - Allows any number of people or computers to connect to the wiki server and
    use or edit the same wiki simultaneously.
  - Prevents multiple people from editing the same tiddler at the same time by
    disabling the edit button for tiddlers currently being edited
- Multi-Wiki support
  - MultiUser ability on multiple wikis simultaneously
- Websockets!! (used on the back-end, can be used by other plugins in the
  future)
  - Adds a websocket interface to tiddlywiki (currently only used by this
    plugin, a git plugin is currently being developed as well as plugins to run
    scripts on the local computer from tiddlywiki)
  - Adds an action widget that allows you to send arbitrary websocket messages
    to the server. This can be used to do things like trigger shell scripts
    from inside the wiki.
- Adds a new command `wsserver` that starts up a minimal http server so the
  websockets work and so that the node process can spawn child processses which
  serve other wikis.
  - If the `autoIncrementPort` setting is set to `true` than it will start at
    the given port and if it is in use than it will try the next port until an
    open port is found.
- Adds some new hooks to the navigator widget that were needed (this doesn't
  change anything about how the navigator widget acts, it just adds some new
  places for hooks)
- Allows you to reset the tiddlywiki server from the browser using a websocket
  message.
- Adds a way to run shell scripts from the wiki
- Adds a utility to configure everything from inside the wiki
- Your connection to the server is monitored and you are warned if there is a
  problem
- Serve files from the local file system (like images) so that they can be
  used in the wiki.
- Build a single file version of any served wikis from within the wiki.
- *coming soon* Security and authentication to limit access and editing
- *coming soon* Exclude lists on a per-wiki and per-user basis
- *coming soon* each wiki is part of the same node process so communication and
  sharing tiddlers between the wikis is possible, I just haven't written the UI
  yet.
- *coming soon* Build single file wikis that take tiddlers from different wikis
