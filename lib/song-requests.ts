import {emitEvent} from './site-telemetry';
import { z } from 'zod';
import { database } from './data';
import { HttpError } from './http';
export const songPath = '/song-request';
export const songApi = '/api/admin/song-requests';
export type SongRequest = { id: number; song: string; submitted_at: string };
export const songInput = z.object({
  request_id: z.string().uuid('请重新打开点歌页面后提交。'),
  song: z.string().trim().min(1, '请填写歌名。').max(160, '歌名最多160个字符。').transform(s => s.normalize('NFC')),
}).strict();
export const songDeleteInput = z.object({ id: z.number().int().positive() }).strict();
export async function saveSongRequest(answer: z.infer<typeof songInput>) {
  const db = database();
  const inserted=await db.prepare('INSERT INTO song_requests(request_id,song,submitted_at) VALUES (?,?,?) ON CONFLICT(request_id) DO NOTHING')
    .bind(answer.request_id, answer.song, new Date().toISOString()).run();
  const saved = await db.prepare('SELECT song FROM song_requests WHERE request_id=?').bind(answer.request_id).first<{song:string}>();
  if (!saved || saved.song !== answer.song) throw new HttpError(409, '这次点歌已经提交，请点击“重新点歌”再提交下一首。');
  if(inserted.meta.changes)void emitEvent({id:'song:'+answer.request_id,event_name:'form_submit_success',module_id:'songs'});
}
export async function songRequests() {
  return (await database().prepare('SELECT id,song,submitted_at FROM song_requests ORDER BY id ASC').all<SongRequest>()).results;
}
export async function deleteSongRequest(id: number) {
  await database().prepare('DELETE FROM song_requests WHERE id=?').bind(id).run();
}
export function songCsv(rows: SongRequest[]) {
  const cell = (value: string) => '"' + (/^\s*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"';
  return '\uFEFF' + [['歌名', '提交时间（北京时间）'], ...rows.map(row => [row.song, new Date(row.submitted_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })])].map(row => row.map(cell).join(',')).join('\r\n');
}
