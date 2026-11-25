import {emitEvent} from './site-telemetry';
import { z } from 'zod';
import { database } from './data';

export const talentPath = '/survey/talent';
export const talentApi = '/api/admin/surveys/talent';
export type TalentRegistration = { name: string; program: string; submitted_at: string };
export const talentInput = z.object({
  name: z.string().trim().min(1, '请填写姓名。').max(40, '姓名最多40个字符。').transform(s => s.normalize('NFC')),
  program: z.string().trim().min(1, '请填写节目名称。').max(160, '节目名称最多160个字符。'),
}).strict();
export const talentDeleteInput = z.object({ name: talentInput.shape.name }).strict();
export async function saveTalentRegistration(answer: z.infer<typeof talentInput>) {
  await database().prepare(`INSERT INTO talent_registrations(name,program,submitted_at) VALUES (?,?,?)
    ON CONFLICT(name) DO UPDATE SET program=excluded.program,submitted_at=excluded.submitted_at`)
    .bind(answer.name, answer.program, new Date().toISOString()).run();
  void emitEvent({event_name:'form_submit_success',module_id:'talent'});
}
export async function talentRegistrations() {
  return (await database().prepare('SELECT name,program,submitted_at FROM talent_registrations ORDER BY submitted_at DESC,name').all<TalentRegistration>()).results;
}
export async function deleteTalentRegistration(name: string) {
  await database().prepare('DELETE FROM talent_registrations WHERE name=?').bind(name).run();
}
export function talentCsv(rows: TalentRegistration[]) {
  const cell = (value: string) => '"' + (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"';
  return '\uFEFF' + [['姓名','节目名称','提交时间（北京时间）'], ...rows.map(row => [row.name,row.program,new Date(row.submitted_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})])].map(row => row.map(cell).join(',')).join('\r\n');
}
