"use strict";

/* Start aplikacji: ładowany na końcu, gdy app.js, songs.js i card-edit.js są gotowe. */

syncViewButtons();
setEditorOpen(store.get("editorOpen", window.innerWidth > 860 ? "1" : "0") === "1");
songLibrary.init();
