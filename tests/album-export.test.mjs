import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url), paths = [dirname(require.resolve('wrangler/package.json'))];
const { build } = require(require.resolve('esbuild', { paths }));
const dir = mkdtempSync(resolve(tmpdir(), 'yi68-export-'));
try {
  const outfile = resolve(dir, 'export.mjs');
  await build({ entryPoints: ['lib/album-export.ts'], bundle: true, format: 'esm', platform: 'node', outfile });
  const { writeAlbumZip, albumExportName } = await import(pathToFileURL(outfile).href);
  assert.equal(albumExportName('../相册/名称\\.jpg'), '_相册_名称_.jpg');
  assert.equal(albumExportName('CON.txt'), '_CON.txt');
  const images = [readFileSync('tests/fixtures/albums/smoke.jpg'), Buffer.from('照片原始字节 😊\0\u0001'), Buffer.alloc(512 * 1024, 193)];
  const photos = images.map((bytes, index) => ({ id: String(index), album_id: index === 2 ? 'other-album' : 'same-album', album_title: index === 2 ? '另一活动' : '../活动:同名', activity_date: '2026-11-22', filename: '../同名照片.jpg', mime: 'image/jpeg', size: bytes.length }));
  const chunks = []; let reads = 0, completed = 0;
  await writeAlbumZip(photos, async photo => {
    const bytes = images[Number(photo.id)]; reads++;
    return new Response(new ReadableStream({ start(c) { for (let n = 0; n < bytes.length; n += 1231) c.enqueue(bytes.subarray(n, n + 1231)); c.close(); } }));
  }, async bytes => { await Promise.resolve(); chunks.push(bytes); }, done => { completed = done; });
  assert.equal(reads, 3); assert.equal(completed, 3);
  const archive = resolve(dir, 'photos.zip'); writeFileSync(archive, Buffer.concat(chunks));
  const python = spawnSync('python3', ['-c', `import zipfile,sys,json,hashlib
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 names=z.namelist()
 assert len(names)==3 and len(set(names))==3
 assert len(set(n.split('/')[0] for n in names))==2
 assert all('..' not in n and '\\\\' not in n for n in names)
 print(json.dumps([{'name':n,'sha256':hashlib.sha256(z.read(n)).hexdigest()} for n in names]))`, archive], { encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
  const { createHash } = await import('node:crypto');
  const extracted = JSON.parse(python.stdout);
  extracted.forEach((entry, index) => assert.equal(entry.sha256, createHash('sha256').update(images[index]).digest('hex')));
  for (const response of [new Response('withdrawn', { status: 404 }), new Response(new Uint8Array(1)), new Response(new Uint8Array(photos[0].size + 1))]) {
    await assert.rejects(writeAlbumZip([photos[0]], async () => response, async () => {}));
  }
  let calls = 0;
  await assert.rejects(writeAlbumZip(photos, async p => { calls++; return new Response(images[Number(p.id)]); }, async () => { throw new Error('disk full'); }), /disk full/);
  assert.equal(calls, 1);
  console.log('PASS archive opens with Python ZIP64/CRC verification; original SHA-256 matches; chunked reads and awaited writes; Unicode folders, duplicate names and traversal sanitization; withdrawal, truncated files, size mismatch and sink failures abort');
} finally { rmSync(dir, { recursive: true, force: true }); }
