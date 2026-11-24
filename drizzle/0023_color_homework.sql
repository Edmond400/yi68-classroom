CREATE TABLE color_homework (
 student_id TEXT PRIMARY KEY REFERENCES class_roster(student_id),
 submitted INTEGER NOT NULL DEFAULT 0 CHECK(submitted IN (0,1)),
 sheet_count INTEGER NOT NULL DEFAULT 0 CHECK(typeof(sheet_count)='integer' AND sheet_count>=0 AND sheet_count<=2147483647),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at TEXT NOT NULL,
 CHECK(submitted=0 OR sheet_count>0)
);
