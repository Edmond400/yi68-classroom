import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [dirname(require.resolve('wrangler/package.json'))] }));
const dir = mkdtempSync(resolve(tmpdir(), 'yi68-node-runtime-'));
process.env.YI68_DATA_DIR = dir;
const outfile = resolve(root, '.sites-runtime/node-runtime-test.mjs');
mkdirSync(dirname(outfile), { recursive: true });
try {
  await build({ entryPoints: [resolve(root, 'lib/node-runtime.ts')], outfile, bundle: true, platform: 'node', format: 'esm' });
  const { env } = await import(pathToFileURL(outfile).href);
  assert.equal(env.LOCAL_AUTH_ONLY, 'true');
  const db = env.DB;
  await assert.rejects(db.batch([db.prepare("INSERT INTO settings VALUES ('rollback-check','1')"), db.prepare('INSERT INTO missing_table VALUES (1)')]));
  assert.equal(await db.prepare("SELECT value FROM settings WHERE key='rollback-check'").first(), null);
  const result = await db.batch([db.prepare("INSERT INTO settings VALUES ('commit-check','1')"), db.prepare("SELECT value FROM settings WHERE key='commit-check'")]);
  assert.equal(result[0].meta.changes, 1); assert.equal(result[1].results[0].value, '1');
  const bytes = new Uint8Array([1, 2, 3, 254]);
  await env.LOCAL_ATTACHMENTS.put('attachments/test-id', bytes); assert.deepEqual((await env.LOCAL_ATTACHMENTS.get('attachments/test-id')).body, bytes);
  await assert.rejects(env.LOCAL_ATTACHMENTS.get('attachments/../../private'));
  await env.LOCAL_ATTACHMENTS.delete('attachments/test-id'); assert.equal(await env.LOCAL_ATTACHMENTS.get('attachments/test-id'), null);
  console.log('PASS Node migrations, atomic rollback, D1-compatible results, attachment storage and path containment');
} finally { rmSync(dir, { recursive: true, force: true }); }
