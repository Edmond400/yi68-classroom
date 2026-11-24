-- Additive only. Existing class, incentive and attachment tables are untouched.
CREATE TABLE rehearsal_projects (
 id TEXT PRIMARY KEY CHECK (id='current'), title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published','ended')),
 revision INTEGER NOT NULL, script_version TEXT NOT NULL, deck_version TEXT NOT NULL, algorithm_version TEXT NOT NULL,
 document_json TEXT NOT NULL CHECK(json_valid(document_json)), updated_at TEXT NOT NULL
);
CREATE TABLE rehearsal_versions (
 project_id TEXT NOT NULL REFERENCES rehearsal_projects(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL, document_json TEXT NOT NULL CHECK(json_valid(document_json)), changed_at TEXT NOT NULL,
 PRIMARY KEY(project_id,revision)
);
CREATE TABLE rehearsal_members (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES rehearsal_projects(id) ON DELETE CASCADE,
 display_name TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN(0,1))
);
CREATE INDEX idx_rehearsal_members_project ON rehearsal_members(project_id,enabled);
CREATE TABLE rehearsal_files (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES rehearsal_projects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN('audio','slide')), mime TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=10485760),
 hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_rehearsal_files_project ON rehearsal_files(project_id,kind);
CREATE TABLE rehearsal_file_chunks (
 file_id TEXT NOT NULL REFERENCES rehearsal_files(id) ON DELETE CASCADE,
 chunk_index INTEGER NOT NULL CHECK(chunk_index>=0), data BLOB NOT NULL CHECK(length(data)>0 AND length(data)<=524288),
 PRIMARY KEY(file_id,chunk_index)
);
CREATE TABLE rehearsal_recordings (
 id TEXT PRIMARY KEY REFERENCES rehearsal_files(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES rehearsal_projects(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES rehearsal_members(id), turn_id TEXT NOT NULL,
 script_version TEXT NOT NULL, deck_version TEXT NOT NULL, algorithm_version TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'ready' CHECK(status='ready'), duration_ms INTEGER NOT NULL CHECK(duration_ms>0 AND duration_ms<=900000),
 submitted_at TEXT NOT NULL, locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN(0,1)), complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN(0,1)),
 predicted_seconds REAL NOT NULL CHECK(predicted_seconds>=0), snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 events_json TEXT NOT NULL CHECK(json_valid(events_json)), metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 request_hash TEXT NOT NULL
);
CREATE INDEX idx_rehearsal_recordings_recent ON rehearsal_recordings(project_id,member_id,status,submitted_at DESC,id DESC);
CREATE INDEX idx_rehearsal_recordings_turn ON rehearsal_recordings(project_id,turn_id,script_version,deck_version,locked);
CREATE TABLE rehearsal_estimates (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES rehearsal_projects(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL, algorithm_version TEXT NOT NULL, snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), calculated_at TEXT NOT NULL
);
CREATE TABLE rehearsal_write_guards (id TEXT PRIMARY KEY, allowed INTEGER NOT NULL CHECK(allowed=1));
CREATE TRIGGER rehearsal_guard_cleanup AFTER INSERT ON rehearsal_write_guards BEGIN DELETE FROM rehearsal_write_guards WHERE id=NEW.id; END;
CREATE TRIGGER rehearsal_locked_limit BEFORE INSERT ON rehearsal_recordings
WHEN (SELECT count(*) FROM rehearsal_recordings WHERE project_id=NEW.project_id AND member_id=NEW.member_id AND locked=1)>=3
BEGIN SELECT RAISE(ABORT,'rehearsal_all_three_locked'); END;
CREATE TRIGGER rehearsal_keep_three AFTER INSERT ON rehearsal_recordings BEGIN
 DELETE FROM rehearsal_files WHERE id IN (
  SELECT id FROM rehearsal_recordings WHERE project_id=NEW.project_id AND member_id=NEW.member_id AND locked=0
  ORDER BY submitted_at ASC,id ASC LIMIT MAX(0,(SELECT count(*) FROM rehearsal_recordings WHERE project_id=NEW.project_id AND member_id=NEW.member_id)-3)
 );
END;
CREATE TRIGGER rehearsal_delete_audio AFTER DELETE ON rehearsal_recordings BEGIN DELETE FROM rehearsal_files WHERE id=OLD.id; END;
