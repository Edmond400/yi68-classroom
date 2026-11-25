-- Additive only. Event insertion and daily aggregation share the same transaction.
CREATE TABLE site_events (
 id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, day TEXT NOT NULL,
 event_name TEXT NOT NULL, module_id TEXT NOT NULL, route TEXT NOT NULL,
 success INTEGER NOT NULL CHECK(success IN(0,1)), status INTEGER NOT NULL DEFAULT 0,
 request_id TEXT, file_count INTEGER NOT NULL DEFAULT 0, failed_files INTEGER NOT NULL DEFAULT 0,
 bytes INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER, error_code TEXT NOT NULL DEFAULT '',
 is_test INTEGER NOT NULL DEFAULT 0 CHECK(is_test IN(0,1))
);
CREATE INDEX site_events_time ON site_events(occurred_at DESC);
CREATE INDEX site_events_module ON site_events(module_id,occurred_at DESC);
CREATE INDEX site_events_type ON site_events(event_name,occurred_at DESC);
CREATE INDEX site_events_request ON site_events(request_id);
CREATE TABLE site_daily_stats (
 day TEXT NOT NULL,module_id TEXT NOT NULL,event_name TEXT NOT NULL,success INTEGER NOT NULL,
 status INTEGER NOT NULL,error_code TEXT NOT NULL,is_test INTEGER NOT NULL,
 count INTEGER NOT NULL DEFAULT 0,file_count INTEGER NOT NULL DEFAULT 0,failed_files INTEGER NOT NULL DEFAULT 0,
 bytes INTEGER NOT NULL DEFAULT 0,duration_sum INTEGER NOT NULL DEFAULT 0,duration_count INTEGER NOT NULL DEFAULT 0,
 le100 INTEGER NOT NULL DEFAULT 0,le500 INTEGER NOT NULL DEFAULT 0,le1000 INTEGER NOT NULL DEFAULT 0,le5000 INTEGER NOT NULL DEFAULT 0,gt5000 INTEGER NOT NULL DEFAULT 0,
 first_at TEXT NOT NULL,last_at TEXT NOT NULL,
 PRIMARY KEY(day,module_id,event_name,success,status,error_code,is_test)
);
CREATE TRIGGER site_event_aggregate AFTER INSERT ON site_events BEGIN
 INSERT INTO site_daily_stats VALUES(new.day,new.module_id,new.event_name,new.success,new.status,new.error_code,new.is_test,
 1,new.file_count,new.failed_files,new.bytes,COALESCE(new.duration_ms,0),new.duration_ms IS NOT NULL,
 COALESCE(new.duration_ms<=100,0),COALESCE(new.duration_ms>100 AND new.duration_ms<=500,0),COALESCE(new.duration_ms>500 AND new.duration_ms<=1000,0),
 COALESCE(new.duration_ms>1000 AND new.duration_ms<=5000,0),COALESCE(new.duration_ms>5000,0),new.occurred_at,new.occurred_at)
 ON CONFLICT(day,module_id,event_name,success,status,error_code,is_test) DO UPDATE SET
 count=count+1,file_count=file_count+new.file_count,failed_files=failed_files+new.failed_files,bytes=bytes+new.bytes,
 duration_sum=duration_sum+COALESCE(new.duration_ms,0),duration_count=duration_count+(new.duration_ms IS NOT NULL),
 le100=le100+COALESCE(new.duration_ms<=100,0),le500=le500+COALESCE(new.duration_ms>100 AND new.duration_ms<=500,0),
 le1000=le1000+COALESCE(new.duration_ms>500 AND new.duration_ms<=1000,0),le5000=le5000+COALESCE(new.duration_ms>1000 AND new.duration_ms<=5000,0),
 gt5000=gt5000+COALESCE(new.duration_ms>5000,0),last_at=MAX(last_at,new.occurred_at);
END;
CREATE TABLE site_daily_visitors(day TEXT NOT NULL,visitor_hash TEXT NOT NULL,is_test INTEGER NOT NULL,last_seen TEXT NOT NULL,PRIMARY KEY(day,visitor_hash,is_test));
CREATE INDEX site_visitors_expiry ON site_daily_visitors(last_seen);
CREATE TRIGGER site_visitor_aggregate AFTER INSERT ON site_daily_visitors BEGIN
 INSERT INTO site_daily_stats(day,module_id,event_name,success,status,error_code,is_test,count,first_at,last_at)
 VALUES(new.day,'home','daily_unique_browser',1,0,'',new.is_test,1,new.last_seen,new.last_seen)
 ON CONFLICT(day,module_id,event_name,success,status,error_code,is_test) DO UPDATE SET count=count+1,last_at=MAX(last_at,new.last_seen);
END;
CREATE TABLE site_admin_audit(id TEXT PRIMARY KEY,occurred_at TEXT NOT NULL,admin_id TEXT NOT NULL,action TEXT NOT NULL,module_id TEXT NOT NULL,success INTEGER NOT NULL,summary TEXT NOT NULL,request_id TEXT,is_test INTEGER NOT NULL DEFAULT 0);
CREATE INDEX site_audit_time ON site_admin_audit(occurred_at DESC);
CREATE TABLE site_telemetry_limits(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX site_telemetry_limits_expiry ON site_telemetry_limits(expires_at);
INSERT OR IGNORE INTO settings(key,value) VALUES('site_telemetry_started',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
