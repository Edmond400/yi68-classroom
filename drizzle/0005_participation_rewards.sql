CREATE TABLE incentive_members (
 student_id TEXT PRIMARY KEY REFERENCES class_roster(student_id),
 is_committee INTEGER NOT NULL DEFAULT 0 CHECK(is_committee IN (0,1))
);
CREATE TABLE incentive_activations (
 student_id TEXT PRIMARY KEY REFERENCES class_roster(student_id),
 token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL
);
CREATE TABLE incentive_tasks (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('general','public_account')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE incentive_activities (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES incentive_tasks(id),
 occurred_at TEXT NOT NULL,
 content TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','cancelled')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX idx_incentive_activity_date ON incentive_activities(occurred_at);
CREATE TABLE incentive_participations (
 id TEXT PRIMARY KEY,
 activity_id TEXT NOT NULL REFERENCES incentive_activities(id),
 student_id TEXT NOT NULL REFERENCES class_roster(student_id),
 role TEXT NOT NULL DEFAULT '',
 duty INTEGER NOT NULL DEFAULT 0 CHECK(duty IN (0,1)),
 status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','void')),
 approved_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(activity_id,student_id)
);
CREATE INDEX idx_incentive_person ON incentive_participations(student_id);
CREATE TABLE incentive_counts (
 participation_id TEXT PRIMARY KEY REFERENCES incentive_participations(id),
 task_id TEXT NOT NULL REFERENCES incentive_tasks(id),
 student_id TEXT NOT NULL REFERENCES class_roster(student_id),
 day TEXT NOT NULL,
 award_month TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(task_id,student_id,day)
);
CREATE INDEX idx_incentive_count_month ON incentive_counts(award_month);
CREATE TABLE incentive_claims (
 id TEXT PRIMARY KEY,
 student_id TEXT NOT NULL REFERENCES class_roster(student_id),
 activity_id TEXT REFERENCES incentive_activities(id),
 task_title TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('general','public_account')),
 occurred_at TEXT NOT NULL,
 content TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 fingerprint TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 resolution TEXT NOT NULL DEFAULT '',
 participation_id TEXT REFERENCES incentive_participations(id),
 created_at TEXT NOT NULL,
 reviewed_at TEXT
);
CREATE UNIQUE INDEX idx_incentive_claim_pending ON incentive_claims(student_id,fingerprint) WHERE status='pending';
CREATE TABLE incentive_periods (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('month','semester')),
 label TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 quota INTEGER NOT NULL,
 result_json TEXT,
 published_at TEXT,
 delivery_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_incentive_due ON incentive_periods(ends_at) WHERE result_json IS NULL;
CREATE TABLE incentive_audit (
 id TEXT PRIMARY KEY,
 actor TEXT NOT NULL,
 action TEXT NOT NULL,
 target TEXT NOT NULL,
 before_json TEXT NOT NULL,
 after_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO settings(key,value) VALUES ('incentive_config_v1','{"first_month":"2026-10","semester_id":"semester-2026-autumn","semester_label":"2026—2027学年秋季学期","semester_start":"2026-09-30T16:00:00.000Z","semester_end":"2027-01-15T05:00:00.000Z"}');

CREATE TABLE incentive_draw_codes (
 period_id TEXT NOT NULL REFERENCES incentive_periods(id),
 student_id TEXT NOT NULL REFERENCES class_roster(student_id),
 code TEXT NOT NULL,
 PRIMARY KEY(period_id,student_id),
 UNIQUE(period_id,code)
);
