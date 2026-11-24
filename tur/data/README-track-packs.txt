TUR BUILT-IN PACKS
=========================
The game reads the editable catalogue:

  data/TrackPacks/Default Packs.txt

Put each exported TUR Pack (.tsp.txt) in that same folder and list its
exact filename on a separate line in Default Packs.txt. Empty lines and lines
starting with # are ignored. The order in the file is the display order. For
example:

  Starter circuits.tsp.txt
  Grand Prix Sim.tsp.txt
  My new pack.tsp.txt

Upload the manifest and all listed files with the rest of the game. The site
must serve them as ordinary files; folder listing or server-side code is not
needed. File and folder names are case-sensitive on many web hosts. Refresh the
page after changing the manifest or a pack.

Use packs exported from the game's pack editor. Every pack must have a unique
UUID and at least one valid track. Do not list folder paths, web addresses, or
the same pack twice. Invalid, missing, or duplicate-ID files are skipped and a
message appears in My tracks & backups. An empty manifest intentionally makes
no packs built in. If the manifest is unavailable, or every listed pack fails,
the starter fallback remains available. Player-saved tracks and imported packs
are not changed by loading the catalogue.

New exports use "format": "TUR Pack" with version 1. Existing version 1
"TrackShift Pack" files continue to load and can be re-exported in the new
format. Their UUIDs and track contents are preserved.

Browsers commonly block fetch requests when index.html is opened directly from
disk (file://). In that mode the original starter pack remains available, but
the manifest and its other packs cannot be loaded automatically. To test the
full catalogue locally, serve the project with VS Code Live Server or run this
from the project folder if Python is installed:

  py -m http.server 8000

Then open http://127.0.0.1:8000/ in a browser. A hosted website automatically
uses its own address; Python is not required by players.

Players can import/export their own .tsp.txt packs in My tracks & backups.
Those are independent of the built-in files. Pack tracks can be played in
championships or individual races. Export packs separately from track backups.
