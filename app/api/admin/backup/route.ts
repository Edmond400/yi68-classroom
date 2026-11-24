import { readAttachment, attachmentChecksum } from '@/lib/attachment-storage';
import { getActor } from '@/lib/auth';
import { database } from '@/lib/data';
import { json, fail, HttpError } from '@/lib/http';
export const dynamic = 'force-dynamic';
const tables = ['settings', 'items', 'progress', 'events', 'class_roster', 'student_accounts', 'feedback', 'assets', 'administrator', 'birthday_responses', 'boys_day_responses', 'incentive_members', 'incentive_tasks', 'incentive_activities', 'incentive_participations', 'incentive_counts', 'incentive_claims', 'incentive_periods', 'incentive_draw_codes', 'incentive_audit', 'activity_admin_grants', 'student_nicknames', 'incentive_monthly_awards', 'incentive_prize_deliveries', 'incentive_monthly_redemptions', 'fund_settings', 'fund_entries', 'fund_audit', 'color_homework','sketch_homework'] as const;
export async function GET(request?:Request) {
  try {
    if (!(await getActor(request))?.isAdmin) throw new HttpError(403, '仅班长可以导出数据。');
    const db = database();
    const rows = await db.batch(tables.map(table => db.prepare('SELECT * FROM ' + table)));
    const data = Object.fromEntries(tables.map((table, i) => [table, rows[i].results as Record<string, unknown>[]]));
    // Platform identities and live credentials do not migrate to a different host.
    data.settings = data.settings.filter(row => !['owner_id'].includes(String(row.key)));
    const manifestOnly = request ? new URL(request.url).searchParams.get('mode') === 'manifest' : false;
    const manifest: { id: string; filename: string; size: number; checksum: string; download: string }[] = [];
    const files: { id: string; base64: string }[] = [];
    let total = 0;
    for (const raw of data.assets) {
      const asset = raw as { id: string; filename: string; size: number; checksum?: string };
      total += asset.size;
      if (!manifestOnly && total > 20 * 1024 * 1024) throw new HttpError(413, '附件超过20MB，请使用“导出数据与附件清单”，再按清单逐份下载附件。');
      if (manifestOnly && asset.checksum) { manifest.push({id:asset.id,filename:asset.filename,size:asset.size,checksum:asset.checksum,download:'/api/assets/'+asset.id}); continue; }
      const file = await readAttachment(asset.id, asset.size);
      if (!file) throw new HttpError(409, '有附件暂时无法读取，请稍后重试。');
      manifest.push({id:asset.id,filename:asset.filename,size:asset.size,checksum:attachmentChecksum(file),download:'/api/assets/'+asset.id});
      if (!manifestOnly) files.push({ id: asset.id, base64: Buffer.from(file).toString('base64') });
    }
    const result = json({ format: 'yi68-backup-v3', exported_at: new Date().toISOString(), scope: 'class_records_and_general_attachments', excluded_media: ['favorite_character_survey', 'rehearsal'], files_mode: manifestOnly ? 'external' : 'inline', data, files, manifest });
    result.headers.set('Content-Disposition', 'attachment; filename="yi68-private.backup.json"');
    return result;
  } catch (error) { return fail(error); }
}
