CREATE TABLE fund_settings(id TEXT PRIMARY KEY CHECK(id='class'),opening_cents INTEGER NOT NULL,opening_day TEXT NOT NULL,version INTEGER NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE fund_entries(id TEXT PRIMARY KEY,day TEXT NOT NULL,direction TEXT NOT NULL CHECK(direction IN ('income','expense')),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),title TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','void')),version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX fund_entries_day ON fund_entries(day,id);
CREATE TABLE fund_audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,before_json TEXT,after_json TEXT,created_at TEXT NOT NULL);
CREATE TABLE fund_write_guards(id TEXT PRIMARY KEY,allowed INTEGER NOT NULL CHECK(allowed=1));
CREATE TRIGGER fund_clear_guard AFTER INSERT ON fund_write_guards BEGIN DELETE FROM fund_write_guards WHERE id=NEW.id; END;
