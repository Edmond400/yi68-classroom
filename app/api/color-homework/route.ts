import { homeworkData } from '@/lib/color-homework';
import { fail, json } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
 try { return json(await homeworkData(false)); }
 catch(error) { return fail(error); }
}
