import {emitEvent} from './site-telemetry';
import { database } from './data';
import { HttpError } from './http';
import { brandSummary, canonicalName, defaultDrinkSettings, drinkSetting, drinkSettingsInput, normalizeOrder, purchaseSummary, type DrinkRow, type DrinkSettings } from './drink-order-model';

export async function readDrinkSettings(): Promise<DrinkSettings> {
  const row = await database().prepare('SELECT value FROM settings WHERE key=?').bind(drinkSetting).first<{ value: string }>();
  return row ? drinkSettingsInput.parse(JSON.parse(row.value)) : defaultDrinkSettings;
}
export async function saveDrinkSettings(value: unknown) {
  const settings = drinkSettingsInput.parse(value);
  await database().prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(drinkSetting, JSON.stringify(settings)).run();
}
export async function findDrinkMember(input: string) {
  const name = canonicalName(input.trim().replace(/\s/g, ''));
  if (!name || name.length > 40) throw new HttpError(400, '请检查并输入你的完整姓名。');
  const rows = await database().prepare("SELECT student_id,name FROM class_roster WHERE enabled=1 AND (replace(name,' ','')=? OR (?='示例甲' AND name='示例旧甲') OR (? IN ('示例丙','示例旧丙') AND name IN ('示例丙','示例旧丙')))").bind(name, name, name).all<{ student_id: string; name: string }>();
  if (rows.results.length !== 1) throw new HttpError(400, '没有匹配到这个姓名，请检查是否有错别字；如仍无法填写，请联系班长。');
  return { ...rows.results[0], name: canonicalName(rows.results[0].name) };
}
export async function readDrinkOrder(studentId: string) {
  const row = await database().prepare('SELECT order_json,updated_at FROM boys_day_drink_orders WHERE student_id=?').bind(studentId).first<{ order_json: string; updated_at: string }>();
  return row ? { ...JSON.parse(row.order_json), student_id: studentId, updated_at: row.updated_at } as DrinkRow : null;
}
export async function saveDrinkOrder(name: string, raw: unknown, admin = false) {
  const member = await findDrinkMember(name);
  let order;
  try { order = normalizeOrder(member.name, raw); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : '请检查饮品规格。'); }
  const now = new Date().toISOString();
  const result = await database().prepare(`INSERT INTO boys_day_drink_orders(student_id,order_json,created_at,updated_at)
    SELECT ?,?,?,? WHERE (?=1 OR (COALESCE((SELECT json_extract(value,'$.open') FROM settings WHERE key=?),1)=1
    AND COALESCE((SELECT julianday(json_extract(value,'$.deadline')) FROM settings WHERE key=?),9999999)>julianday('now')))
    AND EXISTS(SELECT 1 FROM class_roster WHERE student_id=? AND enabled=1)
    ON CONFLICT(student_id) DO UPDATE SET order_json=excluded.order_json,updated_at=excluded.updated_at`)
    .bind(member.student_id, JSON.stringify(order), now, now, Number(admin), drinkSetting, drinkSetting, member.student_id).run();
  if (!result.meta.changes) throw new HttpError(409, '问卷已截止或关闭，请联系班长修改。');
  if(!admin)void emitEvent({event_name:'form_submit_success',module_id:'drinks'});
  return (await readDrinkOrder(member.student_id))!;
}
export async function drinkAdminData() {
  const [settings, roster, result] = await Promise.all([
    readDrinkSettings(),
    database().prepare('SELECT student_id,name FROM class_roster WHERE enabled=1 ORDER BY name').all<{ student_id: string; name: string }>(),
    database().prepare('SELECT student_id,order_json,updated_at FROM boys_day_drink_orders').all<{ student_id: string; order_json: string; updated_at: string }>(),
  ]);
  const orders: DrinkRow[] = result.results.map(o => ({ ...JSON.parse(o.order_json), student_id: o.student_id, updated_at: o.updated_at })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const submitted = new Set(orders.map(o => o.student_id));
  return { settings, orders, roster: roster.results.map(r => ({ ...r, name: canonicalName(r.name) })), pending: roster.results.filter(r => !submitted.has(r.student_id)).map(r => canonicalName(r.name)), submitted: orders.length, needed: orders.filter(o => o.drink !== '不需要饮料').length, declined: orders.filter(o => o.drink === '不需要饮料').length, purchases: purchaseSummary(orders), brands: brandSummary(orders) };
}
