import { requireAdministrator } from '@/lib/administrator';
import { fail, json, readJson } from '@/lib/http';
import { validate } from '@/lib/validation';
import { deleteTalentRegistration, talentCsv, talentDeleteInput, talentRegistrations } from '@/lib/talent-survey';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    await requireAdministrator(request);
    const rows = await talentRegistrations();
    if(new URL(request.url).searchParams.get('export')==='csv') return new Response(talentCsv(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="yi68-talent.csv"','Cache-Control':'private, no-store','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff'}});
    return json({rows});
  } catch(error) { return fail(error); }
}
export async function DELETE(request: Request) {
  try {
    await requireAdministrator(request);
    const {name} = validate(talentDeleteInput,await readJson(request));
    await deleteTalentRegistration(name);
    return json({ok:true});
  } catch(error) { return fail(error); }
}
