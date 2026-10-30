import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const searchPaths = [dirname(require.resolve('wrangler/package.json'))];
const { build } = require(require.resolve('esbuild', { paths: searchPaths }));
const { Miniflare } = require(require.resolve('miniflare', { paths: searchPaths }));
const dir = mkdtempSync(resolve(tmpdir(), 'yi68-d1-attachments-'));
const compiled = await build({
  stdin: {
    contents: `
      import { env } from 'cloudflare:workers';
      import { saveAttachment, readAttachment, deleteAttachment } from './lib/attachment-storage';
      export default { async fetch(request) {
        const id = new URL(request.url).pathname.slice(1);
        try {
          if (request.method === 'POST') {
            const bytes = new Uint8Array(await request.arrayBuffer());
            await saveAttachment({ id, itemId: 'test-item', filename: 'binary.dat', mime: 'application/octet-stream', size: bytes.length }, bytes);
            return Response.json({ ok: true });
          }
          if (request.method === 'DELETE') { await deleteAttachment(id); return new Response(null, { status: 204 }); }
          const asset = await env.DB.prepare('SELECT size FROM assets WHERE id=?').bind(id).first();
          const bytes = asset ? await readAttachment(id, asset.size) : null;
          return bytes ? new Response(bytes) : new Response(null, { status: 404 });
        } catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
      }};
    `,
    resolveDir: root,
    sourcefile: 'attachment-test-worker.ts',
    loader: 'ts',
  },
  absWorkingDir: root, bundle: true, write: false, platform: 'neutral', format: 'esm',
  external: ['cloudflare:workers'],
});
const options = {
  modules: true, script: compiled.outputFiles[0].text,
  compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
  d1Databases: ['DB'], d1Persist: resolve(dir, 'd1'),
};
let mf;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const query = (sql, ...params) => mf.getD1Database('DB').then(db => db.prepare(sql).bind(...params).first());
try {
  mf = new Miniflare(options);
  const db = await mf.getD1Database('DB');
  for (const filename of readdirSync(resolve(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) {
    for (const sql of readFileSync(resolve(root, 'drizzle', filename), 'utf8').split(';').map(s => s.trim()).filter(Boolean)) {
      await db.prepare(sql).run();
    }
  }
  await db.prepare("INSERT INTO items VALUES ('test-item','task','test','{}',0,'test','test')").run();
  const bytes = new Uint8Array(10 * 1024 * 1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  let response = await mf.dispatchFetch('https://yi68.test/large-file', { method: 'POST', body: bytes });
  assert.equal(response.status, 200, await response.text());
  const stats = await query('SELECT COUNT(*) AS n, MAX(length(data)) AS largest FROM asset_chunks WHERE asset_id=?', 'large-file');
  assert.deepEqual(stats, { n: 20, largest: 512 * 1024 });
  response = await mf.dispatchFetch('https://yi68.test/large-file');
  assert.equal(response.status, 200);
  assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(bytes));
  console.log('PASS real D1 binding stores and reads a 10 MiB binary attachment without R2');

  await mf.dispose();
  mf = new Miniflare(options);
  response = await mf.dispatchFetch('https://yi68.test/large-file');
  assert.equal(response.status, 200);
  assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(bytes));
  console.log('PASS persisted D1 attachment bytes survive Worker restart');

  const restartedDb = await mf.getD1Database('DB');
  await restartedDb.prepare("CREATE TRIGGER reject_test_chunk BEFORE INSERT ON asset_chunks WHEN NEW.asset_id='rollback-file' AND NEW.chunk_index=1 BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END").run();
  response = await mf.dispatchFetch('https://yi68.test/rollback-file', { method: 'POST', body: bytes.slice(0, 512 * 1024 + 17) });
  assert.equal(response.status, 500);
  assert.equal((await query("SELECT COUNT(*) AS n FROM assets WHERE id='rollback-file'")).n, 0);
  assert.equal((await query("SELECT COUNT(*) AS n FROM asset_chunks WHERE asset_id='rollback-file'")).n, 0);
  console.log('PASS interrupted chunk writes roll back metadata and all partial bytes');

  response = await mf.dispatchFetch('https://yi68.test/oversize', { method: 'POST', body: new Uint8Array(10 * 1024 * 1024 + 1) });
  assert.equal(response.status, 400);
  assert.equal((await query("SELECT COUNT(*) AS n FROM assets WHERE id='oversize'")).n, 0);
  await restartedDb.prepare("DELETE FROM asset_chunks WHERE asset_id='large-file' AND chunk_index=1").run();
  response = await mf.dispatchFetch('https://yi68.test/large-file');
  assert.equal(response.status, 409);
  response = await mf.dispatchFetch('https://yi68.test/large-file', { method: 'DELETE' });
  assert.equal(response.status, 204);
  assert.equal((await query("SELECT COUNT(*) AS n FROM asset_chunks WHERE asset_id='large-file'")).n, 0);
  assert.equal((await mf.dispatchFetch('https://yi68.test/large-file')).status, 404);
  console.log('PASS oversize uploads are rejected, incomplete files fail closed and deletion removes chunks');
} finally {
  if (mf) await mf.dispose();
  rmSync(dir, { recursive: true, force: true });
}
