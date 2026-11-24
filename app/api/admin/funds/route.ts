import {requireAdministrator} from '@/lib/administrator';
import {readFunds,writeFunds} from '@/lib/funds';
import {json,fail,readJson} from '@/lib/http';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await requireAdministrator(request);return json(await readFunds(true))}catch(e){return fail(e)}}
export async function POST(request:Request){try{const admin=await requireAdministrator(request);return json(await writeFunds(await readJson(request),admin.username))}catch(e){return e instanceof z.ZodError?json({error:'请检查日期、金额和必填项目。'},400):fail(e)}}
