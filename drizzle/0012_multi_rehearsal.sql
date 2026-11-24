-- Rebuild the rehearsal tables without the old single-project and 15-minute constraints.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE upgrade_rehearsal_projects (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published','ended')),
 revision INTEGER NOT NULL, script_version TEXT NOT NULL, deck_version TEXT NOT NULL, algorithm_version TEXT NOT NULL,
 document_json TEXT NOT NULL CHECK(json_valid(document_json)), updated_at TEXT NOT NULL,
 password_hash TEXT,credential_version INTEGER NOT NULL DEFAULT 0,published_json TEXT CHECK(published_json IS NULL OR json_valid(published_json)),deleted_at TEXT
);
INSERT INTO upgrade_rehearsal_projects(id,title,status,revision,script_version,deck_version,algorithm_version,document_json,updated_at) SELECT * FROM rehearsal_projects;
CREATE TABLE upgrade_rehearsal_versions (
 project_id TEXT NOT NULL REFERENCES upgrade_rehearsal_projects(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL, document_json TEXT NOT NULL CHECK(json_valid(document_json)), changed_at TEXT NOT NULL,
 PRIMARY KEY(project_id,revision)
);
INSERT INTO upgrade_rehearsal_versions SELECT * FROM rehearsal_versions;
CREATE TABLE upgrade_rehearsal_members (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES upgrade_rehearsal_projects(id) ON DELETE CASCADE,
 display_name TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN(0,1))
);
INSERT INTO upgrade_rehearsal_members SELECT * FROM rehearsal_members;
CREATE TABLE upgrade_rehearsal_files (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES upgrade_rehearsal_projects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN('audio','slide','pptx')), mime TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=20971520),
 hash TEXT NOT NULL, created_at TEXT NOT NULL
);
INSERT INTO upgrade_rehearsal_files SELECT * FROM rehearsal_files;
CREATE TABLE upgrade_rehearsal_file_chunks (
 file_id TEXT NOT NULL REFERENCES upgrade_rehearsal_files(id) ON DELETE CASCADE,
 chunk_index INTEGER NOT NULL CHECK(chunk_index>=0), data BLOB NOT NULL CHECK(length(data)>0 AND length(data)<=524288),
 PRIMARY KEY(file_id,chunk_index)
);
INSERT INTO upgrade_rehearsal_file_chunks SELECT * FROM rehearsal_file_chunks;
CREATE TABLE upgrade_rehearsal_recordings (
 id TEXT PRIMARY KEY REFERENCES upgrade_rehearsal_files(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES upgrade_rehearsal_projects(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES upgrade_rehearsal_members(id), turn_id TEXT NOT NULL,
 script_version TEXT NOT NULL, deck_version TEXT NOT NULL, algorithm_version TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'ready' CHECK(status='ready'), duration_ms INTEGER NOT NULL CHECK(duration_ms>0 AND duration_ms<=10800000),
 submitted_at TEXT NOT NULL, locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN(0,1)), complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN(0,1)),
 predicted_seconds REAL NOT NULL CHECK(predicted_seconds>=0), snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 events_json TEXT NOT NULL CHECK(json_valid(events_json)), metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 request_hash TEXT NOT NULL
);
INSERT INTO upgrade_rehearsal_recordings SELECT * FROM rehearsal_recordings;
CREATE TABLE upgrade_rehearsal_estimates (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES upgrade_rehearsal_projects(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL, algorithm_version TEXT NOT NULL, snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), calculated_at TEXT NOT NULL
);
INSERT INTO upgrade_rehearsal_estimates SELECT * FROM rehearsal_estimates;
CREATE TABLE upgrade_rehearsal_turn_progress (
 project_id TEXT NOT NULL REFERENCES upgrade_rehearsal_projects(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES upgrade_rehearsal_members(id), turn_id TEXT NOT NULL,
 script_version TEXT NOT NULL, deck_version TEXT NOT NULL, submitted_at TEXT NOT NULL,
 PRIMARY KEY(project_id,member_id,turn_id,script_version,deck_version)
);
INSERT INTO upgrade_rehearsal_turn_progress SELECT * FROM rehearsal_turn_progress;
UPDATE upgrade_rehearsal_projects SET published_json=document_json WHERE status IN ('published','ended');
DROP TRIGGER rehearsal_locked_limit;
DROP TRIGGER rehearsal_keep_three;
DROP TRIGGER rehearsal_delete_audio;
DROP TRIGGER rehearsal_mark_turn_submitted;
DROP TABLE rehearsal_turn_progress;
DROP TABLE rehearsal_recordings;
DROP TABLE rehearsal_file_chunks;
DROP TABLE rehearsal_files;
DROP TABLE rehearsal_versions;
DROP TABLE rehearsal_estimates;
DROP TABLE rehearsal_members;
DROP TABLE rehearsal_projects;
ALTER TABLE upgrade_rehearsal_projects RENAME TO rehearsal_projects;
ALTER TABLE upgrade_rehearsal_versions RENAME TO rehearsal_versions;
ALTER TABLE upgrade_rehearsal_members RENAME TO rehearsal_members;
ALTER TABLE upgrade_rehearsal_files RENAME TO rehearsal_files;
ALTER TABLE upgrade_rehearsal_file_chunks RENAME TO rehearsal_file_chunks;
ALTER TABLE upgrade_rehearsal_recordings RENAME TO rehearsal_recordings;
ALTER TABLE upgrade_rehearsal_estimates RENAME TO rehearsal_estimates;
ALTER TABLE upgrade_rehearsal_turn_progress RENAME TO rehearsal_turn_progress;
CREATE INDEX idx_rehearsal_members_project ON rehearsal_members(project_id,enabled);
CREATE INDEX idx_rehearsal_files_project ON rehearsal_files(project_id,kind);
CREATE INDEX idx_rehearsal_recordings_recent ON rehearsal_recordings(project_id,member_id,turn_id,submitted_at DESC);
CREATE TRIGGER rehearsal_locked_limit BEFORE INSERT ON rehearsal_recordings
WHEN (SELECT count(*) FROM rehearsal_recordings WHERE project_id=NEW.project_id AND member_id=NEW.member_id AND turn_id=NEW.turn_id AND locked=1)>=3
BEGIN SELECT RAISE(ABORT,'rehearsal_turn_locked'); END;
CREATE TRIGGER rehearsal_keep_three AFTER INSERT ON rehearsal_recordings BEGIN
 DELETE FROM rehearsal_files WHERE id IN (SELECT id FROM rehearsal_recordings WHERE project_id=NEW.project_id AND member_id=NEW.member_id AND turn_id=NEW.turn_id AND locked=0 ORDER BY submitted_at ASC,id ASC LIMIT MAX(0,(SELECT count(*) FROM rehearsal_recordings WHERE project_id=NEW.project_id AND member_id=NEW.member_id AND turn_id=NEW.turn_id)-3));
END;
CREATE TRIGGER rehearsal_delete_audio AFTER DELETE ON rehearsal_recordings BEGIN DELETE FROM rehearsal_files WHERE id=OLD.id; END;
CREATE TRIGGER rehearsal_mark_turn_submitted AFTER INSERT ON rehearsal_recordings BEGIN
 INSERT INTO rehearsal_turn_progress VALUES(NEW.project_id,NEW.member_id,NEW.turn_id,NEW.script_version,NEW.deck_version,NEW.submitted_at)
 ON CONFLICT(project_id,member_id,turn_id,script_version,deck_version) DO UPDATE SET submitted_at=MAX(submitted_at,excluded.submitted_at);
END;
CREATE TABLE rehearsal_access_sessions(token_hash TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES rehearsal_projects(id) ON DELETE CASCADE,credential_version INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX rehearsal_sessions_project ON rehearsal_access_sessions(project_id);
