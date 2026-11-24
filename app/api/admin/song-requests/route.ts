import { requireAdministrator } from '@/lib/administrator';
import { fail, json, readJson } from '@/lib/http';
import { validate } from '@/lib/validation';
import { deleteSongRequest, songCsv, songDeleteInput, songRequests } from '@/lib/song-requests';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    await requireAdministrator(request);
    const rows = await songRequests();
    if (new URL(request.url).searchParams.get('export') === 'csv') return new Response(songCsv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="yi68-song-requests.csv"', 'Cache-Control': 'private, no-store', 'Vary': 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff' } });
    return json({ rows });
  } catch (error) { return fail(error); }
}
export async function DELETE(request: Request) {
  try {
    await requireAdministrator(request);
    const { id } = validate(songDeleteInput, await readJson(request));
    await deleteSongRequest(id);
    return json({ ok: true });
  } catch (error) { return fail(error); }
}
