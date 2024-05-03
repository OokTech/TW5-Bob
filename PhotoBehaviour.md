# Photo Management

You have to install sharp, sharp-bmp and exifr

There are two ways to import photos, one is dropping it in the wiki and the other is having the server scan a folder.

1. When dropping a photo into the wiki, if the `save media on server`, `enable file server` and `photo thumbnails` options are set, the original gets 
    saved to the appropriate `files` folder for the wiki. The server calculates the hash for the photo, generates a thumbnail image for the photo and then saves a tiddler with the image and fields for the hash, a flag marking it as a thumbnail image and the path to the saved original.
    The tiddler title is the hash of the original, it uses a subtitle to show the photo name which defaults to the file name but is changable.
    We also have to get the exif data from the images and include those as fields. The naming should be `exif_XXX` where `XXX` is the exif field name.
2. When scanning a folder the same thing happens but the original is left in place.

When a photo gets added or a folder is scanned we calculate the hash of each photo and check it against existing photos. If the photo has an entry already we check to see if the path is the same, if not we add a `duplicates` field to the tiddler and the field is a list of paths to the same photos.
We have an option to check if the photo has been moved, so when a potential duplicate is found it checks to see if the photo is still at the old path, if not the uri field is updated instead of adding the path to the dupliactes. Each duplicate can be checked as well, that is TBD.

There needs to be a check and prune function where it will scan what is in the database and check to see if the photos are still at the expected paths and remove any paths that are no longer in use.

We do not delete thumbnails and metadata when doing this because the photo may have been moved and not re-scanned yet, in that case we don't want to lose the fields we have added to the photo previously.