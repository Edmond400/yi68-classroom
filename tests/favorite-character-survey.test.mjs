import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import { unzipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const paths = { paths: [dirname(require.resolve('wrangler/package.json'))] };
const { build } = require(require.resolve('esbuild', paths));
const { Miniflare } = require(require.resolve('miniflare', paths));
const compiled = await build({
  stdin: { contents: `
    import * as survey from './app/survey/favorite-character/route';
    import * as admin from './app/api/admin/surveys/favorite-character/route';
    import * as image from './app/api/admin/surveys/favorite-character/image/[id]/route';
    import * as oldSurvey from './app/survey/boys-day/route';
    import { favoriteCharacterExportPlan, writeFavoriteCharacterZip } from './lib/favorite-character-export';
    export default { async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === '/survey/favorite-character') return request.method === 'POST' ? survey.POST(request) : survey.GET();
      if (pathname === '/survey/boys-day') return oldSurvey.GET(request);
      if (pathname === '/api/admin/surveys/favorite-character') return request.method === 'POST' ? admin.POST(request) : admin.GET(request);
      if (pathname.startsWith('/api/admin/surveys/favorite-character/image/')) return image.GET(request, {params: Promise.resolve({id: pathname.split('/').pop()})});
      if (pathname === '/test-export' || pathname === '/test-export/archive') {
        const png = new Uint8Array(await request.arrayBuffer());
        const mode = pathname.endsWith('/archive') ? 'archive' : 'stage';
        const duplicates = [
          {index:1,name:'测试同学／甲',character:'角色 A'},
          {index:5,name:'测试同学／甲',character:'角色 A'},
          ...(mode === 'archive' ? [{index:6,name:'测试乙',character:''},{index:7,name:'测试丙',character:'=2+3'}] : []),
        ].map(({index,name,character}) => ({index,response:{id:String(index),name,character,mime:'image/png',size:png.length,created_at:'2026-11-19T00:00:00.000Z'}}));
        const chunks = [];
        await writeFavoriteCharacterZip(favoriteCharacterExportPlan(duplicates, mode), mode, async () => new Response(new ReadableStream({ start(c) { c.enqueue(png.slice(0,13)); c.enqueue(png.slice(13)); c.close(); } })), async bytes => { chunks.push(bytes); });
        return new Response(new Blob(chunks));
      }
      return new Response(null, {status: 404});
    }};
  `, resolveDir: root, loader: 'ts' },
  absWorkingDir: root, bundle: true, write: false, platform: 'neutral', format: 'esm',
  external: ['cloudflare:workers', 'node:crypto','node:async_hooks'],
  plugins: [{ name: 'explicit-request-headers-only', setup(ctx) {
    ctx.onResolve({ filter: /^next\/headers$/ }, () => ({ path: 'headers', namespace: 'unused-test-next' }));
    ctx.onLoad({ filter: /.*/, namespace: 'unused-test-next' }, () => ({ contents: 'export function headers() { throw new Error("unexpected implicit request"); }' }));
  } }],
});
const workerOptions = { modules: true, script: compiled.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'] };
const mf = new Miniflare(workerOptions);
const origin = 'https://yi68.test';
const userPath = '/survey/favorite-character';
const adminPath = '/api/admin/surveys/favorite-character';
const request = (path, options) => mf.dispatchFetch(origin + path, options);
const token = 'a'.repeat(64);
const admin = { Authorization: `Bearer ${token}` };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=', 'base64');
const name = '测试同学<&>';
const newForm = (key, data = png, options = {}) => {
  const body = new FormData();
  body.set('request_key', key);
  body.set('name', name);
  body.set('character', options.character ?? '');
  if (data) body.set('image', new Blob([data], { type: 'image/png' }), '原文件不应保存.png');
  return body;
};
const submit = async (key, data, options = {}) => {
  const native = new Request(origin + userPath, { method: 'POST', headers: options.headers ?? { Referer: origin + userPath }, body: newForm(key, data, options) });
  return request(userPath, { method: 'POST', headers: native.headers, body: await native.arrayBuffer() });
};
const setOptions = survey => request(adminPath, { method: 'POST', body: JSON.stringify(survey), headers: { ...admin, Origin: origin, 'Content-Type': 'application/json' } });

async function schemaAndAdmin(runtime) {
  const db = await runtime.getD1Database('DB');
  for (const filename of readdirSync(resolve(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) {
    for (const sql of readFileSync(resolve(root, 'drizzle', filename), 'utf8').match(/\s*CREATE TRIGGER\b[\s\S]*?\bEND;|[^;]+;/gi) ?? []) await db.prepare(sql).run();
  }
  await db.prepare("INSERT INTO administrator VALUES ('primary','admin','fixture','fixture','fixture')").run();
  await db.prepare("INSERT INTO administrator_sessions VALUES (?, 'primary', 'fixture', ?)")
    .bind(createHash('sha256').update(token).digest('hex'), Date.now() + 3_600_000).run();
  return db;
}

try {
  await schemaAndAdmin(mf);
  assert.equal((await request(adminPath)).status, 401);
  assert.equal((await request(adminPath, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  const defaultPage = await (await request(userPath)).text();
  assert.match(defaultPage, /当前未开放收集/);
  assert.doesNotMatch(defaultPage, /type="file"/);
  assert.equal((await submit(randomUUID())).status, 409);
  const settings = (await (await request(adminPath, { headers: admin })).json()).survey;
  assert.equal((await setOptions({ ...settings, open: true })).status, 200);
  const html = await (await request(userPath)).text();
  assert.match(html, /enctype="multipart\/form-data"/);
  assert.match(html, /type="file"[^>]* required/);
  assert.match(html, /现场只展示图片；姓名只供班长在后台核对/);
  assert.doesNotMatch(html.replace('<script defer src="/telemetry.js"></script>',''), /不是自拍|<script|<input[^>]+name="character"[^>]+required/);
  const key = html.match(/name="request_key" value="([a-f0-9-]+)"/)?.[1];
  assert.ok(key);
  let res = await submit(key);
  assert.equal(res.status, 200, (await res.clone().text()).match(/role="alert">([^<]+)/)?.[1]);
  assert.match(await res.text(), /已收到/);
  assert.equal((await submit(key)).status, 200);
  assert.equal((await submit(key, png, { character: '不同答案' })).status, 409);
  assert.equal((await submit(randomUUID(), null)).status, 400);
  assert.equal((await submit(randomUUID(), Buffer.from('not an image'))).status, 415);
  assert.equal((await submit(randomUUID(), new Uint8Array(5 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await submit(randomUUID(), png, { headers: { Origin: 'https://outside.test' } })).status, 403);
  assert.equal((await submit(randomUUID(), png, { character: '可选角色', headers: { Origin: origin } })).status, 200);
  const data = await (await request(adminPath, { headers: admin })).json();
  assert.equal(data.responses.length, 2);
  assert.equal(data.responses[0].name, name);
  assert.equal(data.responses[0].character, '');
  assert.equal(data.responses[1].character, '可选角色');
  const { id } = data.responses[0];
  const imagePath = adminPath + '/image/' + id;
  assert.equal((await request(imagePath)).status, 401);
  const image = await request(imagePath, { headers: { Cookie: `__Host-yi68_admin=${token}` } });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('Content-Type'), 'image/png');
  assert.equal(image.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(image.headers.get('Content-Disposition'), 'inline; filename="character.png"');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal((await request(`${adminPath}/image/${randomUUID()}`, { headers: admin })).status, 404);
  assert.doesNotMatch(await (await request(userPath)).text(), /测试同学|可选角色/);
  assert.match(await (await request('/survey/boys-day')).text(), /谁是卧底/);
  assert.equal((await setOptions({ ...settings, open: false })).status, 200);
  assert.equal((await submit(randomUUID())).status, 409);
  assert.equal((await (await request(adminPath, { headers: admin })).json()).responses.length, 2);
  const archive = unzipSync(new Uint8Array(await (await request('/test-export', { method: 'POST', body: png })).arrayBuffer()));
  assert.deepEqual(Object.keys(archive), ['001.png', '005.png']);
  assert.deepEqual(Buffer.from(archive['001.png']), png);
  assert.deepEqual(Buffer.from(archive['005.png']), png);
  const named = unzipSync(new Uint8Array(await (await request('/test-export/archive', { method: 'POST', body: png })).arrayBuffer()));
  assert.deepEqual(Object.keys(named), ['提交清单.csv', '测试同学_甲_角色 A.png', '测试同学_甲_角色 A_02.png', '测试乙_未填写角色名.png', '测试丙_=2+3.png']);
  for (const file of Object.keys(named).filter(key => key.endsWith('.png'))) assert.deepEqual(Buffer.from(named[file]), png);
  const csv = Buffer.from(named['提交清单.csv']).toString('utf8');
  assert.match(csv, /^\uFEFF"提交者姓名","角色名或作品名","图片文件名"/);
  assert.match(csv, /"测试同学／甲","角色 A","测试同学_甲_角色 A_02.png"/);
  assert.match(csv, /"测试乙","","测试乙_未填写角色名.png"/);
  assert.ok(csv.includes(`"测试丙","'=2+3","测试丙_=2+3.png"`));
  console.log('PASS native image upload, reopen/close, replay safety, protected reads, unchanged Boys’ Day survey, and streamed stage and named ZIPs with safe filenames and CSV');
} finally { await mf.dispose(); }

const objectRuntime = new Miniflare({ ...workerOptions, r2Buckets: ['FAVORITE_CHARACTER_MEDIA'], bindings: { FAVORITE_CHARACTER_OBJECT_WRITES: 'on' } });
try {
  const db = await schemaAndAdmin(objectRuntime);
  const objectRequest = (path, options) => objectRuntime.dispatchFetch(origin + path, options);
  const options = { open: true, title: '隔离问卷', description: '虚构投稿和绑定', imageHint: '一人交一张。支持 JPG、PNG、WebP，最多 5 MB。' };
  await db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('favorite_character_survey', JSON.stringify(options)).run();
  const legacyId = randomUUID();
  await db.batch([
    db.prepare('INSERT INTO favorite_character_responses VALUES(?,?,?,?,?,?,?,?)').bind(legacyId, 'legacy-req', 'legacy-payload', '旧测试同学', '', 'image/png', png.length, '2026-11-18T00:00:00.000Z'),
    db.prepare('INSERT INTO favorite_character_image_chunks VALUES(?,?,?)').bind(legacyId, 0, new Uint8Array(png)),
  ]);
  const page = await (await objectRequest(userPath)).text();
  assert.match(page, /单张图片最多 30 MB/);
  assert.doesNotMatch(page, /最多 5 MB/);

  // Add a valid ancillary text chunk to a known PNG to exercise exactly 30 MiB.
  const maximum = 30 * 1024 * 1024;
  const paddedPng = Buffer.alloc(maximum, 0x78);
  const offset = png.length - 12;
  const paddingSize = maximum - png.length - 12;
  png.copy(paddedPng, 0, 0, offset);
  paddedPng.writeUInt32BE(paddingSize, offset);
  paddedPng.write('tEXtComment\0', offset + 4, 'latin1');
  paddedPng.writeUInt32BE(crc32(paddedPng.subarray(offset + 4, offset + 8 + paddingSize)), offset + 8 + paddingSize);
  png.copy(paddedPng, maximum - 12, offset);
  const post = async (req, bytes, character = '') => {
    const form = new Request(origin + userPath, { method: 'POST', headers: { Origin: origin }, body: newForm(req, bytes, { character }) });
    return objectRequest(userPath, { method: 'POST', headers: form.headers, body: await form.arrayBuffer() });
  };
  const big = await post(randomUUID(), paddedPng, '大图角色');
  assert.equal(big.status, 200, (await big.clone().text()).match(/role="alert">([^<]+)/)?.[1]);
  assert.equal((await post(randomUUID(), new Uint8Array(maximum + 1))).status, 413);
  assert.equal((await post(randomUUID(), new Uint8Array(maximum + 32769))).status, 413);
  const smallKey = randomUUID();
  assert.equal((await post(smallKey, png, '小图角色')).status, 200);
  assert.equal((await post(smallKey, png, '小图角色')).status, 200);
  assert.equal((await post(smallKey, png, '不能覆盖')).status, 409);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM favorite_character_image_chunks').first()).n, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM favorite_character_responses').first()).n, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM favorite_character_object_responses').first()).n, 2);
  const bucket = await objectRuntime.getR2Bucket('FAVORITE_CHARACTER_MEDIA');
  const listed = await bucket.list();
  assert.equal(listed.objects.length, 2);
  assert.ok(listed.objects.every(({ key }) => /^surveys\/favorite-character\/[a-f0-9-]{36}$/u.test(key)));
  const rows = (await (await objectRequest(adminPath, { headers: admin })).json()).responses;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, legacyId);
  const newImage = adminPath + '/image/' + rows.find(row => row.size === maximum).id;
  assert.equal((await objectRequest(newImage)).status, 401);
  const authorized = await objectRequest(newImage, { headers: admin });
  assert.equal(authorized.status, 200);
  assert.equal(Number(authorized.headers.get('Content-Length')), maximum);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest(Buffer.from(await authorized.arrayBuffer())), digest(paddedPng));
  const old = await objectRequest(adminPath + '/image/' + legacyId, { headers: admin });
  assert.deepEqual(Buffer.from(await old.arrayBuffer()), png);
  console.log('PASS isolated 30 MiB R2 upload and exact readback; oversize rejected, old D1 reads work, no new image chunks, and retries leave no duplicate objects');
} finally { await objectRuntime.dispose(); }
