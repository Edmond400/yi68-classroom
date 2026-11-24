import { requireAdministrator } from '@/lib/administrator';
import { homeworkData, homeworkInput, saveHomework } from '@/lib/color-homework';
import { fail, json, readJson } from '@/lib/http';
import { validate } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
 try { await requireAdministrator(request); return json(await homeworkData(true)); } catch(error) { return fail(error); }
}
export async function PATCH(request: Request) {
 try { await requireAdministrator(request); const input = validate(homeworkInput,await readJson(request)); return json(await saveHomework(input)); }
 catch(error) { return fail(error); }
}
