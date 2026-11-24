import {readFunds} from '@/lib/funds';
import {json,fail} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(){try{return json(await readFunds())}catch(e){return fail(e)}}
