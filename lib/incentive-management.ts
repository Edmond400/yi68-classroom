import { z } from 'zod';
import type { ActivityManager } from '@/lib/activity-management-auth';
import { issueReset } from '@/lib/accounts';
import { database } from '@/lib/data';
import { digest,randomToken } from '@/lib/passwords';
import { fail,HttpError,json,readJson } from '@/lib/http';
import { audit,cancelActivity,config,ensurePeriods,key,kindSchema,members,records,reviewClaim,runDueSettlements,saveActivity,saveTask,studentIdSchema } from '@/lib/incentives';
import {registerPrizeDelivery} from '@/lib/prize-delivery';
import { validate } from '@/lib/validation';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('roster'),members:z.array(z.object({student_id:studentIdSchema,name:z.string().trim().min(2).max(50),is_committee:z.boolean()}).strict()).min(1).max(200)}).strict(),
 z.object({action:z.literal('member'),student_id:studentIdSchema,is_committee:z.boolean(),enabled:z.boolean()}).strict(),
 z.object({action:z.literal('activation'),student_id:studentIdSchema}).strict(),
 z.object({action:z.literal('reset'),account_id:z.string().uuid()}).strict(),
 z.object({action:z.literal('task'),id:key,title:z.string().trim().min(1).max(150),kind:kindSchema,expected_version:z.number().int().min(0).optional()}).strict(),
 z.object({action:z.literal('activity'),id:key,task_id:key,occurred_at:z.string().max(40),content:z.string().trim().min(1).max(3000),participants:z.array(studentIdSchema).max(200),duty_ids:z.array(studentIdSchema).max(200),roles:z.record(z.string().max(500)).optional(),expected_version:z.number().int().min(0).optional()}).strict(),
 z.object({action:z.literal('cancel'),id:key,expected_version:z.number().int().min(0).optional()}).strict(),
 z.object({action:z.literal('review'),id:key,decision:z.enum(['approved','rejected']),task_id:key.optional(),duty:z.boolean(),resolution:z.string().max(2000),expected_version:z.number().int().min(0).optional(),expected_activity_version:z.number().int().min(0).optional()}).strict(),
 z.object({action:z.literal('config'),semester_label:z.string().trim().min(1).max(100),semester_start:z.string().max(40),semester_end:z.string().max(40)}).strict(),
 z.object({action:z.literal('delivery'),period_id:key,student_id:studentIdSchema,delivered:z.boolean()}).strict(),
]);
export async function readManagement(actor:ActivityManager){
 await runDueSettlements();const db=database();
 const roster=await members(),rows=await records(),tasks=(await db.prepare('SELECT * FROM incentive_tasks ORDER BY created_at DESC').all()).results,activities=(await db.prepare('SELECT a.*,t.title,t.kind FROM incentive_activities a JOIN incentive_tasks t ON t.id=a.task_id ORDER BY occurred_at DESC').all()).results;
 const claims=(await db.prepare("SELECT c.*,r.name,a.version AS activity_version FROM incentive_claims c JOIN class_roster r ON r.student_id=c.student_id LEFT JOIN incentive_activities a ON a.id=COALESCE(c.activity_id,'claim-'||c.id) ORDER BY c.created_at DESC").all()).results;
 const periods=(await db.prepare('SELECT * FROM incentive_periods ORDER BY ends_at DESC').all<any>()).results;
 const auditRows=(await db.prepare("SELECT x.*,CASE WHEN x.actor='primary' THEN '主管理员 admin' ELSE COALESCE(r.name,x.actor) END AS actor_name FROM incentive_audit x LEFT JOIN student_accounts s ON x.actor='student:'||s.id LEFT JOIN class_roster r ON r.student_id=s.student_id "+(actor.primary?"":"WHERE x.action IN ('task.save','activity.save','activity.cancel','claim.approve','claim.reject') ")+"ORDER BY x.created_at DESC LIMIT 100").all()).results;
 return json({viewer:actor,members:actor.primary?roster:roster.map(m=>({student_id:m.student_id,name:m.name,enabled:m.enabled,is_committee:m.is_committee})),records:rows,tasks,activities,claims,periods:actor.primary?periods:periods.map(p=>({id:p.id,kind:p.kind,label:p.label,starts_at:p.starts_at,ends_at:p.ends_at,quota:p.quota,delivery_json:'{}',result_json:p.result_json?JSON.stringify({snapshot:JSON.parse(p.result_json).snapshot}):null})),audit:auditRows,config:await config(),...(actor.primary?{scheduler_last_success:(await db.prepare("SELECT value FROM settings WHERE key='incentive_cron_last_success'").first<{value:string}>())?.value??null}:{})});
}
export async function writeManagement(request:Request,identity:ActivityManager){try{
 const actor=identity.id,p=validate(schema,await readJson(request)),db=database(),now=new Date().toISOString();
 if(!identity.primary&&!['task','activity','cancel','review'].includes(p.action))throw new HttpError(403,'普通管理员仅可管理活动、审核他人申报和查看活动统计。');
 if(['task','activity','cancel','review'].includes(p.action)){
  const target=p as any,table=p.action==='task'?'incentive_tasks':p.action==='review'?'incentive_claims':'incentive_activities';
  if(await db.prepare('SELECT id FROM '+table+' WHERE id=?').bind(target.id).first() && target.expected_version===undefined)throw new HttpError(409,'请刷新管理页面后再编辑，避免覆盖其他管理员的修改。');
  if(p.action==='review'&&p.decision==='approved'){const c=await db.prepare("SELECT a.id FROM incentive_claims c JOIN incentive_activities a ON a.id=COALESCE(c.activity_id,'claim-'||c.id) WHERE c.id=?").bind(p.id).first();if(c&&p.expected_activity_version===undefined)throw new HttpError(409,'活动记录已更新，请刷新申报列表后重新核实。');}
 }
 await runDueSettlements();
 if(p.action==='roster'){if(new Set(p.members.map(m=>m.student_id)).size!==p.members.length)throw new HttpError(400,'名册中有重复学号。');const ops=p.members.flatMap(m=>[db.prepare('INSERT INTO class_roster(student_id,name,enabled) VALUES (?,?,1) ON CONFLICT(student_id) DO UPDATE SET name=excluded.name').bind(m.student_id,m.name),db.prepare('INSERT INTO incentive_members VALUES (?,?) ON CONFLICT(student_id) DO UPDATE SET is_committee=excluded.is_committee').bind(m.student_id,Number(m.is_committee))]);await db.batch(ops);await audit(actor,'roster.import','roster',null,p.members);}
 else if(p.action==='member'){const old=await db.prepare('SELECT * FROM class_roster WHERE student_id=?').bind(p.student_id).first();if(!old)throw new HttpError(404,'成员不存在。');await db.batch([db.prepare('UPDATE class_roster SET enabled=? WHERE student_id=?').bind(Number(p.enabled),p.student_id),db.prepare('UPDATE student_accounts SET status=?,updated_at=? WHERE student_id=?').bind(p.enabled?'active':'revoked',now,p.student_id),db.prepare('INSERT INTO incentive_members VALUES (?,?) ON CONFLICT(student_id) DO UPDATE SET is_committee=excluded.is_committee').bind(p.student_id,Number(p.is_committee)),db.prepare('DELETE FROM student_sessions WHERE account_id IN (SELECT id FROM student_accounts WHERE student_id=?)').bind(p.student_id)]);await audit(actor,'member.update',p.student_id,old,p);}
 else if(p.action==='activation'){if(!await db.prepare('SELECT student_id FROM class_roster WHERE student_id=? AND enabled=1').bind(p.student_id).first())throw new HttpError(404,'请先导入并启用该成员。');if(await db.prepare('SELECT id FROM student_accounts WHERE student_id=?').bind(p.student_id).first())throw new HttpError(409,'此账号已经激活，请使用密码重置。');const code=randomToken(),expires_at=Date.now()+7*86400000;await db.prepare('INSERT INTO incentive_activations VALUES (?,?,?) ON CONFLICT(student_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at').bind(p.student_id,digest(code),expires_at).run();await audit(actor,'activation.issue',p.student_id,null,{expires_at});return json({ok:true,code,expires_at});}
 else if(p.action==='reset'){await audit(actor,'reset.issue',p.account_id,null,{});return json({ok:true,...await issueReset(p.account_id)});}
 else if(p.action==='task')await saveTask(p,actor);
 else if(p.action==='activity')await saveActivity(p,actor);
 else if(p.action==='cancel')await cancelActivity(p.id,actor,p.expected_version);
 else if(p.action==='review')await reviewClaim(p.id,p.decision,p.task_id,p.duty,p.resolution,actor,p.expected_version,p.expected_activity_version);
 else if(p.action==='config'){const old=await config(),start=new Date(p.semester_start),end=new Date(p.semester_end);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end.getTime()<=Date.now())throw new HttpError(400,'学期起止时间无效。');const period=await db.prepare('SELECT result_json FROM incentive_periods WHERE id=?').bind(old.semester_id).first<{result_json:string|null}>();if(period?.result_json)throw new HttpError(409,'学期结果已经公布，不能更改统计范围。');const value={...old,semester_label:p.semester_label,semester_start:start.toISOString(),semester_end:end.toISOString()};await db.batch([db.prepare("UPDATE settings SET value=? WHERE key='incentive_config_v1' AND NOT EXISTS(SELECT 1 FROM incentive_periods WHERE id=? AND result_json IS NOT NULL)").bind(JSON.stringify(value),old.semester_id),db.prepare('UPDATE incentive_periods SET label=?,starts_at=?,ends_at=? WHERE id=? AND result_json IS NULL').bind(value.semester_label,value.semester_start,value.semester_end,old.semester_id)]);await audit(actor,'semester.configure',old.semester_id,old,value);}
 else if(p.action==='delivery')await registerPrizeDelivery(p.period_id,p.student_id,p.delivered,actor);
 return json({ok:true});
}catch(e){if(e instanceof Error&&e.message.includes('nickname_roster_name_conflict'))return fail(new HttpError(409,'名册姓名与其他同学的昵称重复，请先请该同学更改昵称再保存名册。'));return fail(e)}}
