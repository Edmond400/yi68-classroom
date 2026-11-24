import { z } from 'zod';

export const drinkPath = '/survey/drinks';
export const drinkApi = '/api/admin/surveys/drinks';
export const drinkSetting = 'boys_day_drinks_20261121';
export const ordinaryBrand = '普通饮品店铺';
export const sugars = ['七分糖', '正常糖', '五分糖', '三分糖', '不额外加糖'] as const;
export const teaTemperatures = ['正常冰', '少冰', '常温', '温热'] as const;
export const milkTemperatures = ['正常冰', '少冰', '热'] as const;
export const teaToppings = { 标准: 0, 珍珠: 100, 椰果: 100, 脆啵啵: 100, 芋圆: 200, 葡萄肉: 200, 芒果丁: 200 };
export const milkBases = { 默认奶底: 0, 换冷链鲜奶: 260 };
export const cups = { 中杯: 800, 大杯: 1060 };
export const drinkSettingsInput = z.object({ open: z.boolean(), deadline: z.string().datetime({ offset: true }).nullable() }).strict();
export type DrinkSettings = z.infer<typeof drinkSettingsInput>;
export const defaultDrinkSettings: DrinkSettings = { open: true, deadline: null };
export type DrinkOrder = { name: string; brand: string; drink: string; cup: string; temperature: string; sugar: string; milk: string; topping: string; requirements: string; note: string; price_cents: number | null };
export type DrinkRow = DrinkOrder & { student_id: string; updated_at: string };
export function profileFor(name: string) {
  if (name === '示例甲' || name === '示例旧甲') return 'heytea';
  if (name === '示例乙') return 'boya';
  if (name === '示例丙' || name === '示例旧丙') return 'chagee';
  return 'ordinary';
}
export function canonicalName(name: string) { return name === '示例旧甲' ? '示例甲' : name; }
export function canOrder(settings: DrinkSettings, now = Date.now()) { return settings.open && (!settings.deadline || now < Date.parse(settings.deadline)); }
export function money(cents: number | null) { return cents === null ? '待按实际菜单确认' : '¥' + (cents / 100).toFixed(2); }
const text = z.string().trim().max(600, '填写内容过长，请控制在600字以内。').default('');
const input = z.object({ drink: text, cup: text, temperature: text, sugar: text, milk: text, topping: text, requirements: text, note: text }).strict();
export function normalizeOrder(name: string, raw: unknown): DrinkOrder {
  const v = input.parse(raw), profile = profileFor(name);
  const order: DrinkOrder = { name: canonicalName(name), brand: '', drink: '', cup: '', temperature: '', sugar: '', milk: '', topping: '', requirements: '', note: v.note, price_cents: null };
  if (profile !== 'ordinary') {
    order.brand = profile === 'heytea' ? '喜茶' : '霸王茶姬';
    order.drink = profile === 'boya' ? '伯牙绝弦' : v.drink;
    if (!order.drink || order.drink.length > 80) throw new Error('请填写具体饮品名称（最多80字）。');
    if (['蜜桃四季春', '珍珠奶茶', '不需要饮料'].includes(order.drink)) throw new Error('请填写已选品牌的具体饮品。');
    if (profile === 'boya' && v.drink && v.drink !== '伯牙绝弦') throw new Error('本次饮品为伯牙绝弦。');
    order.requirements = v.requirements;
    return order;
  }
  if (!['蜜桃四季春', '珍珠奶茶', '不需要饮料'].includes(v.drink)) throw new Error('请选择页面提供的饮品。');
  order.drink = v.drink;
  if (v.drink === '不需要饮料') { order.price_cents = 0; return order; }
  order.brand = ordinaryBrand;
  if (!(sugars as readonly string[]).includes(v.sugar)) throw new Error('请选择有效糖度。');
  order.sugar = v.sugar;
  if (v.drink === '蜜桃四季春') {
    if (!(teaTemperatures as readonly string[]).includes(v.temperature) || !Object.hasOwn(teaToppings, v.topping) || v.cup !== '标准') throw new Error('请检查杯型、温度和加料。');
    order.cup = '标准'; order.temperature = v.temperature; order.topping = v.topping;
    order.price_cents = 920 + teaToppings[v.topping as keyof typeof teaToppings];
  } else {
    if (!(milkTemperatures as readonly string[]).includes(v.temperature) || !Object.hasOwn(cups, v.cup) || !Object.hasOwn(milkBases, v.milk)) throw new Error('请检查杯型、温度和奶底。');
    order.cup = v.cup; order.temperature = v.temperature; order.milk = v.milk; order.topping = '标准（含珍珠）';
    order.price_cents = cups[v.cup as keyof typeof cups] + milkBases[v.milk as keyof typeof milkBases];
  }
  return order;
}
export function specification(o: DrinkOrder) { return [o.cup, o.temperature, o.sugar, o.milk, o.topping, o.requirements].filter(Boolean).join(' / '); }
export function purchaseSummary(orders: DrinkRow[]) {
  const groups = new Map<string, { brand: string; drink: string; specs: string; note: string; quantity: number; price_cents: number | null; names: string[] }>();
  for (const o of orders) {
    if (o.drink === '不需要饮料') continue;
    const key = JSON.stringify([o.brand, o.drink, o.cup, o.temperature, o.sugar, o.milk, o.topping, o.requirements, o.note, o.price_cents]);
    let g = groups.get(key);
    if (!g) { g = { brand: o.brand, drink: o.drink, specs: specification(o), note: o.note, quantity: 0, price_cents: o.price_cents, names: [] }; groups.set(key, g); }
    g.quantity++; g.names.push(o.name);
  }
  return [...groups.values()].sort((a, b) => (a.brand + a.drink + a.specs).localeCompare(b.brand + b.drink + b.specs, 'zh-CN'));
}
export function brandSummary(orders: DrinkRow[]) {
  return [ordinaryBrand, '喜茶', '霸王茶姬'].map(brand => {
    const rows = orders.filter(o => o.brand === brand && o.drink !== '不需要饮料');
    return { brand, quantity: rows.length, known_cents: rows.reduce((n, o) => n + (o.price_cents ?? 0), 0), unpriced: rows.filter(o => o.price_cents === null).length };
  });
}
function csv(rows: unknown[][]) {
  return '\uFEFF' + rows.map(row => row.map(v => { const s = String(v ?? ''); return '"' + (/^[\s]*[=+@-]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"'; }).join(',')).join('\r\n');
}
export function drinkCsv(orders: DrinkRow[], kind: string) {
  if (kind === 'purchases') return csv([['品牌', '品名', '完整规格', '备注', '数量', '参考单价（元）', '可计算小计（元）', '姓名'], ...purchaseSummary(orders).map(g => [g.brand, g.drink, g.specs, g.note, g.quantity, g.price_cents === null ? '待确认' : g.price_cents / 100, g.price_cents === null ? '待确认' : g.price_cents * g.quantity / 100, g.names.join('、')])]);
  if (kind === 'brands') return csv([['品牌', '杯数', '可计算参考金额（元）', '待确认价格杯数'], ...brandSummary(orders).map(g => [g.brand, g.quantity, g.known_cents / 100, g.unpriced])]);
  return csv([['姓名', '品牌', '品名', '杯型', '温度', '糖度', '奶底', '加料', '自由填写要求', '备注', '参考价格（元）', '最后修改时间（北京时间）'], ...orders.map(o => [o.name, o.brand, o.drink, o.cup, o.temperature, o.sugar, o.milk, o.topping, o.requirements, o.note, o.price_cents === null ? '待确认' : o.price_cents / 100, new Date(o.updated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })])]);
}
