import { z } from 'zod';
import { database } from '@/lib/data';
import { accountName,getStudent,password,seedRoster,signIn,signOut,signedOut,studentId,throttle } from '@/lib/accounts';
import { digest,hashPassword,verifyPassword } from '@/lib/passwords';
import { fail,HttpError,json,readJson } from '@/lib/http';
import { validate } from '@/lib/validation';
export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('login'),name:accountName.optional(),student_id:studentId.optional(),password:z.string().min(4).max(128)}).strict(),
 z.object({action:z.literal('register'),student_id:studentId.optional(),name:accountName,activation_code:z.string().regex(/^[a-f0-9]{64}$/),password}).strict(),
 z.object({action:z.literal('logout')}).strict(),
 z.object({action:z.literal('reset'),token:z.string().regex(/^[a-f0-9]{64}$/),password}).strict(),
 z.object({action:z.literal('change'),current_password:z.string().min(1).max(128),password}).strict(),
]);
export async function GET(request:Request){try{return json({student:await getStudent(request),registration_enabled:true})}catch(e){return fail(e)}}
export async function POST(request:Request){try{
 const raw=await readJson(request);if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpError(400,'提交格式有误。');if(raw.action==='claim_admin'||raw.action==='register'&&!raw.activation_code)throw new HttpError(403,'首次激活需要本人一次性激活码；学生账号不授予管理员权限。');
 const p=validate(schema,raw),db=database();if(p.action==='logout')return signOut(request);
 await throttle(request,'student-'+p.action,p.action==='login'||p.action==='register'?p.name??p.student_id??'missing':p.action==='reset'?digest(p.token):'change');
 const now=new Date().toISOString();
 if(p.action==='login'){
  if(!p.name&&!p.student_id)throw new HttpError(400,'请填写姓名。');
  const matches=(await db.prepare("SELECT a.id,a.password_hash FROM student_accounts a JOIN class_roster r ON r.student_id=a.student_id WHERE "+(p.name?'r.name=?':'a.student_id=?')+" AND a.status='active' AND r.enabled=1").bind(p.name??p.student_id!).all<{id:string;password_hash:string}>()).results;
  const a=matches.length===1?matches[0]:undefined,correct=await verifyPassword(p.password,a?.password_hash||'scrypt$16384$8$5$'+'0'.repeat(32)+'$'+'0'.repeat(64));if(matches.length>1)throw new HttpError(409,'该姓名暂无法唯一匹配，请联系班长核对名册姓名。');if(!a||!correct)throw new HttpError(401,'姓名或密码不正确，或账号尚未激活。');return signIn(a.id,a.password_hash);
 }
 if(p.action==='register'){
  await seedRoster();const hash=digest(p.activation_code),a=await db.prepare('SELECT r.student_id,r.name FROM class_roster r JOIN incentive_activations x ON x.student_id=r.student_id WHERE r.name=? AND r.enabled=1 AND x.token_hash=? AND x.expires_at>?').bind(p.name,hash,Date.now()).first<{student_id:string;name:string}>();if(!a||p.student_id&&a.student_id!==p.student_id)throw new HttpError(403,'姓名或激活码不匹配，或激活码已过期。');
  const duplicates=await db.prepare('SELECT count(*) AS n FROM class_roster WHERE name=? AND enabled=1').bind(p.name).first<{n:number}>();if(duplicates&&duplicates.n>1)throw new HttpError(409,'名册存在同名，请联系班长设置可区分的姓名后再激活。');
  const passwordHash=await hashPassword(p.password),id=crypto.randomUUID();
  await db.batch([db.prepare("INSERT OR IGNORE INTO student_accounts(id,student_id,password_hash,status,role,created_at,updated_at) SELECT ?,r.student_id,?,'active','student',?,? FROM class_roster r JOIN incentive_activations x ON x.student_id=r.student_id WHERE r.student_id=? AND r.enabled=1 AND x.token_hash=? AND x.expires_at>?").bind(id,passwordHash,now,now,a.student_id,hash,Date.now()),db.prepare('DELETE FROM incentive_activations WHERE student_id=? AND EXISTS(SELECT 1 FROM student_accounts WHERE id=?)').bind(a.student_id,id)]);
  const saved=await db.prepare('SELECT id FROM student_accounts WHERE student_id=?').bind(a.student_id).first<{id:string}>();if(saved?.id!==id)throw new HttpError(409,'账号已被激活或激活码状态改变，请登录或联系班长。');return signIn(id,passwordHash);
 }
 if(p.action==='reset'){
  const tokenHash=digest(p.token),token=await db.prepare('SELECT account_id FROM password_reset_tokens WHERE token_hash=? AND expires_at>?').bind(tokenHash,Date.now()).first<{account_id:string}>();if(!token)throw new HttpError(403,'重置码无效或已过期。');const passwordHash=await hashPassword(p.password);
  const result=await db.batch([db.prepare("UPDATE student_accounts SET password_hash=?,updated_at=? WHERE id=? AND status='active' AND EXISTS(SELECT 1 FROM class_roster r WHERE r.student_id=student_accounts.student_id AND r.enabled=1) AND EXISTS(SELECT 1 FROM password_reset_tokens WHERE token_hash=? AND expires_at>?)").bind(passwordHash,now,token.account_id,tokenHash,Date.now()),db.prepare('DELETE FROM student_sessions WHERE account_id=?').bind(token.account_id),db.prepare('DELETE FROM password_reset_tokens WHERE account_id=?').bind(token.account_id)]);if(!result[0].meta.changes)throw new HttpError(409,'账号或重置码已失效。');return signedOut();
 }
 const student=await getStudent(request);if(!student)throw new HttpError(401,'请先登录学生账号。');const a=await db.prepare('SELECT password_hash FROM student_accounts WHERE id=?').bind(student.id).first<{password_hash:string}>();if(!a||!await verifyPassword(p.current_password,a.password_hash))throw new HttpError(400,'当前密码不正确。');const h=await hashPassword(p.password);const result=await db.batch([db.prepare('UPDATE student_accounts SET password_hash=?,updated_at=? WHERE id=? AND password_hash=?').bind(h,now,student.id,a.password_hash),db.prepare('DELETE FROM student_sessions WHERE account_id=?').bind(student.id),db.prepare('DELETE FROM password_reset_tokens WHERE account_id=?').bind(student.id)]);if(!result[0].meta.changes)throw new HttpError(409,'密码状态已改变，请重新登录。');return signedOut();
}catch(e){return fail(e)}}
