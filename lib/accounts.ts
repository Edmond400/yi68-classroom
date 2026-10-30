import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { z } from 'zod';
import { database } from './data';
import { HttpError, json } from './http';
import { digest, randomToken } from './passwords';

export const SESSION_COOKIE = '__Host-yi68_session';
export const SESSION_SECONDS = 7 * 86400;
export type Student = { id: string; student_id: string; name: string; role: string };
export type AccountRecord = { student_id: string; name: string; enabled: number; id: string | null; status: string | null; role: string | null; created_at: string | null };
export const accountName = z.string().trim().min(2, '请填写名册中的完整姓名。').max(50);
export const studentId = z.string().trim().regex(/^\d{10}$/, '请填写10位学号。');
export const password = z.string().min(4, '密码至少4位。').max(128, '密码最多128位。');
const rosterSchema = z.array(z.object({ name: accountName, student_id: studentId }).strict()).min(1).max(200);

export async function seedRoster() {
  if (!env.CLASS_ROSTER_JSON) return;
  const db = database(), revision = digest(env.CLASS_ROSTER_JSON);
  const marker = await db.prepare("SELECT value FROM settings WHERE key='roster_revision'").first<{ value: string }>();
  if (marker?.value === revision) return;
  const rows = rosterSchema.parse(JSON.parse(env.CLASS_ROSTER_JSON));
  if (new Set(rows.map(r => r.student_id)).size !== rows.length) throw new Error('Invalid roster configuration');
  await db.batch([
    ...rows.map(r => db.prepare('INSERT INTO class_roster (student_id,name,enabled) VALUES (?,?,1) ON CONFLICT(student_id) DO UPDATE SET name=excluded.name').bind(r.student_id, r.name)),
    db.prepare("INSERT INTO settings (key,value) VALUES ('roster_revision',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(revision),
  ]);
}
function cookieToken(cookie: string) {
  const value = cookie.split(';').map(v => v.trim()).find(v => v.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export async function getStudent(request?: Request): Promise<Student | null> {
  const cookie = request ? request.headers.get('cookie') : (await headers()).get('cookie');
  const token = cookieToken(cookie || '');
  if (!token) return null;
  return database().prepare("SELECT a.id,a.student_id,a.role,r.name FROM student_sessions s JOIN student_accounts a ON a.id=s.account_id JOIN class_roster r ON r.student_id=a.student_id WHERE s.token_hash=? AND s.expires_at>? AND a.status='active' AND r.enabled=1").bind(digest(token), Date.now()).first<Student>();
}
export async function requireStudent(request: Request) {
  const student = await getStudent(request);
  if (!student) throw new HttpError(401, '请使用班级账号登录后提交。');
  return student;
}
export async function throttle(request: Request, action: string, identity: string) {
  const db = database(), now = Date.now(), window = Math.floor(now / 900000);
  // Only trust the edge-provided client address; a shared bucket is safe when absent.
  const address = request.headers.get('cf-connecting-ip') || 'shared';
  for (const [key, limit] of [[action + ':ip:' + address, 100], [action + ':account:' + identity, 10]] as const) {
    const value = await db.prepare('INSERT INTO auth_attempts (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(digest(key + ':' + window), (window + 1) * 900000).first<{ hits: number }>();
    if (!value || value.hits > limit) throw new HttpError(429, '尝试次数较多，请15分钟后再试。');
  }
  await db.prepare('DELETE FROM auth_attempts WHERE expires_at<?').bind(now).run();
}
function withCookie(response: Response, token: string, maxAge: number) {
  response.headers.set('Set-Cookie', SESSION_COOKIE + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge);
  return response;
}
export const signedOut = () => withCookie(json({ ok: true }), '', 0);
export async function signIn(accountId: string, expectedHash: string) {
  const token = randomToken(), db = database(), now = Date.now();
  const result = await db.prepare("INSERT INTO student_sessions (token_hash,account_id,expires_at) SELECT ?,a.id,? FROM student_accounts a JOIN class_roster r ON r.student_id=a.student_id WHERE a.id=? AND a.password_hash=? AND a.status='active' AND r.enabled=1").bind(digest(token), now + SESSION_SECONDS * 1000, accountId, expectedHash).run();
  if (!result.meta.changes) throw new HttpError(401, '账号状态已更新，请重新登录。');
  await db.prepare('DELETE FROM student_sessions WHERE expires_at<?').bind(now).run();
  return withCookie(json({ ok: true }), token, SESSION_SECONDS);
}
export async function signOut(request: Request) {
  const token = cookieToken(request.headers.get('cookie') || '');
  if (token) await database().prepare('DELETE FROM student_sessions WHERE token_hash=?').bind(digest(token)).run();
  return signedOut();
}
export async function accountRecords() {
  await seedRoster();
  const r = await database().prepare('SELECT r.student_id,r.name,r.enabled,a.id,a.status,a.role,a.created_at FROM class_roster r LEFT JOIN student_accounts a ON a.student_id=r.student_id ORDER BY r.student_id').all<AccountRecord>();
  return r.results;
}
export async function issueReset(accountId: string) {
  const db = database(), token = randomToken(), expiresAt = Date.now() + 30 * 60000;
  if (!await db.prepare("SELECT id FROM student_accounts WHERE id=? AND status='active'").bind(accountId).first()) throw new HttpError(400, '请先启用该账号。');
  await db.batch([
    db.prepare('DELETE FROM password_reset_tokens WHERE account_id=? OR expires_at<?').bind(accountId, Date.now()),
    db.prepare('INSERT INTO password_reset_tokens (token_hash,account_id,expires_at) VALUES (?,?,?)').bind(digest(token), accountId, expiresAt),
  ]);
  return { token, expiresAt };
}
