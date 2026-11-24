import { z } from 'zod';
import { database } from './data';
import { HttpError } from './http';
import { digest } from './passwords';
import { boysDayCopyFields, boysDayResponseLimits, defaultBoysDaySurvey, type BoysDayResponse, type BoysDaySurvey } from './boys-day-survey-model';

const setting = 'boys_day_survey';
const copySchema = z.object(Object.fromEntries(Object.entries(boysDayCopyFields).map(([key, field]) => [
  key,
  z.string().trim().min('optional' in field ? 0 : 1, `请填写${field.label}。`).max(field.max, `${field.label}最多${field.max}个字符。`),
])) as Record<keyof typeof boysDayCopyFields, z.ZodString>).strict();

export const boysDaySettingsInput = z.object({ open: z.boolean(), copy: copySchema }).strict();

export const boysDayResponseInput = z.object({
  name: z.string().trim().min(1, '请填写姓名。').max(boysDayResponseLimits.name, '姓名最多40个字符。'),
  pairs: z.string().trim().max(boysDayResponseLimits.pairs, '词对最多2000个字符。'),
  introduction: z.string().trim().max(boysDayResponseLimits.introduction, '自我介绍最多160个字符。'),
  request_key: z.string().uuid(),
}).strict().refine(answer => answer.pairs || answer.introduction, '请至少填写一组词对或一句自我介绍。');

export async function readBoysDaySurvey(): Promise<BoysDaySurvey> {
  const row = await database().prepare('SELECT value FROM settings WHERE key = ?').bind(setting).first<{ value: string }>();
  return row ? boysDaySettingsInput.parse(JSON.parse(row.value)) : defaultBoysDaySurvey;
}

export async function saveBoysDaySurvey(survey: BoysDaySurvey) {
  await database().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(setting, JSON.stringify(survey)).run();
}

export async function recordBoysDayResponse(answer: z.infer<typeof boysDayResponseInput>) {
  const db = database();
  const key = digest(answer.request_key);
  const payload = digest(JSON.stringify([answer.name, answer.pairs, answer.introduction]));

  // Check the deadline in the write itself so closing the survey also stops requests in flight.
  const [, lookup] = await db.batch<{ payload_hash: string }>([
    db.prepare(`INSERT INTO boys_day_responses (id, request_key, payload_hash, name, pairs, introduction, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE COALESCE((SELECT json_extract(value, '$.open') FROM settings WHERE key = ?), 1) = 1
      ON CONFLICT(request_key) DO NOTHING`)
      .bind(crypto.randomUUID(), key, payload, answer.name, answer.pairs, answer.introduction, new Date().toISOString(), setting),
    db.prepare('SELECT payload_hash FROM boys_day_responses WHERE request_key = ?').bind(key),
  ]);
  const stored = lookup.results[0];
  if (!stored) throw new HttpError(409, (await readBoysDaySurvey()).copy.closedText);
  if (stored.payload_hash !== payload) throw new HttpError(409, '本次提交标识已使用，请重新填写后提交。');
}

export async function readBoysDayResponses() {
  const result = await database().prepare('SELECT id, name, pairs, introduction, created_at FROM boys_day_responses ORDER BY created_at DESC, id DESC')
    .all<BoysDayResponse>();
  return result.results;
}
