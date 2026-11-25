import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url), paths = [dirname(require.resolve('wrangler/package.json'))], { build } = require(require.resolve('esbuild', { paths }));
const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
for (const f of readdirSync('drizzle').filter(f => f.endsWith('.sql') && f < '0019').sort()) sqlite.exec(readFileSync('drizzle/' + f, 'utf8'));
const names = ['普通甲', '普通乙', '示例旧甲', '示例乙', '示例旧丙'];
names.forEach((n, i) => sqlite.prepare('INSERT INTO class_roster VALUES (?,?,1)').run('test-' + i, n));
sqlite.exec(readFileSync('drizzle/0019_boys_day_drinks.sql', 'utf8'));
assert.equal(sqlite.prepare('SELECT name FROM class_roster WHERE student_id=?').get('test-2').name, '示例甲');
function prepared(sql, params = []) { return { bind(...p) { return prepared(sql, p); }, async first() { return sqlite.prepare(sql).get(...params) || null; }, async all() { return { results: sqlite.prepare(sql).all(...params) }; }, async run() { const r = sqlite.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; } }; }
const db = { prepare: prepared };
const dir = mkdtempSync(resolve(tmpdir(), 'yi68-drinks-')), outfile = resolve(dir, 'app.mjs'), origin = 'https://yi68.test';
globalThis.__drinkTestEnv = { DB: db };
await build({ stdin: { contents: `export * from './lib/drink-orders'; export * from './lib/drink-order-model'; export * from './lib/drink-order-html'; export { GET as studentGet, POST as studentPost } from './app/survey/drinks/route'; export {GET as adminGet,POST as adminPost} from './app/api/admin/surveys/drinks/route';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile, plugins: [{ name: 'env', setup(b) { b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'fixture' })); b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: 'headers', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'env' ? 'export const env=globalThis.__drinkTestEnv' : 'export async function headers(){return new Headers()}' })); } }] });
try {
  const app = await import(pathToFileURL(outfile).href);
  const form = async (name, action = 'identify', fields = {}, ua = '') => app.studentPost(new Request(origin + app.drinkPath, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': ua }, body: new URLSearchParams({ name, action, ...fields }) }));
  const tea = { drink: '蜜桃四季春', cup: '标准', temperature: '常温', sugar: '五分糖', topping: '标准' };
  const milk = { drink: '珍珠奶茶', cup: '大杯', temperature: '热', sugar: '三分糖', milk: '换冷链鲜奶' };
  let r = await app.studentGet(); let html = await r.text();
  assert.equal((r.headers.get('content-security-policy').match(/script-src/g)||[]).length,1);assert.match(r.headers.get('content-security-policy'),/script-src 'self' 'nonce-/);
  assert.equal(r.status, 200); assert.match(html, /开始填写/); assert(!html.includes('示例甲')); assert(!html.includes('示例旧丙')); assert(!html.includes('蜜桃四季春'));
  assert.equal(r.headers.get('referrer-policy'), 'same-origin', 'Normal browser POST must retain its same-origin Origin header');
  const compatible = new Request(origin + app.drinkPath, { method: 'POST', headers: { Referer: origin + app.drinkPath, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: '普通甲', action: 'identify' }) });
  assert.equal((await app.studentPost(compatible)).status, 200);
  assert.equal((await form('不存在')).status, 400);
  for (const [name, brand] of [['示例甲', '喜茶'], ['示例乙', '霸王茶姬'], ['示例丙', '霸王茶姬'], ['示例旧丙', '霸王茶姬']]) {
    r = await form(name); html = await r.text(); assert.equal(r.status, 200); assert.match(html, new RegExp(brand));
    for (const forbidden of ['蜜桃四季春', '珍珠奶茶', '不需要饮料', '特殊用户', '特权']) assert(!html.includes(forbidden), name + ' leaks ' + forbidden);
    if (name === '示例乙') { assert.match(html, /伯牙绝弦/); assert(!html.includes('name="drink" required')); }
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM boys_day_drink_orders').get().n, 0);
  r = await form(' 普通甲 ', 'save', tea, 'Mozilla/5.0 Mobile MicroMessenger/8.0'); assert.equal(r.status, 200); assert.match(await r.text(), /提交成功/);
  assert.equal((await app.readDrinkOrder('test-0')).price_cents, 920);
  assert.equal((await form('普通甲', 'save', { ...tea, topping: '葡萄肉' })).status, 200);
  assert.equal((await app.readDrinkOrder('test-0')).price_cents, 1120);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM boys_day_drink_orders').get().n, 1);
  html = await (await form('普通甲')).text(); assert.match(html, /已载入上次提交/); assert.match(html, /value="葡萄肉" checked/);
  assert.equal((await form('普通乙', 'save', milk)).status, 200); assert.equal((await app.readDrinkOrder('test-1')).price_cents, 1320);
  assert.equal((await form('普通乙', 'save', { drink: '不需要饮料' })).status, 200); assert.equal((await app.readDrinkOrder('test-1')).price_cents, 0);
  assert.equal((await form('示例甲', 'save', { drink: '多肉葡萄', requirements: '大杯 / 少冰 / 三分糖 / 脆波波', note: '原口味' })).status, 200);
  assert.equal((await form('示例乙', 'save', { drink: '伯牙绝弦', requirements: '大杯 / 热 / 五分糖' })).status, 200);
  assert.equal((await form('示例丙', 'save', { drink: '花田乌龙', requirements: '冰 / 少糖' })).status, 200);
  assert.equal((await form('示例旧丙', 'save', { drink: '花田乌龙', requirements: '热 / 五分糖' })).status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM boys_day_drink_orders').get().n, 5);
  for (const fields of [{ ...tea, topping: 'constructor' }, { ...tea, sugar: '错误糖度' }, { ...milk, cup: '超大杯' }, { ...milk, milk: 'constructor' }, { ...tea, price_cents: '1' }]) assert.equal((await form('普通甲', 'save', fields)).status, 400);
  assert.equal((await form('示例甲', 'save', { drink: '不需要饮料' })).status, 400);
  assert.equal((await form('示例乙', 'save', { drink: '其他饮品' })).status, 400);
  const wrong = new Request(origin + app.drinkPath, { method: 'POST', headers: { Origin: 'https://other.test', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=普通甲&action=identify' }); assert.equal((await app.studentPost(wrong)).status, 403);
  const sample = (await app.drinkAdminData()).orders.find(o => o.name === '普通甲');
  assert.equal(app.purchaseSummary([sample, { ...sample, name: '同规格' }])[0].quantity, 2);
  for (const key of ['cup', 'temperature', 'sugar', 'milk', 'topping', 'requirements', 'note']) assert.equal(app.purchaseSummary([sample, { ...sample, [key]: '不同' }]).length, 2, key);
  assert.equal((await app.adminGet(new Request(origin + app.drinkApi))).status, 401);
  const token = 'b'.repeat(64), hash = createHash('sha256').update(token).digest('hex');
  sqlite.prepare('INSERT INTO administrator VALUES (?,?,?,?,?)').run('primary', 'admin', 'unused', 'test', 'now');
  sqlite.prepare('INSERT INTO administrator_sessions VALUES (?,?,?,?)').run(hash, 'primary', 'test', Date.now() + 600000);
  const request = (extra = '', body) => new Request(origin + app.drinkApi + extra, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  r = await app.adminGet(request()); const data = await r.json(); assert.equal(data.submitted, 5); assert.equal(data.needed, 4); assert.equal(data.declined, 1); assert.equal(data.pending.length, 0);
  assert.equal(data.brands.find(g => g.brand === '霸王茶姬').quantity, 2);
  for (const kind of ['orders', 'purchases', 'brands']) { r = await app.adminGet(request('?export=' + kind)); assert.equal(r.status, 200); assert.match(r.headers.get('Content-Disposition'), /attachment/); const csv = await r.text(); assert.match(csv, /品牌/); assert.match(csv, /霸王茶姬/); }
  assert.match(app.drinkCsv([{ ...sample, note: '=1+1' }], 'orders'), /'=1\+1/);
  await app.saveDrinkSettings({ open: true, deadline: '2026-01-01T00:00:00+08:00' });
  assert.equal((await form('普通甲', 'save', tea)).status, 409);
  r = await app.adminPost(request('', { action: 'order', name: '普通甲', order: tea })); assert.equal(r.status, 200);
  await app.saveDrinkSettings({ open: false, deadline: null }); assert.equal((await form('普通乙', 'save', milk)).status, 409);
  html = await (await form('普通甲', 'save', tea)).text(); assert.match(html, /蜜桃四季春/); assert(!html.includes('你还没有提交订单'));
  html = await (await form('普通甲')).text(); assert.match(html, /问卷已截止或关闭/); assert(!html.includes('确认提交')); assert.match(html, /蜜桃四季春/);
  assert.equal((await app.adminPost(request('', { action: 'settings', settings: { open: true, deadline: null } }))).status, 200);
  assert.equal((await form('普通甲', 'save', tea)).status, 200);
  console.log('PASS name-only forms; all three brand branches and Huang aliases; real SQLite insert/update uniqueness; menu validation and integer prices; complete specification grouping; private admin/CSV; deadline, closure and admin override; WeChat UA without cookies.');
} finally { sqlite.close(); delete globalThis.__drinkTestEnv; rmSync(dir, { recursive: true, force: true }); }
