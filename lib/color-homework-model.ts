export type HomeworkRow = { id?: string; name: string; submitted: boolean; sheet_count: number; version: number; updated_at: string | null; is_me: boolean };
export type HomeworkData = { rows: HomeworkRow[]; summary: ReturnType<typeof homeworkSummary> };
export function homeworkSummary(rows: HomeworkRow[]) {
 const submitted = rows.filter(r => r.submitted);
 return { total: rows.length, submitted: submitted.length, pending: rows.length - submitted.length,
  sheets: submitted.reduce((sum, r) => sum + r.sheet_count, 0),
  percentage: rows.length ? Math.round(submitted.length / rows.length * 1000) / 10 : 0,
  updated_at: rows.reduce<string | null>((latest, r) => r.updated_at && (!latest || r.updated_at > latest) ? r.updated_at : latest, null) };
}
