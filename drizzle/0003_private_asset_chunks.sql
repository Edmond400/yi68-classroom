-- Private attachment bytes are managed by lib/attachment-storage.ts using raw SQL.
-- Existing migrations and assets metadata remain unchanged.
CREATE TABLE `asset_chunks` (
  `asset_id` text NOT NULL,
  `chunk_index` integer NOT NULL CHECK (`chunk_index` >= 0),
  `data` blob NOT NULL CHECK (typeof(`data`) = 'blob' AND length(`data`) BETWEEN 1 AND 524288),
  PRIMARY KEY (`asset_id`, `chunk_index`),
  FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE
) WITHOUT ROWID;
