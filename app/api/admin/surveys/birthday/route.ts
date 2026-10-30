import { requireAdministrator } from '@/lib/administrator';
import { birthdayResults } from '@/lib/birthday';
import { fail,json } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await requireAdministrator(request);return json(await birthdayResults(new URL(request.url)))}catch(error){return fail(error)}}
