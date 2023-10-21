# WikiDBAdaptor

The WikiDBAdaptor is a syncadaptor for Bob that uses WikiDB as the back-end store.

## Requirements

To work the WikiDB needs to contain databases that hold the required information for the wikis, including the core and any plugins for the wikis.

Databases to include

- `__boot` - the boot tiddlers (`$:/boot/boot.css`, `$:/boot/boot.js`, `$:/boot/bootprefix.js`, `$:/library/sjcl.js`)
- `__languages` - any languages for the wikis
- `__plugins` - any plugins for the wikis (including `$:/core` and `$:/plugins/OokTech/Bob`)
- `__settings` - the server settings
- `__themes` - any themes for the wikis
- `__wikiInfo` - the `plugin.info` information for each wiki

## Wikis

Each wiki gets its own database named the same as the wiki. Each wiki has a document with the same name as the wiki in the `__wikiInfo` database that has the `plugin.info` for the wiki.