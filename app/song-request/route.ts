import { env } from 'cloudflare:workers';
import { HttpError, readBytes } from '@/lib/http';
import { validate } from '@/lib/validation';
import { saveSongRequest, songInput, songPath } from '@/lib/song-requests';
import { songRequestHtml } from '@/lib/song-request-html';
export const dynamic = 'force-dynamic';
const headers = {
  'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'private, no-store',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy':'same-origin', 'X-Content-Type-Options':'nosniff',
};
export async function GET(request: Request) {
  return new Response(songRequestHtml({ requestId: crypto.randomUUID(), submitted: new URL(request.url).searchParams.get('submitted') === '1' }), { headers });
}
export async function POST(request: Request) {
  let fields = { request_id: '', song: '' };
  try {
    const expected = env.PUBLIC_SITE_ORIGIN || new URL(request.url).origin;
    const origin = request.headers.get('origin');
    if (origin !== expected && (origin || !(request.headers.get('referer')?.startsWith(expected + '/') || request.headers.get('sec-fetch-site') === 'same-origin'))) throw new HttpError(403, '无法确认表单来源，请重新打开点歌链接。');
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') throw new HttpError(415, '请通过点歌页面提交。');
    const form = new URLSearchParams(new TextDecoder().decode(await readBytes(request, 4096)));
    fields = { request_id: form.get('request_id') || '', song: form.get('song') || '' };
    await saveSongRequest(validate(songInput, fields));
    return new Response(null, { status: 303, headers: { ...headers, Location: songPath + '?submitted=1' } });
  } catch (error) {
    if (!(error instanceof HttpError)) console.error('song-request-submit-failed');
    return new Response(songRequestHtml({ requestId: fields.request_id, song: fields.song, error: error instanceof HttpError ? error.message : '暂时无法提交，你填写的歌名已保留，请重试。' }), { status: error instanceof HttpError ? error.status : 500, headers });
  }
}
