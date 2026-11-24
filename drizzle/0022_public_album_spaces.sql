CREATE TABLE album_classes (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 visibility TEXT NOT NULL DEFAULT 'link' CHECK(visibility IN ('public','link')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','hidden','archived')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
INSERT INTO album_classes VALUES ('yi68','艺68','六八六八，艺路生花','public','active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
ALTER TABLE class_albums ADD COLUMN class_id TEXT NOT NULL DEFAULT 'yi68';
ALTER TABLE class_albums ADD COLUMN indexed INTEGER NOT NULL DEFAULT 0 CHECK(indexed IN (0,1));
ALTER TABLE class_albums ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1));
ALTER TABLE class_albums ADD COLUMN uploads_open INTEGER NOT NULL DEFAULT 1 CHECK(uploads_open IN (0,1));
ALTER TABLE class_albums ADD COLUMN comments_open INTEGER NOT NULL DEFAULT 1 CHECK(comments_open IN (0,1));
ALTER TABLE class_album_photos ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1));
ALTER TABLE class_album_photos ADD COLUMN submission_hash TEXT;
ALTER TABLE class_album_comments RENAME TO legacy_album_comments;
CREATE TABLE class_album_comments (
 id TEXT PRIMARY KEY NOT NULL,
 photo_id TEXT NOT NULL REFERENCES class_album_photos(id) ON DELETE CASCADE,
 account_id TEXT REFERENCES student_accounts(id) ON DELETE SET NULL,
 author_name TEXT NOT NULL,
 content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 500),
 created_at TEXT NOT NULL,
 hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),
 submission_hash TEXT
);
INSERT INTO class_album_comments(id,photo_id,account_id,author_name,content,created_at) SELECT id,photo_id,account_id,author_name,content,created_at FROM legacy_album_comments;
DROP TABLE legacy_album_comments;
CREATE INDEX class_album_comments_photo ON class_album_comments(photo_id,hidden,created_at,id);
CREATE INDEX album_classes_directory ON album_classes(status,visibility,created_at,id);
CREATE INDEX class_albums_space ON class_albums(class_id,published,archived,activity_date DESC);
CREATE INDEX class_album_photos_recent ON class_album_photos(hidden,created_at DESC,id);
CREATE TABLE album_reports (
 id TEXT PRIMARY KEY NOT NULL,
 photo_id TEXT NOT NULL REFERENCES class_album_photos(id) ON DELETE CASCADE,
 comment_id TEXT REFERENCES class_album_comments(id) ON DELETE CASCADE,
 reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 created_at TEXT NOT NULL
);
CREATE INDEX album_reports_queue ON album_reports(status,created_at DESC);
CREATE TABLE album_object_cleanup (object_key TEXT PRIMARY KEY NOT NULL,created_at TEXT NOT NULL);
