import { z } from 'zod';
import { database } from './data';
import { seedRoster } from './accounts';
import { HttpError } from './http';
import { homeworkSummary, type HomeworkRow } from './color-homework-model';
export const homeworkInput = z.object({
 student_id: z.string().min(1).max(90), submitted: z.boolean(),
 sheet_count: z.number().int('张数须为整数。').min(0).max(2147483647),
 version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict().refine(v => !v.submitted || v.sheet_count > 0, '已交老师时，请填写大于零的整数张数。');
type StoredRow = { student_id: string; name: string; submitted: number; sheet_count: number; version: number; updated_at: string | null };
export async function homeworkData(admin = false, ownStudentId?: string) {
 await seedRoster();
 // A single statement gives the roster and all progress one consistent snapshot.
 const result = await database().prepare(`SELECT r.student_id,r.name,COALESCE(h.submitted,0) AS submitted,
 COALESCE(h.sheet_count,0) AS sheet_count,COALESCE(h.version,0) AS version,h.updated_at
 FROM class_roster r LEFT JOIN color_homework h ON h.student_id=r.student_id WHERE r.enabled=1 ORDER BY r.student_id`).all<StoredRow>();
 const rows: HomeworkRow[] = result.results.map(r => ({ ...(admin ? { id: r.student_id } : {}), name: r.name,
  submitted: r.submitted === 1, sheet_count: admin || r.submitted === 1 ? r.sheet_count : 0,
  version: r.version, updated_at: r.updated_at, is_me: r.student_id === ownStudentId }));
 return { rows, summary: homeworkSummary(rows) };
}
export async function saveHomework(input: z.infer<typeof homeworkInput>) {
 const { student_id, submitted, sheet_count, version } = input, db = database(), now = new Date().toISOString();
 // Unique roster key and compare-and-swap prevent duplicate rows and lost updates.
 const result = version === 0
  ? await db.prepare(`INSERT OR IGNORE INTO color_homework(student_id,submitted,sheet_count,version,updated_at)
    SELECT student_id,?,?,1,? FROM class_roster WHERE student_id=? AND enabled=1`).bind(Number(submitted),sheet_count,now,student_id).run()
  : await db.prepare(`UPDATE color_homework SET submitted=?,sheet_count=?,version=version+1,updated_at=?
    WHERE student_id=? AND version=? AND EXISTS(SELECT 1 FROM class_roster WHERE student_id=? AND enabled=1)`)
    .bind(Number(submitted),sheet_count,now,student_id,version,student_id).run();
 if (!result.meta.changes) throw new HttpError(409,'记录已被更新或该同学已停用，已重新读取，请核对后再修改。');
 return homeworkData(true);
}
