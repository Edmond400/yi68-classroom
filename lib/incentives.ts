import { z } from 'zod';
import { database } from './data';
import { digest } from './passwords';
import { displayedReward,frozenName } from './reward-display';
import { HttpError } from './http';
import { managerStudentId } from './activity-management-auth';
import { auditStatement,checkVersion,guardedWrite,type VersionCheck } from './activity-writes';
import { awardMonthFor,beijingDay,defaultConfig,FIRST_START,monthEnd,nextMonth,previousMonth,RULE_VERSION,selectReward,type IncentiveConfig,type RewardPeriod,type RankedMember } from './incentive-rules';
export {type RewardPeriod} from './incentive-rules';
import {COFFEE_COUPON,SEMESTER_KEEPSAKE,MONTHLY_RULE_VERSION,configuredSemester,monthlyEligibility,overlapsSemester,prizeFor} from './monthly-reward-policy';
export const key=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const studentIdSchema=z.string().regex(/^\d{10}$/);
export const kindSchema=z.enum(['general','public_account']);
export function actualTime(value:string,now=Date.now()){const date=new Date(value);if(!Number.isFinite(date.getTime())||date.getTime()<Date.parse(FIRST_START)||date.getTime()>now)throw new HttpError(400,'请选择2026年10月1日至今的实际参与时间。');return date.toISOString()}
export async function config():Promise<IncentiveConfig>{const r=await database().prepare("SELECT value FROM settings WHERE key='incentive_config_v1'").first<{value:string}>();return r?JSON.parse(r.value):defaultConfig}
export async function ensurePeriods(now=new Date()){
 const db=database(),c=await config(),existing=await db.prepare('SELECT id FROM incentive_periods').all<{id:string}>(),ids=new Set(existing.results.map(r=>r.id)),ops:D1PreparedStatement[]=[];
 const last=nextMonth(beijingDay(now).slice(0,7));let month=c.first_month;
 for(let i=0;i<240&&month<=last;i++,month=nextMonth(month)){const id='month-'+month;if(ids.has(id))continue;ops.push(db.prepare('INSERT OR IGNORE INTO incentive_periods(id,kind,label,starts_at,ends_at,quota) VALUES (?,?,?,?,?,3)').bind(id,'month',month+'月度感谢',month===c.first_month?FIRST_START:monthEnd(previousMonth(month)),monthEnd(month)))}
 if(!ids.has(c.semester_id))ops.push(db.prepare('INSERT OR IGNORE INTO incentive_periods(id,kind,label,starts_at,ends_at,quota) VALUES (?,?,?,?,?,10)').bind(c.semester_id,'semester',c.semester_label,c.semester_start,c.semester_end));
 if(ops.length)await db.batch(ops);return c;
}
export async function audit(actor:string,action:string,target:string,before:unknown,after:unknown){await database().prepare('INSERT INTO incentive_audit VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,JSON.stringify(before??null),JSON.stringify(after??null),new Date().toISOString()).run()}
export async function members(){return (await database().prepare('SELECT r.student_id,r.name,r.enabled,COALESCE(m.is_committee,0) AS is_committee,a.id AS account_id,a.status AS account_status FROM class_roster r LEFT JOIN incentive_members m ON m.student_id=r.student_id LEFT JOIN student_accounts a ON a.student_id=r.student_id ORDER BY r.student_id').all<any>()).results}
export async function records(student_id?:string){return (await database().prepare(`SELECT p.*,r.name,a.task_id,a.occurred_at,a.content,a.state AS activity_state,t.title AS task_title,t.kind,c.participation_id AS counted,c.award_month,c.day FROM incentive_participations p JOIN class_roster r ON r.student_id=p.student_id JOIN incentive_activities a ON a.id=p.activity_id JOIN incentive_tasks t ON t.id=a.task_id LEFT JOIN incentive_counts c ON c.participation_id=p.id ${student_id?'WHERE p.student_id=?':''} ORDER BY a.occurred_at DESC,p.id`).bind(...(student_id?[student_id]:[])).all<any>()).results}
export function recordReason(r:any){if(r.status!=='approved'||r.activity_state!=='active')return '已作废，不计奖';if(r.duty)return '本职组织活动，保留记录、不计奖';if(!r.counted)return r.kind==='public_account'?'该篇推文已达两次上限，或同日已计次':'同任务同日已有计次';return '已计入'+r.award_month+'期'}
function releaseCount(id:string){return database().prepare("DELETE FROM incentive_counts WHERE participation_id=? AND NOT EXISTS(SELECT 1 FROM incentive_periods x,json_each(x.result_json,'$.records') j WHERE x.result_json IS NOT NULL AND j.value=incentive_counts.participation_id)").bind(id)}
function countStatement(id:string,now:string,month:string){return database().prepare(`INSERT OR IGNORE INTO incentive_counts(participation_id,task_id,student_id,day,award_month,created_at)
 SELECT p.id,a.task_id,p.student_id,substr(datetime(a.occurred_at,'+8 hours'),1,10),?,? FROM incentive_participations p JOIN incentive_activities a ON a.id=p.activity_id JOIN incentive_tasks t ON t.id=a.task_id JOIN class_roster r ON r.student_id=p.student_id
 WHERE p.id=? AND p.status='approved' AND p.duty=0 AND a.state='active' AND r.enabled=1 AND (t.kind!='public_account' OR (SELECT count(*) FROM incentive_counts c WHERE c.task_id=a.task_id AND c.student_id=p.student_id)<2)`).bind(month,now,id)}
async function countFor(id:string,occurred:string,approved:string){const creditedAt=new Date().toISOString(),month=awardMonthFor(occurred,creditedAt>approved?creditedAt:approved,(await config()).first_month);return countStatement(id,creditedAt,month)}
export async function saveTask(value:{id:string;title:string;kind:'general'|'public_account';expected_version?:number},actor:string){
 const db=database(),old=await db.prepare('SELECT * FROM incentive_tasks WHERE id=?').bind(value.id).first<any>(),self=await managerStudentId(actor);checkVersion(old,value.expected_version);
 if(old&&self&&await db.prepare('SELECT p.id FROM incentive_participations p JOIN incentive_activities a ON a.id=p.activity_id WHERE a.task_id=? AND p.student_id=? LIMIT 1').bind(value.id,self).first())throw new HttpError(403,'涉及本人参与记录的任务修改，请交由其他管理员处理。');
 const changed=old&&old.kind!==value.kind,hasRecords=changed&&await db.prepare('SELECT p.id FROM incentive_participations p JOIN incentive_activities a ON a.id=p.activity_id WHERE a.task_id=? LIMIT 1').bind(value.id).first();
 if(hasRecords)throw new HttpError(409,'已有参与记录的任务不能更改类型。请建立新的独立任务。');
 const now=new Date().toISOString();
 await guardedWrite(actor,[{table:'incentive_tasks',id:value.id,version:old?.version??null}],[db.prepare('INSERT INTO incentive_tasks(id,title,kind,created_at,updated_at,version) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,kind=excluded.kind,updated_at=excluded.updated_at,version=excluded.version').bind(value.id,value.title,value.kind,now,now,(old?.version??-1)+1),auditStatement(actor,'task.save',value.id,old,value)],changed?[{sql:'NOT EXISTS(SELECT 1 FROM incentive_participations p JOIN incentive_activities a ON a.id=p.activity_id WHERE a.task_id=?)',params:[value.id]}]:[]);
}
export async function saveActivity(value:{id:string;task_id:string;occurred_at:string;content:string;participants:string[];duty_ids:string[];roles?:Record<string,string>;expected_version?:number},actor:string){
 const db=database(),now=new Date().toISOString(),occurred=actualTime(value.occurred_at),old=await db.prepare('SELECT * FROM incentive_activities WHERE id=?').bind(value.id).first<any>(),self=await managerStudentId(actor);checkVersion(old,value.expected_version);
 const task=await db.prepare('SELECT id,version FROM incentive_tasks WHERE id=?').bind(value.task_id).first<any>();if(!task)throw new HttpError(400,'请先选择任务。');
 const roster=await members();if(value.participants.some(id=>!roster.some(m=>m.student_id===id&&m.enabled)))throw new HttpError(400,'参与者必须是已启用的名册成员。');if(value.duty_ids.some(id=>!value.participants.includes(id)||!roster.some(m=>m.student_id===id&&m.is_committee)))throw new HttpError(400,'本职组织者必须是参与此活动的班委。');
 const existing=(await db.prepare('SELECT * FROM incentive_participations WHERE activity_id=?').bind(value.id).all<any>()).results;
 if(self){const own=existing.find(p=>p.student_id===self&&p.status==='approved'),included=value.participants.includes(self);
  if((included&&!own)||(own&&(!included||own.duty!==Number(value.duty_ids.includes(self))||own.role!==(value.roles?.[self]??'')||old.state!=='active'||old.content!==value.content||old.task_id!==value.task_id||old.occurred_at!==occurred)))throw new HttpError(403,'本人的参与记录及计奖性质须由其他管理员核实；请通过个人页申报。');
 }
 if(old&&(old.task_id!==value.task_id||old.occurred_at!==occurred)&&existing.length)throw new HttpError(409,'已有参与记录的活动不能更换日期或任务；请作废错误记录并建立正确活动。');
 const ops:D1PreparedStatement[]=[db.prepare("INSERT INTO incentive_activities(id,task_id,occurred_at,content,state,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at,state='active',version=excluded.version").bind(value.id,value.task_id,occurred,value.content,'active',now,now,(old?.version??-1)+1)];
 for(const p of existing.filter(p=>p.status==='approved'&&!value.participants.includes(p.student_id))){ops.push(db.prepare("UPDATE incentive_participations SET status='void',updated_at=? WHERE id=?").bind(now,p.id),releaseCount(p.id));}
 for(const id of [...new Set(value.participants)]){
  if(id===self)continue;
  const p=existing.find(p=>p.student_id===id),pid=p?.id??crypto.randomUUID(),approved=p?.status==='approved'&&p.duty===Number(value.duty_ids.includes(id))?p.approved_at:now;
  ops.push(db.prepare("INSERT INTO incentive_participations VALUES (?,?,?,?,?,'approved',?,?,?) ON CONFLICT(activity_id,student_id) DO UPDATE SET role=excluded.role,duty=excluded.duty,status='approved',approved_at=CASE WHEN incentive_participations.status='approved' AND incentive_participations.duty=excluded.duty THEN incentive_participations.approved_at ELSE excluded.approved_at END,updated_at=excluded.updated_at").bind(pid,value.id,id,value.roles?.[id]??'',Number(value.duty_ids.includes(id)),approved,now,now));
  if(p&&p.duty!==Number(value.duty_ids.includes(id)))ops.push(releaseCount(pid));ops.push(await countFor(pid,occurred,approved));
 }
 ops.push(auditStatement(actor,'activity.save',value.id,{activity:old,participants:existing},value));
 await guardedWrite(actor,[{table:'incentive_activities',id:value.id,version:old?.version??null},{table:'incentive_tasks',id:task.id,version:task.version}],ops,[{sql:'NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN class_roster r ON r.student_id=j.value WHERE r.student_id IS NULL OR r.enabled!=1)',params:[JSON.stringify(value.participants)]},{sql:'NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN incentive_members m ON m.student_id=j.value WHERE COALESCE(m.is_committee,0)!=1)',params:[JSON.stringify(value.duty_ids)]}]);
 await rebalance(value.task_id,self);
}
export async function cancelActivity(id:string,actor:string,expectedVersion?:number){
 const db=database(),old=await db.prepare('SELECT * FROM incentive_activities WHERE id=?').bind(id).first<any>(),self=await managerStudentId(actor);if(!old)throw new HttpError(404,'活动不存在。');checkVersion(old,expectedVersion);
 const rows=(await db.prepare('SELECT id,student_id FROM incentive_participations WHERE activity_id=?').bind(id).all<{id:string;student_id:string}>()).results;
 if(self&&rows.some(r=>r.student_id===self))throw new HttpError(403,'作废此活动会影响本人的记录，请交由其他管理员处理。');
 await guardedWrite(actor,[{table:'incentive_activities',id,version:old.version}],[db.prepare("UPDATE incentive_activities SET state='cancelled',updated_at=?,version=version+1 WHERE id=?").bind(new Date().toISOString(),id),...rows.map(r=>releaseCount(r.id)),auditStatement(actor,'activity.cancel',id,old,{state:'cancelled'})]);await rebalance(old.task_id,self);
}
export async function submitClaim(student_id:string,v:{id:string;activity_id?:string;task_title:string;kind:'general'|'public_account';occurred_at:string;content:string;note:string}){
 const db=database(),now=new Date().toISOString();let occurred=actualTime(v.occurred_at),title=v.task_title,kind=v.kind,content=v.content;
 if(v.activity_id){const a=await db.prepare('SELECT a.*,t.title,t.kind FROM incentive_activities a JOIN incentive_tasks t ON t.id=a.task_id WHERE a.id=? AND a.state=\'active\'').bind(v.activity_id).first<any>();if(!a)throw new HttpError(400,'活动不存在或已取消。');occurred=a.occurred_at;title=a.title;kind=a.kind;content=a.content;}
 const fingerprint=digest((v.activity_id??title.trim())+'|'+beijingDay(occurred));
 const old=await db.prepare('SELECT id FROM incentive_claims WHERE student_id=? AND fingerprint=? AND status=\'pending\'').bind(student_id,fingerprint).first();if(old)return;
 await db.prepare("INSERT OR IGNORE INTO incentive_claims(id,student_id,activity_id,task_title,kind,occurred_at,content,note,fingerprint,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,'pending',?)").bind(v.id,student_id,v.activity_id??null,title,kind,occurred,content,v.note,fingerprint,now).run();
}
export async function reviewClaim(id:string,decision:'approved'|'rejected',task_id:string|undefined,duty:boolean,resolution:string,actor:string,expectedVersion?:number,expectedActivityVersion?:number){
 const db=database(),claim=await db.prepare('SELECT * FROM incentive_claims WHERE id=?').bind(id).first<any>(),self=await managerStudentId(actor);if(!claim)throw new HttpError(404,'申报不存在。');
 if(self===claim.student_id)throw new HttpError(403,'不能审核本人的申报，请交由其他管理员核实。');checkVersion(claim,expectedVersion);if(claim.status!=='pending')throw new HttpError(409,'这条申报已处理，请刷新。');
 const now=new Date().toISOString(),checks:VersionCheck[]=[{table:'incentive_claims',id,version:claim.version}];
 if(decision==='rejected'){await guardedWrite(actor,checks,[db.prepare("UPDATE incentive_claims SET status='rejected',resolution=?,reviewed_at=?,version=version+1 WHERE id=?").bind(resolution,now,id),auditStatement(actor,'claim.reject',id,claim,{resolution})]);return}
 const aid=claim.activity_id||'claim-'+id,old=await db.prepare('SELECT * FROM incentive_activities WHERE id=?').bind(aid).first<any>();checkVersion(old,expectedActivityVersion);
 if(!old&&!task_id)throw new HttpError(400,'请先建立并选择对应任务，再通过这条新活动申报。');
 const task=await db.prepare('SELECT id,version FROM incentive_tasks WHERE id=?').bind(old?.task_id??task_id!).first<any>();if(!task)throw new HttpError(400,'关联任务不存在。');if(old&&old.state!=='active')throw new HttpError(409,'活动已取消。');
 checks.push({table:'incentive_activities',id:aid,version:old?.version??null},{table:'incentive_tasks',id:task.id,version:task.version});
 const member=await db.prepare('SELECT r.enabled,COALESCE(m.is_committee,0) AS is_committee FROM class_roster r LEFT JOIN incentive_members m ON m.student_id=r.student_id WHERE r.student_id=?').bind(claim.student_id).first<any>();if(!member?.enabled||duty&&!member.is_committee)throw new HttpError(400,'成员已停用，或本职组织标记不适用于该同学。');
 const previous=await db.prepare('SELECT * FROM incentive_participations WHERE activity_id=? AND student_id=?').bind(aid,claim.student_id).first<any>(),pid=previous?.id??crypto.randomUUID(),dutyValue=Number(!!previous?.duty||duty),approved=previous?.status==='approved'&&previous.duty===dutyValue?previous.approved_at:now;
 const ops:D1PreparedStatement[]=[old?db.prepare('UPDATE incentive_activities SET version=version+1,updated_at=? WHERE id=?').bind(now,aid):db.prepare('INSERT INTO incentive_activities(id,task_id,occurred_at,content,state,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,1)').bind(aid,task.id,claim.occurred_at,claim.content,'active',now,now)];
 ops.push(db.prepare("INSERT INTO incentive_participations VALUES (?,?,?,?,?,'approved',?,?,?) ON CONFLICT(activity_id,student_id) DO UPDATE SET duty=MAX(incentive_participations.duty,excluded.duty),status='approved',approved_at=CASE WHEN incentive_participations.status='approved' AND incentive_participations.duty=excluded.duty THEN incentive_participations.approved_at ELSE excluded.approved_at END,updated_at=excluded.updated_at").bind(pid,aid,claim.student_id,previous?.role||claim.note.slice(0,500),dutyValue,approved,now,now),...(dutyValue?[releaseCount(pid)]:[]),await countFor(pid,old?.occurred_at??claim.occurred_at,approved),db.prepare("UPDATE incentive_claims SET status='approved',resolution=?,participation_id=(SELECT id FROM incentive_participations WHERE activity_id=? AND student_id=?),reviewed_at=?,version=version+1 WHERE id=?").bind(resolution,aid,claim.student_id,now,id),auditStatement(actor,'claim.approve',id,claim,{activity_id:aid,duty:dutyValue,resolution}));
 await guardedWrite(actor,checks,ops,[{sql:'EXISTS(SELECT 1 FROM class_roster WHERE student_id=? AND enabled=1)',params:[claim.student_id]},...(duty?[{sql:'EXISTS(SELECT 1 FROM incentive_members WHERE student_id=? AND is_committee=1)',params:[claim.student_id]}]:[])]);await rebalance(task.id,self);
}
async function rewardInputs(period:RewardPeriod,cutoff:string,inclusive=false){
 const db=database(),op=inclusive?'<=':'<';
 // Revision is read before the snapshot. Any settlement committed meanwhile
 // invalidates the write guard and forces a fresh selection for this period.
 const revision=await db.prepare("SELECT value FROM settings WHERE key='incentive_reward_revision'").first<{value:string}>();
 const configRow=await db.prepare("SELECT value FROM settings WHERE key='incentive_config_v1'").first<{value:string}>(),c:IncentiveConfig=configRow?JSON.parse(configRow.value):defaultConfig;
 const batch=await db.batch([db.prepare('SELECT r.student_id,r.name,n.nickname FROM class_roster r LEFT JOIN student_nicknames n ON n.student_id=r.student_id WHERE r.enabled=1 ORDER BY r.student_id'),db.prepare(`SELECT c.*,a.occurred_at FROM incentive_counts c JOIN incentive_participations p ON p.id=c.participation_id JOIN incentive_activities a ON a.id=p.activity_id WHERE p.status='approved' AND p.duty=0 AND a.state='active' AND p.approved_at${op}? AND c.created_at${op}? AND a.occurred_at${op}?`).bind(cutoff,cutoff,cutoff),db.prepare('SELECT * FROM incentive_periods WHERE result_json IS NOT NULL')]);
 const counts=batch[1].results as any[],past=batch[2].results as unknown as RewardPeriod[];
 const relevant=counts.filter(c=>period.kind==='month'?c.award_month===period.id.slice(6):c.occurred_at>=period.starts_at&&c.occurred_at<period.ends_at);
 const ranked=(batch[0].results as unknown as {student_id:string;name:string;nickname:string|null}[]).map(m=>({...m,count:relevant.filter(c=>c.student_id===m.student_id).length}));
 const eligibility=new Map(ranked.map(m=>[m.student_id,period.kind==='semester'?{eligible:true,reason:'可参评'}:monthlyEligibility(m.student_id,period,c,past)]));
 const eligible=ranked.filter(m=>eligibility.get(m.student_id)!.eligible);
 return {ranked,eligible,eligibility,records:relevant.map(c=>c.participation_id),config:c,configToken:configRow?.value??'null',revision:revision?.value??'0'};
}
function rewardResult(period:RewardPeriod,input:Awaited<ReturnType<typeof rewardInputs>>,selected:ReturnType<typeof selectReward>,now:Date){
 return {rule_version:period.kind==='month'?MONTHLY_RULE_VERSION:RULE_VERSION,display_version:'names-v1',period_id:period.id,scheduled_at:period.ends_at,executed_at:now.toISOString(),
 prize:period.kind==='month'?COFFEE_COUPON:SEMESTER_KEEPSAKE,
 reward_semester:period.kind==='month'&&overlapsSemester(period,configuredSemester(input.config))?configuredSemester(input.config):null,
 winners:selected.winners.map(m=>({student_id:m.student_id,...frozenName(m)})),wheel:selected.candidates.map(m=>({student_id:m.student_id,...frozenName(m)})),drawn_student_ids:selected.drawn.map(m=>m.student_id),snapshot:input.ranked,records:input.records};
}
export async function simulateReward(kind:'month'|'semester',now=new Date()){
 // Deliberately read-only: no period creation, settlement, counts, codes or audit writes.
 const db=database(),c=await config(),periods=(await db.prepare('SELECT * FROM incentive_periods ORDER BY ends_at,kind,id').all<RewardPeriod>()).results;
 let period=periods.find(p=>p.kind===kind&&!p.result_json);
 if(!period){
  if(kind==='semester'&&periods.some(p=>p.id===c.semester_id&&p.result_json))throw new HttpError(409,'本学期已经正式结算，请先配置下一学期后再模拟。');
  const month=awardMonthFor(now.toISOString(),now.toISOString(),c.first_month);
  period={id:kind==='semester'?c.semester_id:'month-'+month,kind,label:kind==='semester'?c.semester_label:month+'月度感谢',starts_at:kind==='semester'?c.semester_start:month===c.first_month?FIRST_START:monthEnd(previousMonth(month)),ends_at:kind==='semester'?c.semester_end:monthEnd(month),quota:kind==='semester'?10:3,result_json:null,published_at:null,delivery_json:'{}'};
 }
 const input=await rewardInputs(period,now.toISOString(),true),selected=selectReward(input.eligible,period.quota),result=rewardResult(period,input,selected,now),eligibleIds=new Set(input.eligible.map(m=>m.student_id)),drawnIds=new Set(selected.drawn.map(m=>m.student_id));
 return {simulation:true,as_of:now.toISOString(),period:{...publicPeriod(period),result:displayedReward(result)},draw_slots:selected.drawn.length,direct_winners:selected.winners.filter(m=>!drawnIds.has(m.student_id)).map(frozenName),stats:input.ranked.sort((a,b)=>b.count-a.count||a.student_id.localeCompare(b.student_id)).map(m=>({...frozenName(m),count:m.count,eligible:m.count>0&&eligibleIds.has(m.student_id),reason:!eligibleIds.has(m.student_id)?input.eligibility.get(m.student_id)!.reason:m.count>0?'可参评':'暂无有效参与记录'}))};
}
export async function runDueSettlements(now=new Date()){
 await ensurePeriods(now);const db=database();const due=(await db.prepare('SELECT * FROM incentive_periods WHERE result_json IS NULL AND ends_at<=? ORDER BY ends_at,kind,id').bind(now.toISOString()).all<RewardPeriod>()).results;
 for(const period of due){
  for(let attempt=0;attempt<8;attempt++){
   if((await db.prepare('SELECT result_json FROM incentive_periods WHERE id=?').bind(period.id).first<{result_json:string|null}>())?.result_json)break;
   const input=await rewardInputs(period,period.ends_at),selected=selectReward(input.eligible,period.quota),result=rewardResult(period,input,selected,now),guardId=crypto.randomUUID();
   const ops=[db.prepare(`INSERT INTO incentive_write_guards(id,allowed) SELECT ?,CASE WHEN
    EXISTS(SELECT 1 FROM settings WHERE key='incentive_reward_revision' AND value=?)
    AND COALESCE((SELECT value FROM settings WHERE key='incentive_config_v1'),'null')=?
    AND EXISTS(SELECT 1 FROM incentive_periods WHERE id=? AND result_json IS NULL AND starts_at=? AND ends_at=?)
    THEN 1 ELSE 0 END`).bind(guardId,input.revision,input.configToken,period.id,period.starts_at,period.ends_at),
    db.prepare('UPDATE incentive_periods SET result_json=?,published_at=? WHERE id=? AND result_json IS NULL').bind(JSON.stringify(result),now.toISOString(),period.id)];
   if(result.reward_semester)for(const winner of result.winners)ops.push(db.prepare('INSERT INTO incentive_monthly_awards(semester_id,student_id,period_id,awarded_at) VALUES (?,?,?,?)').bind(result.reward_semester.id,winner.student_id,period.id,now.toISOString()));
   ops.push(db.prepare('DELETE FROM incentive_write_guards WHERE id=?').bind(guardId));
   try{await db.batch(ops);break}catch(error){
    const changed=(await db.prepare("SELECT value FROM settings WHERE key='incentive_reward_revision'").first<{value:string}>())?.value!==input.revision;
    const finished=!!(await db.prepare('SELECT result_json FROM incentive_periods WHERE id=?').bind(period.id).first<{result_json:string|null}>())?.result_json;
    if(finished)break;if(changed&&attempt<7)continue;
    throw error;
   }
  }
 }
}
export function publicPeriod(p:RewardPeriod){const r=p.result_json?JSON.parse(p.result_json):null;return {id:p.id,kind:p.kind,label:p.label,starts_at:p.starts_at,ends_at:p.ends_at,quota:p.quota,published_at:p.published_at,prize:prizeFor(p.kind,r),result:r?{...displayedReward(r),prize:prizeFor(p.kind,r)}:null}}
export async function publicRewards(){await runDueSettlements();const p=(await database().prepare('SELECT * FROM incentive_periods ORDER BY ends_at DESC').all<RewardPeriod>()).results;return {server_time:new Date().toISOString(),periods:p.map(publicPeriod)}}
export async function studentParticipation(student_id:string){await runDueSettlements();const db=database(),c=await config(),all=await records(student_id),own=all.filter(r=>r.student_id===student_id&&r.status==='approved'&&r.activity_state==='active').map(r=>({...r,reason:recordReason(r)}));const month=awardMonthFor(new Date().toISOString(),new Date().toISOString(),c.first_month);const periods=(await db.prepare('SELECT * FROM incentive_periods WHERE result_json IS NOT NULL').all<RewardPeriod>()).results;
 const common=(await db.prepare("SELECT p.activity_id,r.name,p.duty,p.status,a.state AS activity_state,t.kind,c.participation_id AS counted,c.award_month,CASE WHEN p.duty=1 THEN 1 ELSE COALESCE(m.is_committee,0) END AS is_committee FROM incentive_participations p JOIN class_roster r ON r.student_id=p.student_id JOIN incentive_activities a ON a.id=p.activity_id JOIN incentive_tasks t ON t.id=a.task_id LEFT JOIN incentive_members m ON m.student_id=p.student_id LEFT JOIN incentive_counts c ON c.participation_id=p.id WHERE p.status='approved' AND a.state='active' AND EXISTS(SELECT 1 FROM incentive_participations own WHERE own.activity_id=p.activity_id AND own.student_id=? AND own.status='approved') ORDER BY r.student_id").bind(student_id).all<any>()).results;
 for(const row of own)row.co_participants=row.status==='approved'&&row.activity_state==='active'?common.filter(p=>p.activity_id===row.activity_id).map(p=>({name:p.name,is_committee:!!p.is_committee,...(p.duty?{reason:recordReason(p)}:{})})):[];
 const valid=own.filter(r=>r.status==='approved'&&r.activity_state==='active'&&!r.duty&&r.counted);
 // Claims may refer to an activity directly or through an approved participation.
 // Keep pending/rejected standalone claims, but never resurface voided records here.
 const claims=(await db.prepare(`SELECT c.id,c.task_title,c.occurred_at,c.content,c.note,c.status,c.resolution,c.created_at
 FROM incentive_claims c LEFT JOIN incentive_participations p ON p.id=c.participation_id
 LEFT JOIN incentive_activities a ON a.id=COALESCE(c.activity_id,p.activity_id)
 WHERE c.student_id=? AND (a.id IS NULL OR a.state='active') AND (p.id IS NULL OR p.status='approved')
 ORDER BY c.created_at DESC`).bind(student_id).all()).results;
 const catalog=(await db.prepare("SELECT a.id,a.occurred_at,t.title,t.kind FROM incentive_activities a JOIN incentive_tasks t ON t.id=a.task_id WHERE a.state='active' ORDER BY a.occurred_at DESC LIMIT 300").all()).results;
 const awards=periods.flatMap(p=>{const result=JSON.parse(p.result_json!),winner=result.winners.find((w:any)=>w.student_id===student_id);return winner?[{period_id:p.id,label:p.label,prize:prizeFor(p.kind,result),...frozenName({name:winner.name,nickname:result.display_version==='names-v1'?winner.nickname:null})}]:[]});
 const monthly_eligibility=monthlyEligibility(student_id,{id:'month-'+month,kind:'month',label:'',starts_at:month===c.first_month?FIRST_START:monthEnd(previousMonth(month)),ends_at:monthEnd(month),quota:3,result_json:null,published_at:null,delivery_json:'{}'},c,periods);
 // monthly_break is retained as a response alias for already-open older clients.
 const period=await db.prepare('SELECT label,starts_at,ends_at FROM incentive_periods WHERE id=?').bind('month-'+month).first<any>();
 const disclosed=period?(await db.prepare("SELECT a.id,a.occurred_at,a.content,t.title FROM incentive_activities a JOIN incentive_tasks t ON t.id=a.task_id WHERE a.state='active' AND a.occurred_at>=? AND a.occurred_at<? ORDER BY a.occurred_at DESC,a.id").bind(period.starts_at,period.ends_at).all<any>()).results:[];
 const people=period?(await db.prepare("SELECT p.activity_id,r.name,p.duty FROM incentive_participations p JOIN incentive_activities a ON a.id=p.activity_id JOIN class_roster r ON r.student_id=p.student_id WHERE p.status='approved' AND a.state='active' AND a.occurred_at>=? AND a.occurred_at<? ORDER BY r.student_id").bind(period.starts_at,period.ends_at).all<any>()).results:[];
 const disclosure=period?{...period,activities:disclosed.map(a=>({...a,participants:people.filter(p=>p.activity_id===a.id).map(p=>({name:p.name,duty:!!p.duty}))}))}:null;
 return {rows:own,claims,catalog,month,disclosure,month_total:valid.filter(r=>r.award_month===month).length,semester_total:valid.filter(r=>r.occurred_at>=c.semester_start&&r.occurred_at<c.semester_end).length,monthly_break:!monthly_eligibility.eligible,monthly_eligibility,awards,codes:[],config:c};
}

async function rebalance(task_id:string,excludeStudent:string|null=null){
 const db=database(),rows=(await db.prepare("SELECT p.id,p.approved_at,a.occurred_at FROM incentive_participations p JOIN incentive_activities a ON a.id=p.activity_id LEFT JOIN incentive_counts c ON c.participation_id=p.id WHERE a.task_id=? AND a.state='active' AND p.status='approved' AND p.duty=0 AND c.participation_id IS NULL AND (? IS NULL OR p.student_id!=?) ORDER BY p.approved_at,p.id").bind(task_id,excludeStudent,excludeStudent).all<any>()).results;
 const ops=[];for(const row of rows)ops.push(await countFor(row.id,row.occurred_at,row.approved_at));if(ops.length)await db.batch(ops);
}
