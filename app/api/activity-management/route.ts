import { requireActivityManager } from '@/lib/activity-management-auth';
import { readManagement,writeManagement } from '@/lib/incentive-management';
import { fail } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return await readManagement(await requireActivityManager(request))}catch(e){return fail(e)}}
export async function POST(request:Request){try{return await writeManagement(request,await requireActivityManager(request))}catch(e){return fail(e)}}
