CREATE TABLE class_albums (
 id TEXT PRIMARY KEY NOT NULL,
 title TEXT NOT NULL,
 activity_date TEXT NOT NULL,
 semester TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
 cover_photo_id TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX class_albums_browse ON class_albums(published,activity_date DESC);
CREATE TABLE class_album_photos (
 id TEXT PRIMARY KEY NOT NULL,
 album_id TEXT NOT NULL REFERENCES class_albums(id) ON DELETE CASCADE,
 filename TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size > 0 AND size <= 31457280),
 checksum TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 thumbnail_key TEXT NOT NULL UNIQUE,
 thumbnail_size INTEGER NOT NULL,
 width INTEGER NOT NULL,
 height INTEGER NOT NULL,
 position INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE INDEX class_album_photos_order ON class_album_photos(album_id,position,created_at,id);
