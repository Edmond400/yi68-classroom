import { fail,json } from '@/lib/http';
import { publicRewards } from '@/lib/incentives';
export const dynamic='force-dynamic';
export async function GET(){try{return json(await publicRewards())}catch(e){return fail(e)}}
