import { env } from 'cloudflare:workers';
import { rateLimit } from '@/lib/administrator';
import { favoriteCharacterHtml } from '@/lib/favorite-character-html';
import { favoriteCharacterMaxBytes, favoriteCharacterObjectMaxBytes, favoriteCharacterNameLimit, favoriteCharacterRoleLimit, type FavoriteCharacterSurvey } from '@/lib/favorite-character-model';
import { favoriteCharacterWriteMode, getFavoriteCharacterObjectStore } from '@/lib/favorite-character-object-store';
import { favoriteCharacterResponseInput, readFavoriteCharacterSurvey, recordFavoriteCharacterObject, recordFavoriteCharacterResponse } from '@/lib/favorite-character-survey';
import { HttpError } from '@/lib/http';
import { validate } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
};
function html(survey: FavoriteCharacterSurvey, page: Parameters<typeof favoriteCharacterHtml>[1], status = 200) {
  return new Response(favoriteCharacterHtml(survey, page), { status, headers });
}

function requireFormOrigin(request: Request) {
  const expected = env.PUBLIC_SITE_ORIGIN || new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin === expected || (!origin && (request.headers.get('referer')?.startsWith(expected + '/') || request.headers.get('sec-fetch-site') === 'same-origin'))) return;
  throw new HttpError(403, '请重新打开问卷链接，从页面内提交。');
}

function uploadConfiguration() {
  const mode = favoriteCharacterWriteMode();
  const store = mode === 'object' ? getFavoriteCharacterObjectStore() : null;
  return { store, paused: mode === 'paused' || (mode === 'object' && !store), maxBytes: store ? favoriteCharacterObjectMaxBytes : favoriteCharacterMaxBytes };
}

async function readMultipart(request: Request, contentType: string, maxBytes: number, tooLarge: string) {
  const limit = maxBytes + 32_768;
  if (Number(request.headers.get('content-length') || '0') > limit) throw new HttpError(413, tooLarge);
  if (!request.body) throw new HttpError(400, '未收到图片，请重新选择后提交。');
  let size = 0;
  let oversized = false;
  const stream = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.length;
      if (size > limit) { oversized = true; controller.error(new Error('multipart-size')); }
      else controller.enqueue(chunk);
    },
  }));
  try { return await new Response(stream, { headers: { 'Content-Type': contentType } }).formData(); }
  catch {
    if (oversized) throw new HttpError(413, tooLarge);
    throw new HttpError(400, '无法读取提交内容，请重新选择图片后再试。');
  }
}

export async function GET() {
  const { paused, maxBytes } = uploadConfiguration();
  return html(await readFavoriteCharacterSurvey(), { requestKey: crypto.randomUUID(), paused, maxBytes });
}

export async function POST(request: Request) {
  let requestKey = crypto.randomUUID() as string;
  let fields = { name: '', character: '' };
  const survey = await readFavoriteCharacterSurvey();
  const { store, paused, maxBytes } = uploadConfiguration();
  const tooLarge = `图片超过 ${maxBytes / (1024 * 1024)} MB，请重新选择。`;
  try {
    requireFormOrigin(request);
    if (!survey.open) return html(survey, {}, 409);
    if (paused) return html(survey, { paused }, 503);
    const contentType = request.headers.get('content-type') || '';
    if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new HttpError(415, '请从问卷页面选择并提交图片。');
    await rateLimit(request, 'favorite-character-submit', 100);
    const form = await readMultipart(request, contentType, maxBytes, tooLarge);
    const value = (key: string) => { const field = form.get(key); return typeof field === 'string' ? field : ''; };
    fields = { name: value('name').slice(0, favoriteCharacterNameLimit), character: value('character').slice(0, favoriteCharacterRoleLimit) };
    const key = value('request_key');
    if (/^[0-9a-f-]{36}$/i.test(key)) requestKey = key;
    const answer = validate(favoriteCharacterResponseInput, { name: value('name'), character: value('character'), request_key: key });
    const image = form.get('image');
    if (form.getAll('image').length !== 1 || !image || typeof image === 'string' || !image.size) throw new HttpError(400, '请选择一张图片再提交。');
    if (image.size > maxBytes) throw new HttpError(413, tooLarge);
    if (store) await recordFavoriteCharacterObject(answer, image, store);
    else await recordFavoriteCharacterResponse(answer, new Uint8Array(await image.arrayBuffer()));
    return html(survey, { submitted: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error('favorite-character-submit-failed');
    const message = error instanceof HttpError ? error.message : '暂时无法提交，请重新选择图片后再试。';
    return html(status === 409 ? await readFavoriteCharacterSurvey() : survey, {
      fields, requestKey: status === 409 ? crypto.randomUUID() : requestKey, error: message, maxBytes, paused,
    }, status);
  }
}
