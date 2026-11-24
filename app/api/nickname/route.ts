import { z } from 'zod';
import { requireStudent } from '@/lib/accounts';
import { fail,json,readJson } from '@/lib/http';
import { runDueSettlements } from '@/lib/incentives';
import { nicknameSettings,saveNickname } from '@/lib/nicknames';
import { validate } from '@/lib/validation';
export const dynamic='force-dynamic';
const schema=z.object({nickname:z.string().max(512)}).strict();
export async function GET(request:Request){try{return json(await nicknameSettings(await requireStudent(request)))}catch(e){return fail(e)}}
export async function POST(request:Request){try{
 const student=await requireStudent(request),p=validate(schema,await readJson(request));
 // Freeze any due draw before changing the name used by future draws.
 await runDueSettlements();return json(await saveNickname(student,p.nickname));
}catch(e){return fail(e)}}
