import { requireAdministrator } from '@/lib/administrator';
import { birthdayCsv,birthdayResults } from '@/lib/birthday';
import { fail } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await requireAdministrator(request);const data=await birthdayResults(new URL(request.url));return new Response(birthdayCsv(data.rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="yi68-birthday.csv"','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}})}catch(error){return fail(error)}}
