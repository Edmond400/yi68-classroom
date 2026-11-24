-- Additive: old rows and their chunks remain readable.
ALTER TABLE assets ADD COLUMN storage_backend TEXT NOT NULL DEFAULT 'd1' CHECK (storage_backend IN ('d1','r2'));
ALTER TABLE assets ADD COLUMN object_key TEXT;
ALTER TABLE assets ADD COLUMN checksum TEXT;
ALTER TABLE assets ADD COLUMN migrated_at TEXT;
