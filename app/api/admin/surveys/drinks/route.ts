import { requireAdministrator } from '@/lib/administrator';
import { drinkAdminData, saveDrinkOrder, saveDrinkSettings } from '@/lib/drink-orders';
import { drinkCsv } from '@/lib/drink-order-model';
import { HttpError, fail, json, readJson } from '@/lib/http';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    await requireAdministrator(request);
    const data = await drinkAdminData(), kind = new URL(request.url).searchParams.get('export');
    if (!kind) return json(data);
    if (!['orders', 'purchases', 'brands'].includes(kind)) throw new HttpError(400, '请选择有效的导出类型。');
    return new Response(drinkCsv(data.orders, kind), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="yi68-drinks-${kind}-20261121.csv"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request) {
  try {
    await requireAdministrator(request);
    const body = await readJson(request);
    if (body.action === 'settings') await saveDrinkSettings(body.settings);
    else if (body.action === 'order' && typeof body.name === 'string') await saveDrinkOrder(body.name, body.order, true);
    else throw new HttpError(400, '请选择有效的管理操作。');
    return json(await drinkAdminData());
  } catch (error) { return fail(error instanceof ZodError ? new HttpError(400, '请检查截止时间和问卷设置。') : error); }
}
