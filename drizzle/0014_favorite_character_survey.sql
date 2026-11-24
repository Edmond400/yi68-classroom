CREATE TABLE favorite_character_responses (
  id TEXT PRIMARY KEY NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  character TEXT NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 5242880),
  created_at TEXT NOT NULL
);

CREATE TABLE favorite_character_image_chunks (
  response_id TEXT NOT NULL REFERENCES favorite_character_responses(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index BETWEEN 0 AND 9),
  data BLOB NOT NULL CHECK (length(data) BETWEEN 1 AND 524288),
  PRIMARY KEY (response_id, chunk_index)
);

CREATE INDEX idx_favorite_character_responses_time ON favorite_character_responses(created_at, id);
