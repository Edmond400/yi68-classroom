// One-time production acceptance. Real students' forms are only opened, never saved.
// The synthetic roster/order and ephemeral admin session are removed in finally.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const origin = 'https://class.example.invalid', path = '/survey/drinks', api = '/api/admin/surveys/drinks', marker = 'boys_day_drinks_20261121_verified';
function sql(command) { const r = spawnSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', '--remote', '--json', '--command', command], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }); if (r.status !== 0) throw new Error('Drink acceptance D1 command failed'); return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results; }
if (sql("SELECT value FROM settings WHERE key='" + marker + "'").length) { console.log('Drink production acceptance already passed; skipped.'); process.exit(0); }
const id = 'drink-smoke-' + randomUUID(), name = '饮品合成验收' + randomUUID().slice(0, 8), token = randomBytes(32).toString('hex'), hash = createHash('sha256').update(token).digest('hex');
const proof = { version: 'boys-day-drinks-v1', time: new Date().toISOString(), checks: [], cleaned: false };
async function get(url, admin = false, expected = 200) { const r = await fetch(origin + url, { headers: admin ? { Authorization: 'Bearer ' + token } : {}, signal: AbortSignal.timeout(30000) }); assert.equal(r.status, expected, 'Unexpected HTTP status at ' + url); return r; }
async function form(n, action = 'identify', fields = {}) { const r = await fetch(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 Mobile MicroMessenger/8.0' }, body: new URLSearchParams({ name: n, action, ...fields }), signal: AbortSignal.timeout(30000) }); assert.equal(r.status, 200, 'Drink form failed: ' + r.status); return r.text(); }
let inserted = false;
try {
  const first = await (await get(path)).text(); assert(first.includes('开始填写')); assert(!first.includes('示例甲')); assert(!first.includes('霸王茶姬'));
  for (const [n, brand] of [['示例甲', '喜茶'], ['示例乙', '霸王茶姬'], ['示例丙', '霸王茶姬']]) {
    const html = await form(n); assert(html.includes(brand)); assert(!html.includes('蜜桃四季春')); assert(!html.includes('不需要饮料')); if (n === '示例乙') assert(html.includes('伯牙绝弦'));
  }
  proof.checks.push('public-entry-and-three-real-name-branches-read-only');
  await get(api, false, 401); await get(api + '?export=orders', false, 401);
  sql(`INSERT INTO administrator_sessions(token_hash,admin_id,credential_version,expires_at) SELECT '${hash}',id,credential_version,${Date.now() + 300000} FROM administrator WHERE id='primary'`);
  const before = await (await get(api, true)).json();
  assert.equal(sql(`SELECT student_id FROM class_roster WHERE student_id='${id}' OR name='${name}'`).length, 0);
  sql(`INSERT INTO class_roster(student_id,name,enabled) VALUES ('${id}','${name}',1)`); inserted = true;
  let html = await form(name, 'save', { drink: '蜜桃四季春', cup: '标准', temperature: '常温', sugar: '五分糖', topping: '标准' }); assert(html.includes('提交成功'));
  html = await form(name); assert(html.includes('已载入上次提交'));
  html = await form(name, 'save', { drink: '珍珠奶茶', cup: '大杯', temperature: '热', sugar: '三分糖', milk: '换冷链鲜奶' }); assert(html.includes('提交成功')); assert(html.includes('换冷链鲜奶')); assert(!html.includes('参考价格')); 
  const rows = sql(`SELECT order_json FROM boys_day_drink_orders WHERE student_id='${id}'`); assert.equal(rows.length, 1); assert.equal(JSON.parse(rows[0].order_json).price_cents, 1320);
  const data = await (await get(api, true)).json(); assert(data.orders.some(o => o.student_id === id && o.price_cents === 1320)); assert.equal(data.submitted, data.orders.length); assert(data.purchases.some(g => g.drink === '珍珠奶茶' && g.specs.includes('三分糖') && g.names.includes(name)));
  for (const kind of ['orders', 'purchases', 'brands']) { const r = await get(api + '?export=' + kind, true); assert(r.headers.get('Content-Disposition').includes('attachment')); const csv = await r.text(); assert(csv.includes('品牌')); if (kind !== 'brands') assert(csv.includes(name)); }
  proof.checks.push('cookie-free-WeChat-UA-submit-reopen-update-one-row', 'D1-price-and-admin-purchase-statistics', 'three-private-CSV-exports-and-anonymous-denial');
  for (const p of ['/', '/albums', '/survey/boys-day', '/survey/favorite-character']) await get(p);
  proof.checks.push('existing-home-albums-and-surveys-available');
} finally {
  if (inserted) sql(`DELETE FROM boys_day_drink_orders WHERE student_id='${id}'; DELETE FROM class_roster WHERE student_id='${id}' AND name='${name}'`);
  sql(`DELETE FROM administrator_sessions WHERE token_hash='${hash}'`);
  assert.equal(sql(`SELECT student_id FROM class_roster WHERE student_id='${id}'`).length, 0);
  assert.equal(sql(`SELECT student_id FROM boys_day_drink_orders WHERE student_id='${id}'`).length, 0);
  proof.cleaned = true;
}
sql("INSERT INTO settings(key,value) VALUES ('" + marker + "','" + JSON.stringify(proof).replace(/'/g, "''") + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
console.log(JSON.stringify(proof));
