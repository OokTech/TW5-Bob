# TW5-MultiUser

BIG DISCLAMER OF DOOM - THIS IS IN BETA, ONLY I HAVE TESTED THIS. EXPECT BUGS. IT SHOULDN'T MAKE YOUR COMPUTER EXPLODE BUT THEN AGAIN IT MAY.

This plugin is only usable on the node version of tiddlywiki

This plugin uses two npm modules in addition to tiddlywiki. So far I have been unsuccessful getting this to work with the modules installed globally, so this has to be done without installing tiddlywiki through npm at the moment.

Command line instructions:

Clone the tiddlywiki repo and get the plugin:
```
git clone https://github.com/Jermolene/TiddlyWiki5.git
cd TiddlyWiki5
npm install ws
npm install ip
cd plugins
mkdir OokTech
cd OokTech
git clone https://github.com/OokTech/TW5-MultiUser.git
```

Next copy the MultiUserWiki folder from the TW5-MultiUser plugin folder into the TiddlyWiki5/Editions folder

In a terminal navigate to the TiddlyWiki5 folder and type:

`node ./tiddlywiki.js editions/MultiUserWiki  --server 8080 $:/core/save/lazy-images text/plain text/html "" "" 0.0.0.0`

In a browser go to `127.0.0.1:8080` and the wiki should load. From here any tiddlers you create should have .tid files created in the `editions/MultiUserWiki/tiddlers` folder, any edits you do to those files should be immediately reflected in the browser. Open the tiddler called `$:/ServerIP`, if you go to the ip address listed there on port `8080` (on mine right now the tiddler says `192.168.0.15`, so I put `192.168.0.15:8080` in the browser of another computer on the network to access the wiki). Now any changes you make to tiddlers on one computer will be reflected almost immediately on the other, and any chaneges you make to tiddlers or the file system will be almost immediately reflected in all connected wikis.

---

This plugin does a few things:

- Makes tiddlywiki watch the tiddlers folder and updates any tiddlers in the wiki when there are changes to any tiddler files.
- Makes tiddlywiki save any changes to tiddlers made in the wiki immeditaely to the file system
- Uses an exclude list to ignore certain tiddlers in the browser
- Prevents multiple people from editing the same tiddler at the same time by disabling the edit button for tiddlers currently being edited
- Allows any number of people or computers to connect to the wiki server and use the same wiki simultaneously
- Adds a websocket interface to tiddlywiki (currently only used by this plugin, a git plugin is currently being developed as well as plugins to run scripts on the local computer from tiddlywiki)
- Adds an action widget that allows you to send arbitrary websocket messages to the server (currently unused by this plugin)
- Adds some new hooks to the navigator widget (this doesn't change anything about how the navigator widget acts, it just adds some new places for hooks)

- *coming soon* Exclude lists on a per-wiki and per-user basis
- *coming soon* MultiUser ability on multiple wikis simultaneously
- *coming soon* an indication if your connection to the server is active or not

Some notes:

There will be a lot of messages in the terminal where you started the node process. Messages saying `Cancel Editing Tiddler`, `Node Delete Tiddler`, the messages come from every connected browser so the more connections there are the more times they will be repeated. I am leaving them in for now for debugging but they can be safely ignored.

As soon as you edit anything the browser will make the save button turn red, this doesn't mean anything. I need to look at how to change the dirty status of the wiki because there are ways to tell if changes have been saved or not using this. Changes are saved very quickly so the red save button can be safely ignored for now.
