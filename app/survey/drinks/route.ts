import { env } from 'cloudflare:workers';
import { drinkOrderHtml } from '@/lib/drink-order-html';
import { findDrinkMember, readDrinkOrder, readDrinkSettings, saveDrinkOrder } from '@/lib/drink-orders';
import { HttpError, readBytes } from '@/lib/http';

export const dynamic = 'force-dynamic';
async function page(state: Parameters<typeof drinkOrderHtml>[2] = {}, status = 200) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  return new Response(drinkOrderHtml(await readDrinkSettings(), nonce, state), { status, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  } });
}
export async function GET() { return page(); }
export async function POST(request: Request) {
  let name = '', studentId = '', fields: Record<string, string> = {};
  try {
    const expected = env.PUBLIC_SITE_ORIGIN || new URL(request.url).origin, origin = request.headers.get('origin'), referrer = request.headers.get('referer');
    if (origin !== expected && !(!origin && (referrer?.startsWith(expected + '/') || request.headers.get('sec-fetch-site') === 'same-origin'))) throw new HttpError(403, '请重新打开问卷链接后填写。');
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') throw new HttpError(415, '请通过页面表单填写。');
    const form = new URLSearchParams(new TextDecoder().decode(await readBytes(request, 16000)));
    for (const key of new Set(form.keys())) if (form.getAll(key).length !== 1) throw new HttpError(400, '表单内容重复，请重新选择饮品。');
    const member = await findDrinkMember(form.get('name') || ''); name = member.name; studentId = member.student_id;
    const action = form.get('action');
    if (action === 'identify') return page({ name, order: await readDrinkOrder(member.student_id) });
    fields = Object.fromEntries([...form].filter(([key]) => !['name', 'action'].includes(key)));
    if (action === 'choose') return page({ name, fields: { drink: fields.drink, note: fields.note || '' }, order: await readDrinkOrder(member.student_id) });
    if (action !== 'save') throw new HttpError(400, '请选择页面提供的操作。');
    const order = await saveDrinkOrder(name, fields);
    return page({ name, order, saved: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error('drink-form', error instanceof Error ? error.message : 'unknown');
    return page({ name, fields, order: studentId ? await readDrinkOrder(studentId) : null, error: error instanceof HttpError ? error.message : '暂时无法提交，请稍后重试。' }, status);
  }
}
