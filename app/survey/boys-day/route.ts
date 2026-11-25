import { env } from 'cloudflare:workers';
import { rateLimit } from '@/lib/administrator';
import { boysDaySurveyHtml } from '@/lib/boys-day-survey-html';
import { boysDaySurveyPath, type BoysDaySurvey } from '@/lib/boys-day-survey-model';
import { boysDayResponseInput, readBoysDaySurvey, recordBoysDayResponse } from '@/lib/boys-day-survey';
import { HttpError, readBytes } from '@/lib/http';
import { validate } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
};

function html(survey: BoysDaySurvey, page: Parameters<typeof boysDaySurveyHtml>[1], status = 200) {
  return new Response(boysDaySurveyHtml(survey, page), { status, headers });
}

function requireFormOrigin(request: Request) {
  const expected = env.PUBLIC_SITE_ORIGIN || new URL(request.url).origin;
  const origin = request.headers.get('origin');
  const referrer = request.headers.get('referer');
  if (origin === expected) return;
  if (!origin && (referrer?.startsWith(expected + '/') || request.headers.get('sec-fetch-site') === 'same-origin')) return;
  throw new HttpError(403, '无法确认表单来源，请重新打开填写链接。');
}

export async function GET(request: Request) {
  const submitted = new URL(request.url).searchParams.get('submitted') === '1';
  return html(await readBoysDaySurvey(), { submitted, requestKey: crypto.randomUUID() });
}

export async function POST(request: Request) {
  let fields = { name: '', pairs: '', introduction: '' };
  let requestKey = crypto.randomUUID();
  try {
    requireFormOrigin(request);
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') {
      throw new HttpError(415, '请通过问卷页面提交。');
    }
    const form = new URLSearchParams(new TextDecoder().decode(await readBytes(request, 32768)));
    const formKey = form.get('request_key') || '';
    fields = { name: form.get('name') || '', pairs: form.get('pairs') || '', introduction: form.get('introduction') || '' };
    const answer = validate(boysDayResponseInput, { ...fields, request_key: formKey });
    requestKey = answer.request_key;
    await rateLimit(request, 'boys-day-submit', 100);
    await recordBoysDayResponse(answer);
    return new Response(null, { status: 303, headers: { ...headers, Location: `${boysDaySurveyPath}?submitted=1` } });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : '暂时无法提交，你的填写内容已保留，请重试。';
    if (status === 500) console.error('boys-day-form-submit', error instanceof Error ? error.message : 'unknown');
    return html(await readBoysDaySurvey(), { fields, requestKey: status === 409 ? crypto.randomUUID() : requestKey, error: message }, status);
  }
}
