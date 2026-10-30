import { env } from 'cloudflare:workers';
import type { Item, PublicData, Detail } from './model';
import { emptyDetail } from './model';
export function database() { if (!env.DB) throw new Error('班务数据暂时不可用，请稍后重试。'); return env.DB; }
export function decodeItem(raw: any): Item { return { ...raw, data: JSON.parse(raw.data) as Detail }; }
export async function seed() {
  const db = database();
  if (await db.prepare("SELECT value FROM settings WHERE key = 'seed_v1'").first()) return;
  const ts = new Date().toISOString();
  const records = [
    ['emblem-motto', '班徽与口号方案', '应提交学校的班徽和口号方案定稿完成。', '已定稿', '班级建设'],
    ['class-merch', '班级文创征集', '班级文创征集方案初步拟定。', '筹备中', '班级文创'],
    ['class-meeting', '班会时间安排', '班会召开时间确定方案初步拟定。', '待确认', '班级活动'],
  ];
  const statements: D1PreparedStatement[] = [];
  for (const [n, [id, title, summary, status, category]] of records.entries()) {
    const detail = { ...emptyDetail, summary, status, category };
    statements.push(db.prepare('INSERT OR IGNORE INTO items (id, kind, title, data, published, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)').bind(id, 'task', title, JSON.stringify(detail), ts, ts));
    statements.push(db.prepare('INSERT OR IGNORE INTO progress (id, item_id, day, summary, next_step, cooperation, published, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)').bind('initial-' + n + '-' + id, id, '2026-09-12', summary, '', '', ts));
  }
  statements.push(db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('seed_v1', '1')"));
  await db.batch(statements);
}
export async function getPublicData(): Promise<PublicData> {
  await seed(); const db = database();
  const result = await db.batch([
    db.prepare('SELECT * FROM items WHERE published = 1 ORDER BY updated_at DESC, id ASC'),
    db.prepare('SELECT p.*, i.title FROM progress p JOIN items i ON i.id = p.item_id WHERE p.published = 1 AND i.published = 1 ORDER BY p.day DESC, p.created_at ASC, p.id ASC'),
    db.prepare('SELECT e.*, i.title AS item_title FROM events e JOIN items i ON i.id = e.item_id WHERE i.published = 1 ORDER BY e.starts_at ASC'),
    db.prepare('SELECT a.* FROM assets a JOIN items i ON i.id = a.item_id WHERE i.published = 1'),
  ]);
  return { items: result[0].results.map(decodeItem), progress: result[1].results as any, events: result[2].results as any, assets: result[3].results as any };
}
