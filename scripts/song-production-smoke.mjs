import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const origin = 'https://class.example.invalid', path = '/song-request', api = '/api/admin/song-requests', marker = 'song_request_v1_verified';
function sql(command) { const r = spawnSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', '--remote', '--json', '--command', command], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }); if (r.status !== 0) throw new Error('Song acceptance D1 command failed'); return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results; }
if (sql("SELECT value FROM settings WHERE key='" + marker + "'").length) { console.log('Song production acceptance already passed; skipped.'); process.exit(0); }
const ids = [randomUUID(), randomUUID(), randomUUID()], song = '合成点歌验收' + randomUUID().slice(0, 8), token = randomBytes(32).toString('hex'), hash = createHash('sha256').update(token).digest('hex');
const idList = ids.map(id => "'" + id + "'").join(','), proof = { version: 'song-request-v1', time: new Date().toISOString(), checks: [], cleaned: false };
async function get(p, admin = false, status = 200) { const r = await fetch(origin + p, { headers: admin ? { Authorization: 'Bearer ' + token } : {}, signal: AbortSignal.timeout(30000) }); assert.equal(r.status, status, p); return r; }
async function submit(id, value) { const r = await fetch(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Mobile MicroMessenger/8.0' }, body: new URLSearchParams({ request_id: id, song: value }), signal: AbortSignal.timeout(30000) }); assert.equal(r.status, 200); assert.match(await r.text(), /点歌成功！已收到你的歌曲。/); }
try {
  const html = await (await get(path)).text(); assert.match(html, /艺68 · 现场点歌/); assert.equal((html.match(/type="text"/g) || []).length, 1); assert(!html.includes('<script'));
  assert.match(await (await get('/')).text(), /href="\/song-request"/);
  const qr = await get('/song-request-qr.png'); assert.match(qr.headers.get('Content-Type'), /image\/png/);
  await get(api, false, 401); await get(api + '?export=csv', false, 401);
  await Promise.all([submit(ids[0], song), submit(ids[0], song), submit(ids[0], song)]);
  await submit(ids[1], song); await submit(ids[2], song + '下一首');
  const saved = sql('SELECT id,song FROM song_requests WHERE request_id IN (' + idList + ') ORDER BY id'); assert.equal(saved.length, 3); assert.deepEqual(saved.map(r => r.song), [song, song, song + '下一首']);
  proof.checks.push('anonymous-native-WeChat-UA-submit', 'concurrent-network-retry-single-row', 'same-song-independent-submissions', 'continue-song-submit', 'homepage-entry', 'PNG-served', 'anonymous-results-and-CSV-denied');
  sql(`INSERT INTO administrator_sessions(token_hash,admin_id,credential_version,expires_at) SELECT '${hash}',id,credential_version,${Date.now() + 300000} FROM administrator WHERE id='primary'`);
  const data = await (await get(api, true)).json(); const found = data.rows.filter(r => saved.some(s => s.id === r.id)); assert.equal(found.length, 3); assert.deepEqual(found.map(r => r.song), [song, song, song + '下一首']);
  assert.equal((await (await get(api, true)).json()).rows.filter(r => saved.some(s => s.id === r.id)).length, 3);
  const csvResponse = await get(api + '?export=csv', true); assert.match(csvResponse.headers.get('Content-Disposition'), /attachment/); const csv = await csvResponse.text(); assert(csv.includes(song)); assert(csv.includes('提交时间'));
  for (const row of saved) { const r = await fetch(origin + api, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id }), signal: AbortSignal.timeout(30000) }); assert.equal(r.status, 200); }
  assert.equal(sql('SELECT id FROM song_requests WHERE request_id IN (' + idList + ')').length, 0);
  proof.checks.push('existing-admin-results-and-refresh', 'private-CSV-download', 'admin-delete');
  for (const p of ['/admin/song-requests', '/survey/talent', '/albums', '/survey/drinks']) await get(p);
} finally {
  sql(`DELETE FROM song_requests WHERE request_id IN (${idList}); DELETE FROM administrator_sessions WHERE token_hash='${hash}'`);
  assert.equal(sql('SELECT id FROM song_requests WHERE request_id IN (' + idList + ')').length, 0);
  assert.equal(sql(`SELECT token_hash FROM administrator_sessions WHERE token_hash='${hash}'`).length, 0); proof.cleaned = true;
}
sql("INSERT INTO settings(key,value) VALUES ('" + marker + "','" + JSON.stringify(proof).replace(/'/g, "''") + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
console.log(JSON.stringify(proof));
