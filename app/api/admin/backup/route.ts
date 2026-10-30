import { readAttachment } from '@/lib/attachment-storage';
import { getActor } from '@/lib/auth';
import { database } from '@/lib/data';
import { json, fail, HttpError } from '@/lib/http';
export const dynamic = 'force-dynamic';
const tables = ['settings', 'items', 'progress', 'events', 'class_roster', 'student_accounts', 'feedback', 'assets', 'administrator', 'birthday_responses', 'incentive_members', 'incentive_tasks', 'incentive_activities', 'incentive_participations', 'incentive_counts', 'incentive_claims', 'incentive_periods', 'incentive_draw_codes', 'incentive_audit'] as const;
export async function GET() {
  try {
    if (!(await getActor())?.isAdmin) throw new HttpError(403, '仅班长可以导出数据。');
    const db = database();
    const rows = await db.batch(tables.map(table => db.prepare('SELECT * FROM ' + table)));
    const data = Object.fromEntries(tables.map((table, i) => [table, rows[i].results as Record<string, unknown>[]]));
    // Platform identities and live credentials do not migrate to a different host.
    data.settings = data.settings.filter(row => !['owner_id'].includes(String(row.key)));
    const files: { id: string; base64: string }[] = [];
    let total = 0;
    for (const raw of data.assets) {
      const asset = raw as { id: string; size: number };
      total += asset.size;
      if (total > 20 * 1024 * 1024) throw new HttpError(413, '附件超过单次导出上限，请联系维护人员分批迁移附件。');
      const file = await readAttachment(asset.id, asset.size);
      if (!file) throw new HttpError(409, '有附件暂时无法读取，请稍后重试。');
      files.push({ id: asset.id, base64: Buffer.from(file).toString('base64') });
    }
    const result = json({ format: 'yi68-backup-v3', exported_at: new Date().toISOString(), data, files });
    result.headers.set('Content-Disposition', 'attachment; filename="yi68-private.backup.json"');
    return result;
  } catch (error) { return fail(error); }
}
