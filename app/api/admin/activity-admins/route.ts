import { z } from 'zod';
import { requireAdministrator } from '@/lib/administrator';
import { database } from '@/lib/data';
import { fail,HttpError,json,readJson } from '@/lib/http';
import { validate } from '@/lib/validation';
import { auditStatement,guardedWrite } from '@/lib/activity-writes';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await requireAdministrator(request);const rows=(await database().prepare("SELECT r.name,r.student_id,r.enabled,a.id AS account_id,a.status AS account_status,COALESCE(g.enabled,0) AS granted,COALESCE(g.version,0) AS version FROM class_roster r LEFT JOIN student_accounts a ON a.student_id=r.student_id LEFT JOIN activity_admin_grants g ON g.account_id=a.id ORDER BY r.student_id").all<any>()).results;return json({members:rows})}catch(e){return fail(e)}}
export async function POST(request:Request){try{
 await requireAdministrator(request);const p=validate(z.object({account_id:z.string().uuid(),enabled:z.boolean(),expected_version:z.number().int().min(0)}).strict(),await readJson(request)),db=database();
 const account=await db.prepare('SELECT a.id,a.status,r.enabled FROM student_accounts a JOIN class_roster r ON r.student_id=a.student_id WHERE a.id=?').bind(p.account_id).first<any>();if(!account||p.enabled&&(!account.enabled||account.status!=='active'))throw new HttpError(400,'只能向已激活、已启用的本班账号授权。');
 const old=await db.prepare('SELECT * FROM activity_admin_grants WHERE account_id=?').bind(p.account_id).first<any>();if((old?.version??0)!==p.expected_version)throw new HttpError(409,'授权状态已更新，请刷新后重试。');
 const now=new Date().toISOString();await guardedWrite('primary',[{table:'activity_admin_grants',id:p.account_id,version:old?.version??null}],[db.prepare('INSERT INTO activity_admin_grants(account_id,enabled,version,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET enabled=excluded.enabled,version=excluded.version,updated_at=excluded.updated_at').bind(p.account_id,Number(p.enabled),(old?.version??0)+1,now,now),auditStatement('primary',p.enabled?'admin.grant':'admin.revoke',p.account_id,old,{enabled:p.enabled})],p.enabled?[{sql:"EXISTS(SELECT 1 FROM student_accounts a JOIN class_roster r ON r.student_id=a.student_id WHERE a.id=? AND a.status='active' AND r.enabled=1)",params:[p.account_id]}]:[]);
 return json({ok:true});
}catch(e){return fail(e)}}
