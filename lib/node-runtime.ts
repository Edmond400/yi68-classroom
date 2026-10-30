// Independent Node deployment. This module is substituted only by Next's build.
// Cloudflare identity headers are never trusted on this deployment.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

let connection: DatabaseSync | undefined;
const dataDir = () => resolve(process.env.YI68_DATA_DIR || './data');
function db() {
  if (connection) return connection;
  const dir = dataDir(); mkdirSync(dir, { recursive: true, mode: 0o700 });
  const current = new DatabaseSync(resolve(dir, 'yi68.sqlite'));
  current.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  current.exec('CREATE TABLE IF NOT EXISTS _yi68_migrations (name TEXT PRIMARY KEY)');
  for (const file of readdirSync(resolve(process.cwd(), 'drizzle')).filter(f => f.endsWith('.sql')).sort()) {
    if (current.prepare('SELECT name FROM _yi68_migrations WHERE name=?').get(file)) continue;
    current.exec('BEGIN IMMEDIATE');
    try { current.exec(readFileSync(resolve(process.cwd(), 'drizzle', file), 'utf8')); current.prepare('INSERT INTO _yi68_migrations (name) VALUES (?)').run(file); current.exec('COMMIT'); }
    catch (error) { current.exec('ROLLBACK'); current.close(); throw error; }
  }
  connection = current; return current;
}
type Bind = null | string | number | bigint | Uint8Array;
class Statement {
  constructor(readonly sql: string, readonly params: Bind[] = []) {}
  bind(...params: Bind[]) { return new Statement(this.sql, params); }
  async first<T>() { return (db().prepare(this.sql).get(...this.params) || null) as T | null; }
  async all<T>() { return { results: db().prepare(this.sql).all(...this.params) as T[], success: true, meta: { changes: 0 } }; }
  async run() { const result = db().prepare(this.sql).run(...this.params); return { success: true, meta: { changes: Number(result.changes) } }; }
}
const DB = {
  prepare(sql: string) { return new Statement(sql); },
  async batch(statements: Statement[]) {
    const conn = db(); conn.exec('BEGIN IMMEDIATE');
    try {
      // Synchronous execution keeps other requests out of this transaction.
      const result = statements.map(s => {
        const statement = conn.prepare(s.sql);
        if (statement.columns().length) { const rows = statement.all(...s.params); const changes = /^\s*SELECT\b/i.test(s.sql) ? 0 : Number(conn.prepare('SELECT changes() AS n').get()!.n); return { results: rows, success: true, meta: { changes } }; }
        const r = statement.run(...s.params); return { results: [], success: true, meta: { changes: Number(r.changes) } };
      });
      conn.exec('COMMIT'); return result;
    } catch (error) { conn.exec('ROLLBACK'); throw error; }
  },
};
function objectPath(key: string) {
  if (!/^attachments\/[a-zA-Z0-9_-]{1,90}$/.test(key)) throw new Error('Invalid attachment key');
  return resolve(dataDir(), key);
}
const LOCAL_ATTACHMENTS = {
  async put(key: string, value: Uint8Array) {
    const path = objectPath(key); mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temp = path + '.' + crypto.randomUUID() + '.tmp'; writeFileSync(temp, value, { mode: 0o600 }); renameSync(temp, path);
  },
  async get(key: string) { const path = objectPath(key); return existsSync(path) ? { body: new Uint8Array(readFileSync(path)) } : null; },
  async delete(key: string) { const path = objectPath(key); if (existsSync(path)) unlinkSync(path); },
};
export const env = {
  DB, LOCAL_ATTACHMENTS,
  get CLASS_ROSTER_JSON() { return process.env.CLASS_ROSTER_JSON; },
  get ADMIN_STUDENT_ID() { return process.env.ADMIN_STUDENT_ID; },
  get ADMIN_SETUP_TOKEN() { return process.env.ADMIN_SETUP_TOKEN; },
  get PUBLIC_SITE_ORIGIN() { return process.env.PUBLIC_SITE_ORIGIN; },
  get ADMIN_BOOTSTRAP_TOKEN_HASH() { return process.env.ADMIN_BOOTSTRAP_TOKEN_HASH; },
  ADMIN_EMAIL: undefined,
  LOCAL_AUTH_ONLY: 'true',
};
