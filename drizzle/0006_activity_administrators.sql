CREATE TABLE activity_admin_grants (
 account_id TEXT PRIMARY KEY REFERENCES student_accounts(id),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
ALTER TABLE incentive_tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE incentive_activities ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE incentive_claims ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
-- A failing guard aborts its whole D1 batch, including all writes and audit.
-- Guard rows are deleted within the same transaction and are never backed up.
CREATE TABLE incentive_write_guards (
 id TEXT PRIMARY KEY,
 allowed INTEGER NOT NULL CONSTRAINT valid_activity_write CHECK(allowed=1)
);
