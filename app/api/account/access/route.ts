import { POST as accountPost } from '../route';
import { HttpError, readBytes, sameOrigin } from '@/lib/http';
export const dynamic = 'force-dynamic';

function redirect(code?: string, mode = 'login', cookie?: string | null) {
  const query = new URLSearchParams(code
    ? { account_error: code, ...(mode === 'register' ? { account_mode: 'register' } : {}) }
    : { account_check: '1' });
  const headers = new Headers({
    Location: '/participation?' + query,
    'Cache-Control': 'private, no-store',
    Vary: 'Cookie',
    'X-Content-Type-Options': 'nosniff',
  });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

// Standard form POST for WeChat and other embedded browsers. Reuse the same
// account verifier, rate limits and session cookies as the JSON API.
export async function POST(request: Request) {
  let mode = 'login';
  try {
    try { sameOrigin(request); } catch { return redirect('source'); }
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') return redirect('invalid');
    const form = new URLSearchParams(new TextDecoder().decode(await readBytes(request, 4096)));
    const allowed = new Set(['action', 'name', 'password', 'activation_code']);
    for (const key of form.keys()) if (!allowed.has(key) || form.getAll(key).length !== 1) return redirect('invalid');
    const action = form.get('action');
    if (action !== 'login' && action !== 'register') return redirect('invalid');
    mode = action;
    const body = Object.fromEntries(form);
    body.name = body.name?.trim();
    if (body.activation_code) body.activation_code = body.activation_code.trim();
    const headers = new Headers(request.headers);
    headers.set('Content-Type', 'application/json');
    headers.delete('Content-Length');
    const response = await accountPost(new Request(new URL('/api/account', request.url), {
      method: 'POST', headers, body: JSON.stringify(body),
    }));
    if (!response.ok) {
      const code: Record<number, string> = { 400: 'invalid', 401: 'credentials', 403: 'activation', 409: 'conflict', 429: 'throttled' };
      return redirect(code[response.status] || 'unavailable', mode);
    }
    const cookie = response.headers.get('Set-Cookie');
    if (!cookie) return redirect('unavailable', mode);
    return redirect(undefined, mode, cookie);
  } catch (error) {
    return redirect(error instanceof HttpError && error.status < 500 ? 'invalid' : 'unavailable', mode);
  }
}
