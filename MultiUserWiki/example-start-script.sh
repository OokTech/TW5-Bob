#!/usr/bin/env bash

# INSTRUCTIONS
#
# First you need to change the part after TIDDLYWIKI_PLUGIN_PATH= to match the
# location of the folder with your plugins
# If you have any themes or editions that you want to make available you can
# uncomment the lines below and add the path to them too.
#
# Then in the last line change ~/path/to/wiki/ to the path to your wiki folder.
#
# You can rename this file to whatever you want, and you can run this file from
# wherever you want.
# You will probably have to make this file executable on your system by typing:
#
# sudo chmod +x ./example-start-script.sh
#
# in the same folder as the script. On many systems you can also do this from
# the file manager but how to do it is different in different file managers.
# So if you know how to make a file executable form the file manager that
# should work too.

# You need to use the full path here, ~/TiddlyWiki/Plugins doesn't work
export TIDDLYWIKI_PLUGIN_PATH="/path/to/TiddlyWiki/Plugins"
#export TIDDLYWIKI_THEME_PATH="/path/to/TiddlyWiki/Themes"
#export TIDDLYWIKI_EDITION_PATH="/path/to/TiddlyWiki/Editions"

# The first argument is the path to the folder that contains the
# tiddlywiki.info file. The second is the server command for the Bob
# wiki.
tiddlywiki ~/path/to/wiki/ --wsserver
