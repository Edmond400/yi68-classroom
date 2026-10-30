import { z } from 'zod';
import { database } from '@/lib/data';
import { fail,HttpError,json,readJson } from '@/lib/http';
import { digest,hashPassword,randomToken,verifyPassword } from '@/lib/passwords';
import { adminCookie,adminCookieToken,administratorConfigured,createAdministratorSession,rateLimit,requireAdministrator,setupTokenHash } from '@/lib/administrator';
import { validate } from '@/lib/validation';
export const dynamic='force-dynamic';
const password=z.string().min(12,'管理员密码至少12位。').max(128,'密码最多128位。');
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('setup'),code:z.string().min(20).max(200),password}).strict(),
 z.object({action:z.literal('login'),username:z.string().trim().min(1).max(40),password:z.string().min(1).max(128)}).strict(),
 z.object({action:z.literal('logout')}).strict(),
 z.object({action:z.literal('change_password'),current_password:z.string().min(1).max(128),password}).strict(),
]);
export async function POST(request:Request){try{
 const p=validate(schema,await readJson(request)),db=database();
 if(p.action==='logout'){
  const token=adminCookieToken(request.headers.get('cookie')||'');
  if(token)await db.prepare('DELETE FROM administrator_sessions WHERE token_hash=?').bind(digest(token)).run();
  return adminCookie(json({ok:true}));
 }
 if(p.action==='setup'){
  await rateLimit(request,'admin-setup',15);
  if(await administratorConfigured())throw new HttpError(409,'管理员已经初始化，请使用账号密码登录。');
  const expected=setupTokenHash();if(!expected||digest(p.code)!==expected)throw new HttpError(403,'初始化码不正确。');
  const hash=await hashPassword(p.password);
  const result=await db.prepare("INSERT OR IGNORE INTO administrator (id,username,password_hash,credential_version,updated_at) VALUES ('primary','admin',?,?,?)").bind(hash,randomToken(),new Date().toISOString()).run();
  if(!result.meta.changes)throw new HttpError(409,'管理员已经初始化，请登录。');
  return createAdministratorSession(hash);
 }
 if(p.action==='login'){
  await rateLimit(request,'admin-login',30);
  const a=await db.prepare("SELECT username,password_hash FROM administrator WHERE id='primary'").first<{username:string;password_hash:string}>();
  const dummy='scrypt$16384$8$5$'+'0'.repeat(32)+'$'+'0'.repeat(64);
  const correct=await verifyPassword(p.password,a?.password_hash||dummy);
  if(!a||p.username!==a.username||!correct)throw new HttpError(401,'管理员用户名或密码不正确。');
  return createAdministratorSession(a.password_hash);
 }
 const admin=await requireAdministrator(request);await rateLimit(request,'admin-password',20);
 const old=await db.prepare('SELECT password_hash FROM administrator WHERE id=? AND credential_version=?').bind(admin.id,admin.credential_version).first<{password_hash:string}>();
 if(!old||!await verifyPassword(p.current_password,old.password_hash))throw new HttpError(400,'当前密码不正确。');
 const hash=await hashPassword(p.password);
 const changed=await db.prepare('UPDATE administrator SET password_hash=?,credential_version=?,updated_at=? WHERE id=? AND password_hash=?').bind(hash,randomToken(),new Date().toISOString(),admin.id,old.password_hash).run();
 if(!changed.meta.changes)throw new HttpError(409,'账号状态已更新，请重新登录。');
 await db.prepare('DELETE FROM administrator_sessions WHERE admin_id=?').bind(admin.id).run();
 return adminCookie(json({ok:true}));
}catch(error){return fail(error)}}
