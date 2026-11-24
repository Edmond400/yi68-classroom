import { requireAdministrator } from '@/lib/administrator';
import { primaryManager } from '@/lib/activity-management-auth';
import { readManagement,writeManagement } from '@/lib/incentive-management';
import { fail } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await requireAdministrator(request);return await readManagement(primaryManager)}catch(e){return fail(e)}}
export async function POST(request:Request){try{await requireAdministrator(request);return await writeManagement(request,primaryManager)}catch(e){return fail(e)}}
