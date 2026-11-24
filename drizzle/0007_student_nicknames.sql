CREATE TABLE student_nicknames (
 student_id TEXT PRIMARY KEY REFERENCES class_roster(student_id),
 nickname TEXT NOT NULL UNIQUE,
 updated_at TEXT NOT NULL
);
CREATE TRIGGER nickname_reserves_real_names_insert BEFORE INSERT ON student_nicknames
WHEN EXISTS(SELECT 1 FROM class_roster WHERE student_id!=NEW.student_id AND name=NEW.nickname)
BEGIN SELECT RAISE(ABORT, 'nickname_real_name_conflict'); END;
CREATE TRIGGER nickname_reserves_real_names_update BEFORE UPDATE OF nickname,student_id ON student_nicknames
WHEN EXISTS(SELECT 1 FROM class_roster WHERE student_id!=NEW.student_id AND name=NEW.nickname)
BEGIN SELECT RAISE(ABORT, 'nickname_real_name_conflict'); END;
CREATE TRIGGER roster_respects_nicknames_insert BEFORE INSERT ON class_roster
WHEN EXISTS(SELECT 1 FROM student_nicknames WHERE student_id!=NEW.student_id AND nickname=NEW.name)
BEGIN SELECT RAISE(ABORT, 'nickname_roster_name_conflict'); END;
CREATE TRIGGER roster_respects_nicknames_update BEFORE UPDATE OF name,student_id ON class_roster
WHEN EXISTS(SELECT 1 FROM student_nicknames WHERE student_id!=NEW.student_id AND nickname=NEW.name)
BEGIN SELECT RAISE(ABORT, 'nickname_roster_name_conflict'); END;
