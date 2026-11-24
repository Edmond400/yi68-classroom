// Additive schema protection: retain the D1 recovery bookmark before applying 0019.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
function wrangler(args) { const r = spawnSync('pnpm', ['exec', 'wrangler', ...args], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }); if (r.status !== 0) throw new Error('Drink predeploy protection failed: ' + args.slice(0, 2).join(' ')); return r.stdout; }
function query(sql) { const out = wrangler(['d1', 'execute', 'DB', '--remote', '--json', '--command', sql]); return JSON.parse(out.slice(out.indexOf('[')))[0].results; }
if (query("SELECT name FROM sqlite_master WHERE type='table' AND name='boys_day_drink_orders'").length) { console.log('Drink schema already present; recovery bookmark gate skipped.'); process.exit(0); }
const bookmarkText = wrangler(['d1', 'time-travel', 'info', 'DB', '--json']);
const recovery = JSON.parse(bookmarkText.slice(bookmarkText.indexOf('{')));
const counts = query('SELECT (SELECT COUNT(*) FROM class_roster) AS roster,(SELECT COUNT(*) FROM items) AS items,(SELECT COUNT(*) FROM assets) AS assets,(SELECT COUNT(*) FROM class_albums) AS albums,(SELECT COUNT(*) FROM class_album_photos) AS photos,(SELECT COUNT(*) FROM class_album_comments) AS comments,(SELECT COUNT(*) FROM boys_day_responses) AS boys_day_responses,(SELECT COUNT(*) FROM favorite_character_responses) AS character_responses');
const proof = { version: 'drinks-0019-protection', time: new Date().toISOString(), recovery, counts };
const dir = mkdtempSync(join(tmpdir(), 'yi68-drinks-protection-'));
try {
  const file = join(dir, 'recovery.json'); writeFileSync(file, JSON.stringify(proof), { mode: 0o600 });
  const key = 'yi68-character-survey-media/ops-backups/drinks-0019/' + proof.time.replace(/[:.]/g, '-') + '.json';
  wrangler(['r2', 'object', 'put', key, '--remote', '--file', file]);
  console.log(JSON.stringify({ protected: true, recovery, counts, recovery_record: key }));
} finally { rmSync(dir, { recursive: true, force: true }); }
