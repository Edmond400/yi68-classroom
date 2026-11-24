-- Completion is independent of the rolling three audio files.
CREATE TABLE rehearsal_turn_progress (
 project_id TEXT NOT NULL REFERENCES rehearsal_projects(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES rehearsal_members(id), turn_id TEXT NOT NULL,
 script_version TEXT NOT NULL, deck_version TEXT NOT NULL, submitted_at TEXT NOT NULL,
 PRIMARY KEY(project_id,member_id,turn_id,script_version,deck_version)
);
INSERT INTO rehearsal_turn_progress(project_id,member_id,turn_id,script_version,deck_version,submitted_at)
SELECT project_id,member_id,turn_id,script_version,deck_version,MAX(submitted_at)
FROM rehearsal_recordings WHERE status='ready'
GROUP BY project_id,member_id,turn_id,script_version,deck_version;
CREATE TRIGGER rehearsal_mark_turn_submitted AFTER INSERT ON rehearsal_recordings BEGIN
 INSERT INTO rehearsal_turn_progress(project_id,member_id,turn_id,script_version,deck_version,submitted_at)
 VALUES(NEW.project_id,NEW.member_id,NEW.turn_id,NEW.script_version,NEW.deck_version,NEW.submitted_at)
 ON CONFLICT(project_id,member_id,turn_id,script_version,deck_version)
 DO UPDATE SET submitted_at=MAX(submitted_at,excluded.submitted_at);
END;
