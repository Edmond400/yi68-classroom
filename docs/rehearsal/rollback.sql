-- Local rollback drill only. Production normally rolls back Worker code while
-- retaining these additive tables and all existing/new data.
PRAGMA foreign_keys=ON;
DROP TRIGGER IF EXISTS rehearsal_mark_turn_submitted;
DROP TABLE IF EXISTS rehearsal_turn_progress;
DROP TRIGGER IF EXISTS rehearsal_delete_audio;
DROP TRIGGER IF EXISTS rehearsal_keep_three;
DROP TRIGGER IF EXISTS rehearsal_locked_limit;
DROP TRIGGER IF EXISTS rehearsal_guard_cleanup;
DROP TABLE IF EXISTS rehearsal_recordings;
DROP TABLE IF EXISTS rehearsal_file_chunks;
DROP TABLE IF EXISTS rehearsal_files;
DROP TABLE IF EXISTS rehearsal_members;
DROP TABLE IF EXISTS rehearsal_estimates;
DROP TABLE IF EXISTS rehearsal_versions;
DROP TABLE IF EXISTS rehearsal_write_guards;
DROP TABLE IF EXISTS rehearsal_projects;
