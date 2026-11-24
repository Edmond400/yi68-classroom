CREATE TABLE boys_day_responses (
  id TEXT PRIMARY KEY NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  pairs TEXT NOT NULL,
  introduction TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_boys_day_responses_created_at ON boys_day_responses(created_at DESC, id DESC);
