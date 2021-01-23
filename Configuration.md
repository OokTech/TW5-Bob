# Configuration

Configuration for the plugin is set in the `settings.json` file in the
`settings` sub-folder of the folder where the `tiddlywiki.info` file is
located.

Everything is optional, if there are any missing pieces default values will be
used. If the json isn't formatted correctly than default values will be used.

Some options are only available when using the secure server version. They are
marked in the explanations below.

## Example settings.json file

```
{
  "editionsPath": "./Editions",
  "pluginsPath": "./Plugins",
  "themesPath": "./Themes"
  "wikisPath": "./Wikis",
  "proxyprefix": "wiki"
  "wikiPathBase": "cwd",
  "includePluginList": [],
  "excludePluginList": [],
  "autoUnloadWikis": "false",
  "disableBrowserAlerts": "false",
  "disableFileWatchers": "no",
  "fileURLPrefix": "files",
  "namespacedWikis": "false",
  "saveMediaOnServer": "yes",
  "suppressBrowser": "false",
  "enableFederation": "no",
  "enableFileServer": "no",
  "filePathRoot": "./files",
  "perWikiFiles": "no",
  "enableBobSaver": "yes",
  "persistentUsernames": "no",
  "scripts": {
    "NewWiki": "tiddlywiki #wikiName --init #editionName"
  },
  "wikis": {
    "OneWiki": "/home/inmysocks/TiddlyWiki/Wikis/OneWiki",
    "TwoWiki": "/home/inmysocks/TiddlyWiki/Wikis/TwoWiki",
    "OokTech": {
      "TestWiki": "/home/inmysocks/TiddlyWiki/Wikis/TestWiki"
    }
  },
  "ws-server": {
    "port": 8080,
    "host": "127.0.0.1",
    "autoIncrementPort": "false",
    "servePlugin": "true",
    "servePluginWithoutLogin": "yes",
    "pathprefix": ""
  },
  "heartbeat": {
    "interval": 1000,
    "timeout": 5000
  },
  "mimeMap": {
    ".aac": "audio/aac",
    ".avi": "video/x-msvideo",
    ".bmp": "image/bmp",
    ".css": "text/css",
    ".csv": "text/csv",
    ".doc": "application/msword",
    ".epub": "application/epub+zip",
    ".gif": "image/gif",
    ".html": "text/html",
    ".htm": "text/html",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".mpeg": "video/mpeg",
    ".odp": "application/vnd.oasis.opendocument.presentation",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".oga": "audio/ogg",
    ".ogv": "video/ogg",
    ".ogx": "application/ogg",
    ".otf": "font/otf",
    ".pdf": "application/pdf",
    ".ppt": "application/vnd.ms-powerpoint",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".ttf": "font/ttf",
    ".txt": "text/plain",
    ".wav": "audio/wav",
    ".weba": "audio/weba",
    ".webm": "video/webm",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".xml": "text/xml"
  },
  "API": {
    "enableFetch": "no",
    "enablePush": "no",
    "pluginLibrary": "no"
  },
  "logger": {
    "useFileLogging":"no",
    "fileLogLevel": "2",
    "outputFolder": "./logs",
    "outputBaseFileName": "Log",
    "useSeparateErrorFile": "no",
    "outputErrorFileName": "Error",
    "ignoreErrors": "yes",
    "useBrowserLogging": "no",
    "browserLogLevel": "2",
    "useConsoleLogging": "yes",
    "consoleLogLevel": "2"
  },
  "federation": {
    "serverName": "Noh Neigh-m",
    "mobile": "no",
    "enableChat": "no",
    "udpPort": "3232",
    "enableMulticast": "yes",
    "multicastAddress": "224.0.0.114",
    "broadcast": "yes",
    "rebroadcastInterval": "30000",
    "checkConnections": "yes"
  },
  "advanced": {
    "localMessageQueueTimeout": 500,
    "federatedMessageQueueTimeout": 1500,
    "saveTiddlerDelay": 200
  },
  "servingFiles": {
    "name": "/path/to/files"
  },
  "saver": {
    "host": "localhost",
    "port": "61192",
    "key": "",
    "disable": "no"
  },
  "backups": {
    "enable": "no",
    "backupFolder": "./backups",
    "backupInterval": 600000,
    "saveOnLoad": "yes",
    "saveOnModified": "yes",
    "maxBackups": 10
  },
  "pluginLibrary": {
    "allPublic": "yes"
  },
  "editionLibrary": {
    "allPublic": "yes"
  },
  "themeLibrary": {
    "allPublic": "yes"
  },
  "profileOptions": {
    "allowPublic": "yes",
    "allowLoggedIn": "yes",
    "allowPrivate": "yes",
    "allPublic": "no"
  }
}
```

''Note:'' All paths can be either absolute or relative. Relative paths are
relative to the path listed in `wikiPathBase`, if none is listed they are
relative to the folder with tiddlywiki.js in it if you are using the plugin
version or the folder with the executable file if you are using the BobEXE
version.

''Note for windows:'' All the example paths here are how they would appear on
linux or osx. On windows the paths would look like
`C:\Users\inmysocks\TiddlyWiki\Wikis`. To make the examples what you would use
in windows replace `/home` with `C:\Users` and change the `/` into `\`.

## What each part is

- `editionsPath` is the folder that holds any custom editions you want to be
  able to use when making wikis using the control panel.  If relative it is
  relative to `wikiPathBase`.
- `pluginsPath` is the path to the plugins folder if you are using the as a
  plugin library.  If relative it is relative to `wikiPathBase`.
- `themesPath` is the path to the folder where you have your themes.  If
  relative it is relative to `wikiPathBase`.
- `wikisPath` the name of the default wikis folder to use. If relative it is
  relative to `wikiPathBase`.
- `wikiPathBase` relative paths for everything other than serving files are
  relative to this path. If you want a portable setup this must be set to
  `cwd`, if you set it as `./` the paths are relative to the users home
  directory. It defaults to the current working directory. If this is set to a
  relative path it is relative to the user home directory.
- `includePluginList` is an array of plugin names that will be included in
  every wiki served. You do not have to include Bob in this list.
- `excludePluginList` is an array of plugin names that will not be included in
  any wiki served, even if it is listed in the tiddlywiki.info file. This does
  not prevent someone from installing the plugin via drag-and-drop or from a
  plugin library, it just affects plugins listed in `tiddlywiki.info` files.
- `autoUnloadWikis` if this is set to `true` than wikis with no active
  connections will be automatically unloaded from memory. (experimental, may
  cause problems)
- `disableBrowserAlerts` if this is set to `true` than no alerts are sent to
  the browser wikis. This can also be set on a per-wiki basis in the control
  panel.
- `disableFileWatchers` if this is set to `yes` than the file system monitor
  component is disabled. This may help with some setups that use network drives
  to store tiddlers.
- `fileURLPrefix` is the prefix used to distinguish file links from wikis. This
  has the normal restrictions on names as any URL, so avoid special characters.
  This defaults to `files` and only have an affect if you have also set
  `filePathRoot`.
  Note: If you set this to an empty string it will use the default value of
  `files` unless you set the `acceptance` value described below. This will break
  things and no tech support will be provided.
- `namespacedWikis` (external server only) this only has an effect if you are
  using an external server with a login. If so this prefixes the wiki path with
  the currently logged in persons name when creating a wiki.
- `saveMediaOnServer` if this is set to `yes` any files with a type listed in
  the mime map are uploaded to the server and a `_canonical_uri` tiddler is
  created for the file instead of importing the file directly into the wiki.
  - This only takes effect if `enableFileServer` is also set to `yes`.
- `suppressBrowser` is only used if you are using the single executable
  version. If it is set to `true` than the browser isn't opened automatically
  when the server is started.
- `enableFederation` setting this to `yes` enables federation with remote
  servers.
- `enableFileServer` setting this to `yes` enables the static file server.
- `filePathRoot` this is the base path for files that are globally available.
- `perWikiFiles` setting this to `yes` means that files specific to a wiki
  (that is files in the wikis `files` folder next to the wikis `tiddlers`
  folder) are only available in that wiki, so no hotlinking.
- `enableBobSaver` setting this to `no` disables the Bob saver for single file
  wikis. By default this is enabled.
- `persistentUsernames` setting this to `yes` stores the user name entered for
  the wiki in a cookie so it is saved the next time you open the wiki using the
  same browser. As long as cookies aren't cleared and the cookie doesn't expire
  first.
- `scripts` a list of scripts that you can call from inside the wiki using the
  `runScript` websocket message.
- `wikis` a list of child wikis to serve. The path to the wikis is determined
  by the name given. In the example above the wiki located at
  `/home/inmysocks/TiddlyWiki/Wikis/OneWiki` would be served on
  `localhost:8080/OneWiki` and the wiki located at
  `/home/inmysocks/TiddlyWiki/Wikis/TestWiki` would be served on
  `localhost:8080/OokTech/TestWiki`. You may have as many levels and wikis as
  you want.
- `ws-server` settings for the `wsserver` command.
  - `port`
  - `host`
  - `rootTiddler` changing this will probably break everything
  - `renderType` changing this will probably break everything
  - `serveType` changing this will probably break everything
  - `pathprefix` a prefix for the path that wikis are served on.
  - `autoIncrementPort` if not set to `false` than the server
    will try using the given port (`8080` by default) and if it is in use it
    will try the next port up and continue until it finds an open port to use.
    If this is set to false than if the given port is in use an error is thrown
    and the process fails.
  - `servePlugin` is not `false` than any child wiki served will include the
    Bob plugin. So you can serve wikis that don't normally have the plugin and
    edit them as though they did.
  - `servePluginWithoutLogin` (external server only) if set to `no` and
    `servePlugin` isn't set to `false` than the Bob plugin will only be served
    to people who are logged in. So anyone not logged in a single file wiki
    that doesn't save anything to the server and doesn't update when changes
    are made to the wiki on the server. If this is set to `no` a person would
    have to login and then reload the wiki to get the version with the Bob
    plugin.
- `heartbeat` settings for the heartbeat that makes sure the browser and server
  are still connected. You can almost certainly ignore these settings.
  - `interval` the heartbeat message is sent every `interval` milliseconds
  (1000 milliseconds = 1 second).
  - `timeout` is the length of time to wait for a heartbeat signal before
  assuming that the connection is no longer working.
- `mimeMap` lists the file extensions and their associated mime-types that the
  server is allowed to serve. This only has an effect if `filePathRoot` is set.
- `API` things in this group are used for the api used for inter-server
  communication using the TWederBob plugin. This is only active if you use the
  `--wsserver` command, if you use an external server than these don't do
  anything.
  - `enablePush` if this is set to `yes` than the server will accept tiddlers
    pushed using the TWederBob plugin.
  - `enableFetch` if this is set to `yes` than the server will let people fetch
    tiddlers from the server using the TWederBob plugin.
  - `pluginLibrary` if this is set to `yes` than the server will act as a
    plugin library. (you also have to set the `pluginsPath`, see above)
- `logger` settings for the logger Bob uses
  - `useFileLogging` set to `yes` to enable writing logs to files
  - `fileLogLevel` set this to an integer from `0` to `4` to indicate how
    much logging you want in the log files. `0` is none, `4` is everything.
  - `outputFolder` set to the folder name to use for the log files
  - `outputBaseFileName` logs will use this as the base name
  - `useSeparateErrorFile` set to `yes` if you want to have separte files for
    logs and error messages (stdout vs stderr)
  - `outputErrorFileName` set this to the base file name to use for error log files
  - `ignoreErrors` set this to `yes` to ignore logger errors (recommended!)
  - `useBrowserLogging` set this to `yes` to have log messages sent to the
    browser
  - `browserLogLevel` set this to an integer from `0` to `4` to indicate how
    much logging you want in the browser. `0` is none, `4` is everything.
  - `useConsoleLogging` set this to `yes` to log output to the console
  - `consoleLogLevel` set this to an integer from `0` to `4` to indicate how
    much logging you want in the console. `0` is none, `4` is everything.
- `federation` settings for inter-server federation and connections
  - `serverName` is the human readable name that the server uses to identify
    itself. It does not need to be unique, but having it be unique is less
    confusing.
  - `mobile` set this to `yes` if the server isn't going to have the same url
    or ip address all the time.
  - `enableChat` set this to `yes` to enable the federated chat server.
  - `udpPort` this is the port used by the udp socket used to connect to other
    servers.
  - `multicastAddress` this is the multicast ip used for using multicast on the
    local network to find other servers.
  - `broadcast` if `yes` Bob will periodically send udp multicast messages to announce its presence to other Bob servers.
  - `rebroadcastInterval` if `broadcast` is set to `yes` this is the interval between udp multicast messages
  - `checkConnections` if set to `yes` the server will send a ping trying to contact any known servers to maintain
- `advanced` these are advanced settings that should almost never have to be
  changed. Changing these values can cause undesired or unexpected behaviour.
  - `localMessageQueueTimeout` for local messages, the maximum time the server
    will wait for an acknowledgement before assuming that a message has been
    lost and the server tries to resend the message. The value is in ms.
    Default `500`. Smaller values may cause lots of retries even when a message
    is sent correctly, larger values make the server take longer to respond to
    errors.
  - `federatedMessageQueueTimeout` for federated messages, the maximum time
    that the server will wait for an acknowledgement before assuming that a
    message has been lost and tries to resend the message. The value is in ms.
    Default `1500`. Smaller values may cause lots of retries even when a
    message is sent correctly, larger values make the server take longer to
    respond to errors.
  - `saveTiddlerDelay` the minimum delay between when a save tiddler message is
    added to the message queue and when it is sent. This prevents save tiddler
    messages from being sent with each keystroke when editing certain tiddlers
    causing a race condition and giving unexpected results or an infinite
    update loop. The value is in ms. Default: `200`. Smaller values may cause
    more race conditions. Larger values make the server wait longer before
    saving a tiddler.
- `servingFiles` this lists the prefixes and folders that hold files that can
  be served.
  - The items in this are in the form `prefix: /path/to/folder`, see the file
    server documentation for more.
- `saver` this holds settings for the single file saver
  - `host` the host for the saver server. You should never change this. if you
    change this you will get no assistance for anything that you lose, break or
    have stolen from you. Changing this requires you to fill out the
    `acceptance` field below.
  - `port` the port that the saver listens on. Changing this can break the
    saver, so only change it if you know what you are doing.
  - `key` an optional key, if this is set than the same key has to be entered
    in each of the single file wikis in order for the server to save them.
  - `disable` set this to `yes` to disable the single file saver sever
- `backups` this holds settings for automatic backups
  - `enable` if this is set to `yes` automatic backups are enabled
  - `backupFolder` the folder to store the backups in.
  - `backupInterval` how long to wait after a change to make a backup in ms.
    Default is `600000`, which is 10 minutes,
  - `saveOnLoad` if this is set to `yes` a backup will be saved when a wiki is
    loaded.
  - `saveOnModified`if this is set to `yes` a backups will be triggered by
    edits to the wiki (see the documentation for important notes about this)
  - `maxBackups` is the maximum number of backups to keep for any wiki. If
    there are more than this the oldest are removed until there are at most
    this number of backups.
- `pluginLibrary` (external server only) this holds settings for the plugin
  library
  - `allPublic` if this is set to `yes` there are no access checks when someone
    tries to get a plugin.
- `editionLibrary` (external server only) this holds settings for the edition
  library
  - `allPublic` if this is set to `yes` there are no access checks when someone
    tries to get an edition.
- `themeLibrary` (external server only) this holds settings for the theme
  library
  - `allPublic` if this is set to `yes` there are no access checks when someone
    tries to get a theme.
- `profileOptions` (external server only) this holds settings for what profile
  options are available on the server
  - `allowPublic` if this is set to `yes` profiles can be set as public
  - `allowLoggedIn` if this is set to `yes` profiles can be set as logged in
    only
  - `allowPrivate` if this is set to `yes` profiles can be set to private
  - `allPublic` if this is set to `yes` all profiles are public regardless of
    other options set.
- `acceptance` this is a setting for accepting that you will get no help if you
  do something that requires it to be set. These are things that are either
  insecure or have a very good chance of breaking your wiki. You will get no
  tech support if you do any of them. If you want to do it anyway than you need
  to give this the value `I Will Not Get Tech Support For This`.
- `allowUnsafeMimeTypes` setting this to `true` lets you serve anything
  ignoring the mimeMap. This is a bad idea but it was consistently requested so
  you have to fill out the `acceptance` key and you will receive no support for
  any problems that arise.

''Note:'' Only changes to the `scripts` and `wikis` will be available without
restarting the server. You still need to save the settings using the
`Update Settings` button after making changes in the `Manual Settings` tab
under the `Bob Settings` tab in the $:/ControlPanel. If you change a wiki name
or path you also need to click on the `Update Routes` button after you click on
the `Update Settings` button for your changes to take effect.

Any other changes require a full server restart.
