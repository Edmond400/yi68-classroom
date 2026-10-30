// Import only into a new empty data directory. Existing data is never replaced.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync, existsSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-backup.mjs /private/yi68-private.backup.json');
const backup = JSON.parse(readFileSync(input, 'utf8'));
if (!['yi68-backup-v1','yi68-backup-v2','yi68-backup-v3'].includes(backup.format) || !backup.data || !Array.isArray(backup.files)) throw new Error('Invalid backup format');
const root = resolve(process.env.YI68_DATA_DIR || './data');
mkdirSync(root, { recursive: true, mode: 0o700 });
if (existsSync(resolve(root, 'yi68.sqlite')) || existsSync(resolve(root, 'attachments'))) throw new Error('Target is not empty. Use a NEW data directory; do not overwrite the current site.');
const stage = resolve(root, '.import-' + crypto.randomUUID()); mkdirSync(stage, { mode: 0o700 });
const db = new DatabaseSync(resolve(stage, 'yi68.sqlite'));
try {
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _yi68_migrations (name TEXT PRIMARY KEY);');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) { db.exec(readFileSync(resolve('drizzle', file), 'utf8')); db.prepare('INSERT INTO _yi68_migrations (name) VALUES (?)').run(file); }
  const tables = ['settings', 'items', 'progress', 'events', 'class_roster', 'student_accounts', 'feedback', 'assets'];
  if (['yi68-backup-v2','yi68-backup-v3'].includes(backup.format)) tables.push('administrator', 'birthday_responses');
  if (backup.format === 'yi68-backup-v3') tables.push('incentive_members','incentive_tasks','incentive_activities','incentive_participations','incentive_counts','incentive_claims','incentive_periods','incentive_draw_codes','incentive_audit');
  db.exec('BEGIN');
  for (const table of tables) {
    const columns = db.prepare('PRAGMA table_info(' + table + ')').all().map(c => c.name);
    if (!Array.isArray(backup.data[table])) throw new Error('Missing backup table: ' + table);
    const insert = db.prepare((table === 'settings' ? 'INSERT OR REPLACE INTO ' : 'INSERT INTO ') + table + ' (' + columns.join(',') + ') VALUES (' + columns.map(() => '?').join(',') + ')');
    for (const row of backup.data[table]) {
      if (table === 'settings' && ['owner_id', 'roster_revision'].includes(row.key)) continue;
      if (Object.keys(row).some(key => !columns.includes(key)) || columns.some(c => row[c] === undefined)) throw new Error('Invalid columns in ' + table);
      insert.run(...columns.map(c => row[c]));
    }
  }
  db.exec('COMMIT');
  const expected = new Map(db.prepare('SELECT id,size FROM assets').all().map(row => [row.id, row.size]));
  if (backup.files.length !== expected.size) throw new Error('Attachment count mismatch');
  mkdirSync(resolve(stage, 'attachments'), { mode: 0o700 });
  for (const file of backup.files) {
    if (!/^[a-zA-Z0-9_-]{1,90}$/.test(file.id) || !expected.has(file.id) || typeof file.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) throw new Error('Invalid attachment');
    const bytes = Buffer.from(file.base64, 'base64');
    if (bytes.length !== expected.get(file.id)) throw new Error('Attachment size mismatch');
    writeFileSync(resolve(stage, 'attachments', file.id), bytes, { mode: 0o600 }); expected.delete(file.id);
  }
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Database integrity check failed');
  db.close();
  renameSync(resolve(stage, 'attachments'), resolve(root, 'attachments'));
  renameSync(resolve(stage, 'yi68.sqlite'), resolve(root, 'yi68.sqlite'));
  rmSync(stage, { recursive: true });
  console.log('Backup imported. All sessions were omitted; administrators must sign in again.');
} catch (error) { try { db.close(); } catch {} rmSync(stage, { recursive: true, force: true }); throw error; }
