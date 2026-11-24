CREATE TABLE favorite_character_object_responses (
  id TEXT PRIMARY KEY NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  character TEXT NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 31457280),
  object_key TEXT NOT NULL UNIQUE,
  storage_provider TEXT NOT NULL CHECK (storage_provider IN ('r2', 'oss')),
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_favorite_character_object_responses_time ON favorite_character_object_responses(created_at, id);
