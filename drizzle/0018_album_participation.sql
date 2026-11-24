ALTER TABLE class_album_photos ADD COLUMN uploaded_by TEXT REFERENCES student_accounts(id) ON DELETE SET NULL;
ALTER TABLE class_album_photos ADD COLUMN uploaded_by_name TEXT NOT NULL DEFAULT '管理员';
CREATE TABLE class_album_comments (
 id TEXT PRIMARY KEY NOT NULL,
 photo_id TEXT NOT NULL REFERENCES class_album_photos(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES student_accounts(id) ON DELETE CASCADE,
 author_name TEXT NOT NULL,
 content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 500),
 created_at TEXT NOT NULL
);
CREATE INDEX class_album_comments_photo ON class_album_comments(photo_id,created_at,id);
