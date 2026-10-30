import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { database } from './data';
import { digest, randomToken } from './passwords';
import { HttpError, json } from './http';
export const ADMIN_COOKIE = '__Host-yi68_admin';
const SESSION_SECONDS = 12 * 3600;
export type Administrator = { id:string; username:string; credential_version:string };
export function adminCookieToken(cookie:string) {
 const value=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(ADMIN_COOKIE+'='))?.slice(ADMIN_COOKIE.length+1);
 return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export async function getAdministrator(request?:Request):Promise<Administrator|null> {
 const cookie=request?request.headers.get('cookie'):(await headers()).get('cookie');
 const token=adminCookieToken(cookie||'');
 if(!token)return null;
 return database().prepare('SELECT a.id,a.username,a.credential_version FROM administrator_sessions s JOIN administrator a ON a.id=s.admin_id AND a.credential_version=s.credential_version WHERE s.token_hash=? AND s.expires_at>?').bind(digest(token),Date.now()).first<Administrator>();
}
export async function requireAdministrator(request?:Request) {
 const admin=await getAdministrator(request);if(!admin)throw new HttpError(401,'请先登录管理员账号。');return admin;
}
export async function administratorConfigured(){return !!await database().prepare("SELECT id FROM administrator WHERE id='primary'").first();}
export async function rateLimit(request:Request,scope:string,limit:number,seconds=900){
 const now=Date.now(),window=Math.floor(now/(seconds*1000));
 const address=request.headers.get('cf-connecting-ip')||'shared';
 const key=digest(scope+':'+address+':'+window),db=database();
 const count=await db.prepare('INSERT INTO auth_attempts (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(key,(window+1)*seconds*1000).first<{hits:number}>();
 if(!count||count.hits>limit)throw new HttpError(429,'提交或尝试次数较多，请稍后再试。');
 await db.prepare('DELETE FROM auth_attempts WHERE expires_at<?').bind(now).run();
}
export function adminCookie(response:Response,token='',seconds=0){response.headers.set('Set-Cookie',`${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`);return response;}
export async function createAdministratorSession(expectedHash:string){
 const db=database(),token=randomToken();
 const inserted=await db.prepare("INSERT INTO administrator_sessions (token_hash,admin_id,credential_version,expires_at) SELECT ?,id,credential_version,? FROM administrator WHERE id='primary' AND password_hash=?").bind(digest(token),Date.now()+SESSION_SECONDS*1000,expectedHash).run();
 if(!inserted.meta.changes)throw new HttpError(401,'账号已更新，请重新登录。');
 await db.prepare('DELETE FROM administrator_sessions WHERE expires_at<?').bind(Date.now()).run();
 return adminCookie(json({ok:true}),token,SESSION_SECONDS);
}
export function setupTokenHash(){return env.ADMIN_BOOTSTRAP_TOKEN_HASH;}
