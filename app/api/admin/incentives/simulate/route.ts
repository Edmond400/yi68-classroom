import { z } from 'zod';
import { requireAdministrator } from '@/lib/administrator';
import { fail,json,readJson } from '@/lib/http';
import { simulateReward } from '@/lib/incentives';
import { validate } from '@/lib/validation';
export const dynamic='force-dynamic';
const schema=z.object({kind:z.enum(['month','semester'])}).strict();
export async function POST(request:Request){try{await requireAdministrator(request);const p=validate(schema,await readJson(request));return json(await simulateReward(p.kind))}catch(e){return fail(e)}}
