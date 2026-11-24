-- Frozen policy: first monthly win consumes the semester opportunity, including
-- historical wins. Losing a tie does not. Semester keepsakes remain independent.
CREATE TABLE incentive_monthly_awards (
 semester_id TEXT NOT NULL,
 student_id TEXT NOT NULL REFERENCES class_roster(student_id),
 period_id TEXT NOT NULL REFERENCES incentive_periods(id),
 awarded_at TEXT NOT NULL,
 PRIMARY KEY(semester_id,student_id),
 UNIQUE(period_id,student_id)
);
CREATE INDEX idx_monthly_awards_period ON incentive_monthly_awards(period_id);
CREATE TABLE incentive_prize_deliveries (
 period_id TEXT NOT NULL REFERENCES incentive_periods(id),
 student_id TEXT NOT NULL REFERENCES class_roster(student_id),
 delivered_at TEXT NOT NULL,
 PRIMARY KEY(period_id,student_id)
);
CREATE TABLE incentive_monthly_redemptions (
 semester_id TEXT NOT NULL,
 student_id TEXT NOT NULL REFERENCES class_roster(student_id),
 period_id TEXT NOT NULL REFERENCES incentive_periods(id),
 delivered_at TEXT NOT NULL,
 PRIMARY KEY(semester_id,student_id)
);
INSERT OR IGNORE INTO settings(key,value) VALUES ('incentive_reward_revision','0');
CREATE TRIGGER incentive_reward_snapshot_revision AFTER UPDATE OF result_json ON incentive_periods
WHEN OLD.result_json IS NULL AND NEW.result_json IS NOT NULL
BEGIN
 UPDATE settings SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='incentive_reward_revision';
END;
INSERT OR IGNORE INTO incentive_monthly_awards(semester_id,student_id,period_id,awarded_at)
 SELECT COALESCE(json_extract(p.result_json,'$.reward_semester.id'),json_extract(s.value,'$.semester_id')),
        json_extract(w.value,'$.student_id'),p.id,COALESCE(p.published_at,p.ends_at)
 FROM incentive_periods p JOIN settings s ON s.key='incentive_config_v1',json_each(p.result_json,'$.winners') w
 WHERE p.kind='month' AND p.result_json IS NOT NULL AND json_valid(p.result_json)
 AND EXISTS(SELECT 1 FROM class_roster r WHERE r.student_id=json_extract(w.value,'$.student_id'))
 AND (json_extract(p.result_json,'$.reward_semester.id')=json_extract(s.value,'$.semester_id')
  OR (json_extract(p.result_json,'$.reward_semester.id') IS NULL
      AND p.starts_at<json_extract(s.value,'$.semester_end') AND p.ends_at>json_extract(s.value,'$.semester_start')))
 ORDER BY p.ends_at,p.id;
INSERT OR IGNORE INTO incentive_prize_deliveries(period_id,student_id,delivered_at)
 SELECT p.id,d.key,d.value FROM incentive_periods p,json_each(p.delivery_json) d
 WHERE p.result_json IS NOT NULL AND d.type='text'
 AND EXISTS(SELECT 1 FROM class_roster r WHERE r.student_id=d.key)
 AND EXISTS(SELECT 1 FROM json_each(p.result_json,'$.winners') w WHERE json_extract(w.value,'$.student_id')=d.key);
INSERT OR IGNORE INTO incentive_monthly_redemptions(semester_id,student_id,period_id,delivered_at)
 SELECT COALESCE(json_extract(p.result_json,'$.reward_semester.id'),json_extract(s.value,'$.semester_id')),
        d.student_id,d.period_id,d.delivered_at
 FROM incentive_prize_deliveries d JOIN incentive_periods p ON p.id=d.period_id JOIN settings s ON s.key='incentive_config_v1'
 WHERE p.kind='month' AND (json_extract(p.result_json,'$.reward_semester.id')=json_extract(s.value,'$.semester_id')
 OR (json_extract(p.result_json,'$.reward_semester.id') IS NULL AND p.starts_at<json_extract(s.value,'$.semester_end') AND p.ends_at>json_extract(s.value,'$.semester_start')))
 ORDER BY d.delivered_at,d.period_id;
