# Test Cases

Until we get some automated testing set up this is a list of tests that should
show at least the most common places where something may be broken.

If you create something make sure that all of the following work after your
changes:

## Creating, deleting and editing tiddlers

1. The wiki actually boots
2. Loading the wiki in one browser doesn't crash the node process
3. Loading the wiki in multiple browser tabs/on multiple computers doesn't
  crash the node process.
4. Creating a tiddler in one browser tab results in:
  - The tiddler appearing in another already-open browser tab with the same
    wiki open
  - The corresponding .tid file appears on the file system
  - Opening up the wiki in a new browser tab/browser/computer shows the new tiddler
  - After re-loading an already open wiki the tiddler is still shown in that
    wiki
  - The tiddler still exists after stopping and restarting the node process and
    then re-loading the wiki.
5. Creating a new .tid file with the proper fields present results in:
  - The tiddler appears in any open wikis
  - The tiddler appears in any new wikis opened
  - The tiddler persists after reloading an already loaded wiki
  - The tiddler persists after stopping and restarting the node process
6. Deleting a tiddler in one browser tab results in:
  - The tiddler also being deleted in any other open wikis
  - The corresponding .tid file being removed from the file system
  - The tiddler not being present when opening a new wiki
  - The tiddler not being present after stopping the node process and
    restarting it
7. Deleting a tiddler from the file system results in:
  - The tiddler also being deleted in any other open wikis
  - The corresponding .tid file being removed from the file system
  - The tiddler not being present when opening a new wiki
  - The tiddler not being present after stopping the node process and
    restarting it
8. Editing a tiddler in a browser:
  - Other browser tabs etc. with the wiki show the edit button locked for that
    tiddler while it is being edited
  - Changes to the tiddler appear almost immediately in other browser tabs
    after saving the changes to the tiddler.
  - Changes to the tiddler appear on the file system
9. Editing a tiddler on the file system:
  - The changes appear almost immediately in any connected browsers after the
    tiddler is saved
  - Adding one or more tags to a tid file that doesn't already have tags listed
    adds the tags to the tiddlers in already open wikis
  - Removing all tags from a tid file that has one or more tags removes the
    tags from open wikis
10. Renaming a tiddler in the browser:
  - Changes appear in other browser tabs
  - The old .tid file is gone, a new .tid file with the correct name for the
    new title is there
11. Renaming a tiddler on the file system (by changing the title field in the
    .tid file):
  - The file is deleted and a new file with the correct name for the new
    tiddler is created
  - The new tiddler is created in all connected wikis
  - The old tiddler is deleted from all connected wikis
  - Changes persist in newly opened wikis or reloaded wikis (both deleting the
    old title and creating the new one)
12. Importing tiddlers - TODO what do we test here?
13. Adding and removing tags
  - In browser and on the file system

## Admin Tasks

1. Settings can be modified and saved correctly
  - TODO How do we test this?
2. Resetting the wiki paths doesn't break anything
  - TODO how to test this?

## Serving wikis

1. The root wiki is served without errors
  - TODO
2. Child wikis are served without errors
  - TODO
3. Static files can be served when properly configured
  - TODO

TODO - The rest

## Creating new wikis

TODO - This part

## Syncing on Reconnect

1. Browser->Server syncing
  - Disconnect from the server (stop the server process),
  - create a tiddler
  - delete a tiddler,
  - edit a tiddler,
  - rename a tiddler.
  - Restart the server and open the wiki in a new tab. Then reconnect the already open wiki to the server.
    - The created tiddler should now exist in the new wiki tab
    - The deleted tiddler should not exist in the new wiki tab
    - The edited tiddler should be changed in the new wiki tab
    - The renamed tiddler should be renamed in the new tab (old name should be deleted, new name should exist)
2. Server->Browser syncing
  - TODO this part
3. Conflicts should be properly shown
  - TODO this part

## Loading and Unloading Wikis

1. Load the root wiki and a child wiki in a browser then unload the child wiki.
  - The child wiki in the browser should show that it is disconnected
  - Reloading the wiki should work
2. Unload the root wiki from the root wiki
  - The wiki should show that it is disconnected
  - Reloading the wiki should work
3. Reconnecting should do something...

## Logging

During all of the above tests make sure that there aren't any left-over debug
messages left in.
