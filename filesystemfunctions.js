/*\
title: $:/plugins/OokTech/MultiUser/filesystemfunctions.js
type: application/javascript
module-type: startup

A module that contains functions used to save tiddlers as files

This was modified from the core version to work with the websockets interface.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// Get a reference to the file system
var fs = $tw.node ? require("fs") : null,
	path = $tw.node ? require("path") : null;

var setup = function () {
  $tw.MultiUser = $tw.MultiUser || {};
  //$tw.utils.createDirectory($tw.boot.wikiTiddlersPath);
  $tw.MultiUser.FileSystemFunctions = $tw.MultiUser.FileSystemFunctions || {};

  /*
  Return a fileInfo object for a tiddler, creating it if necessary:
    filepath: the absolute path to the file containing the tiddler
    type: the type of the tiddler file (NOT the type of the tiddler -- see below)
    hasMetaFile: true if the file also has a companion .meta file

  The boot process populates $tw.boot.files for each of the tiddler files that it loads. The type is found by looking up the extension in $tw.config.fileExtensionInfo (eg "application/x-tiddler" for ".tid" files).

  It is the responsibility of the filesystem adaptor to update $tw.boot.files for new files that are created.
  */
  $tw.MultiUser.FileSystemFunctions.getTiddlerFileInfo = function(tiddler,callback) {
    if (!callback) {
      callback = function () {

      }
    }
  	// See if we've already got information about this file
  	var self = this,
  		title = tiddler.fields.title,
  		fileInfo = $tw.boot.files[title];
  	if(fileInfo) {
  		// If so, just invoke the callback
  		callback(null,fileInfo);
  	} else {
  		// Otherwise, we'll need to generate it
  		fileInfo = {};
  		var tiddlerType = tiddler.fields.type || "text/vnd.tiddlywiki";
  		// Get the content type info
  		var contentTypeInfo = $tw.config.contentTypeInfo[tiddlerType] || {};
  		// Get the file type by looking up the extension
  		var extension = contentTypeInfo.extension || ".tid";
  		fileInfo.type = ($tw.config.fileExtensionInfo[extension] || {type: "application/x-tiddler"}).type;
  		// Use a .meta file unless we're saving a .tid file.
  		// (We would need more complex logic if we supported other template rendered tiddlers besides .tid)
  		fileInfo.hasMetaFile = (fileInfo.type !== "application/x-tiddler") && (fileInfo.type !== "application/json");
  		if(!fileInfo.hasMetaFile) {
  			extension = ".tid";
  		}
  		// Generate the base filepath and ensure the directories exist
  		var baseFilepath = path.resolve($tw.boot.wikiTiddlersPath, $tw.MultiUser.FileSystemFunctions.generateTiddlerBaseFilepath(title));
  		$tw.utils.createFileDirectories(baseFilepath);
  		// Start by getting a list of the existing files in the directory
  		fs.readdir(path.dirname(baseFilepath),function(err,files) {
  			if(err) {
  				return callback(err);
  			}
  			// Start with the base filename plus the extension
  			var filepath = baseFilepath;
  			if(filepath.substr(-extension.length).toLocaleLowerCase() !== extension.toLocaleLowerCase()) {
  				filepath = filepath + extension;
  			}
  			var filename = path.basename(filepath),
  				count = 1;
  			// Add a discriminator if we're clashing with an existing filename while
  			// handling case-insensitive filesystems (NTFS, FAT/FAT32, etc.)
  			while(files.some(function(value) {return value.toLocaleLowerCase() === filename.toLocaleLowerCase();})) {
  				filepath = baseFilepath + " " + (count++) + extension;
  				filename = path.basename(filepath);
  			}
  			// Set the final fileInfo
  			fileInfo.filepath = filepath;
  console.log("\x1b[1;35m" + "For " + title + ", type is " + fileInfo.type + " hasMetaFile is " + fileInfo.hasMetaFile + " filepath is " + fileInfo.filepath + "\x1b[0m");
  			$tw.boot.files[title] = fileInfo;
  			// Pass it to the callback
  			callback(null,fileInfo);
  		});
  	}
  };

  /*
  Given a list of filters, apply every one in turn to source, and return the first result of the first filter with non-empty result.
  */
  $tw.MultiUser.FileSystemFunctions.findFirstFilter = function(filters,source) {
  	for(var i=0; i<filters.length; i++) {
  		var result = $tw.wiki.filterTiddlers(filters[i],null,source);
  		if(result.length > 0) {
  			return result[0];
  		}
  	}
  	return null;
  };

  /*
  Given a tiddler title and an array of existing filenames, generate a new legal filename for the title, case insensitively avoiding the array of existing filenames
  */
  $tw.MultiUser.FileSystemFunctions.generateTiddlerBaseFilepath = function(title) {
  	var baseFilename;
  	// Check whether the user has configured a tiddler -> pathname mapping
  	var pathNameFilters = $tw.wiki.getTiddlerText("$:/config/FileSystemPaths");
  	if(pathNameFilters) {
  		var source = $tw.wiki.makeTiddlerIterator([title]);
  		baseFilename = $tw.MultiUser.FileSystemFunctions.findFirstFilter( pathNameFilters.split("\n"),source);
  		if(baseFilename) {
  			// Interpret "/" and "\" as path separator
  			baseFilename = baseFilename.replace(/\/|\\/g,path.sep);
  		}
  	}
  	if(!baseFilename) {
  		// No mappings provided, or failed to match this tiddler so we use title as filename
  		baseFilename = title.replace(/\/|\\/g,"_");
  	}
  	// Remove any of the characters that are illegal in Windows filenames
  	var baseFilename = $tw.utils.transliterate(baseFilename.replace(/<|>|\:|\"|\||\?|\*|\^/g,"_"));
  	// Truncate the filename if it is too long
  	if(baseFilename.length > 200) {
  		baseFilename = baseFilename.substr(0,200);
  	}
  	return baseFilename;
  };

  /*
  Save a tiddler and invoke the callback with (err,adaptorInfo,revision)
  */
  $tw.MultiUser.FileSystemFunctions.saveTiddler = function(tiddler,callback) {
    if (typeof callback !== 'function') {
      callback = function () {

      }
    }
    if (tiddler && $tw.MultiUser.ExcludeList.indexOf(tiddler.fields.title) === -1 && !tiddler.fields.title.startsWith('$:/state/') && !tiddler.fields.title.startsWith('$:/temp/')) {
      console.log('save tiddler function')
    	var self = this;
    	$tw.MultiUser.FileSystemFunctions.getTiddlerFileInfo(tiddler, function(err,fileInfo) {
    		if(err) {
    			return callback(err);
    		}
    		var filepath = fileInfo.filepath,
    			error = $tw.utils.createDirectory(path.dirname(filepath));
    		if(error) {
    			return callback(error);
    		}
    		if(fileInfo.hasMetaFile) {
          console.log('saving metafile');
    			// Save the tiddler as a separate body and meta file
    			var typeInfo = $tw.config.contentTypeInfo[tiddler.fields.type || "text/plain"] || {encoding: "utf8"};
    			fs.writeFile(filepath,tiddler.fields.text,{encoding: typeInfo.encoding},function(err) {
    				if(err) {
    					return callback(err);
    				}
            var content = makeTiddlerFile(tiddler);
    				fs.writeFile(fileInfo.filepath + ".meta",content,{encoding: "utf8"},function (err) {
    					if(err) {
    						return callback(err);
    					}
              // Save with metadata
              console.log('saved file with metadata', filepath)
              $tw.wiki.addTiddler(new $tw.Tiddler(tiddler.fields));
              Object.keys($tw.connections).forEach(function(connection) {
                $tw.MultiUser.WaitingList[connection][tiddler.fields.title] = true;
              });
    					return callback(null);
    				});
    			});
    		} else {
          console.log('saving')
    			// Save the tiddler as a self contained templated file
          var content = makeTiddlerFile(tiddler);
          // If we aren't passed a path
			    fs.writeFile(filepath,content,{encoding: "utf8"},function (err) {
    				if(err) {
    					return callback(err);
    				}
            console.log('saved file', filepath)
            $tw.wiki.addTiddler(new $tw.Tiddler(tiddler.fields));
            Object.keys($tw.connections).forEach(function(connection) {
              $tw.MultiUser.WaitingList[connection] = $tw.MultiUser.WaitingList[connection] || {};
              $tw.MultiUser.WaitingList[connection][tiddler.fields.title] = true;
            });
    				return callback(null);
    			});
    		}
    	});
    }
  };

  function makeTiddlerFile(tiddler) {
    var output = "";
    Object.keys(tiddler.fields).forEach(function(fieldName, index) {
      if (fieldName === 'created' || fieldName === 'modified') {
        output += `${fieldName}: ${$tw.utils.stringifyDate(new Date(tiddler.fields[fieldName]))}\n`;
      } else if (fieldName === 'list' || fieldName === 'tags'){
        output += `${fieldName}: ${$tw.utils.stringifyList(tiddler.fields[fieldName])}\n`;
      } else if (fieldName !== 'text') {
        output += `${fieldName}: ${tiddler.fields[fieldName]}\n`;
      }
    })
    if (tiddler.fields.text) {
      output += `\n${tiddler.fields.text}`;
    }
    return output;
  }

  /*
  Load a tiddler and invoke the callback with (err,tiddlerFields)

  We don't need to implement loading for the file system adaptor, because all the tiddler files will have been loaded during the boot process.
  */
  $tw.MultiUser.FileSystemFunctions.loadTiddler = function(title,callback) {
    if (!callback) {
      callback = function () {

      }
    }
  	callback(null,null);
  };

  /*
  Delete a tiddler and invoke the callback with (err)
  */
  $tw.MultiUser.FileSystemFunctions.deleteTiddler = function(title,callback,options) {
    if (!callback) {
      callback = function () {
        // Just a blank function to prevent errors
      }
    }
  	var self = this,
  		fileInfo = $tw.boot.files[title];
  	// Only delete the tiddler if we have writable information for the file
  	if(fileInfo) {
      //console.log(fileInfo.filepath)
  		// Delete the file
  		fs.unlink(fileInfo.filepath,function(err) {
  			if(err) {
  				return callback(err);
  			}
  			//self.logger.log("Deleted file",fileInfo.filepath);
  			// Delete the metafile if present
  			if(fileInfo.hasMetaFile) {
  				fs.unlink(fileInfo.filepath + ".meta",function(err) {
  					if(err) {
  						return callback(err);
  					}
  					return $tw.utils.deleteEmptyDirs(path.dirname(fileInfo.filepath),callback);
  				});
  			} else {
  				return $tw.utils.deleteEmptyDirs(path.dirname(fileInfo.filepath),callback);
  			}
  		});
  	} else {
  		callback(null);
  	}
  };

  /*
    Check if the file version matches the in-browser version of a tiddler
  */
  $tw.MultiUser.FileSystemFunctions.TiddlerHasChanged = function (tiddler, tiddlerFileObject) {
    if (!tiddlerFileObject) {
      return true;
    }
    if (!tiddler) {
      return true;
    }

    var changed = false;
    var longer = Object.keys(tiddler.fields).length > Object.keys(tiddlerFileObject.tiddlers[0]) ? Object.keys(tiddler.fields).length : Object.keys(tiddlerFileObject.tiddlers[0]);
    // check to see if the field values are the same, ignore modified for now
    longer.forEach(function(field) {
      if (field !== 'modified' && field !== 'created' && field !== 'list' && field !== 'tags') {
        if (!tiddlerFileObject.tiddlers[0][field] || tiddlerFileObject.tiddlers[0][field] !== tiddler.fields[field]) {
          // There is a difference!
          changed = true;
        }
      } else if (field === 'list' || field === 'tags') {
        if (tiddler.fields[field] && tiddlerFileObject.tiddlers[0][field]) {
          if ($tw.utils.parseStringArray(tiddlerFileObject.tiddlers[0][field]).length !== tiddler.fields[field].length) {
            changed = true;
          } else {
            var arrayList = $tw.utils.parseStringArray(tiddlerFileObject.tiddlers[0][field]);
            arrayList.forEach(function(item) {
              if (tiddler.fields[field].indexOf(item) === -1) {
                changed = true;
              }
            })
          }
        } else {
          changed = true;
        }
      }
    })
    return changed;
  };
}

if(fs) {
	setup();
}

})();
