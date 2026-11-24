import {database} from './data';
import {HttpError} from './http';
import {defaultConfig,type RewardPeriod} from './incentive-rules';
import {configuredSemester,overlapsSemester,type RewardSemester} from './monthly-reward-policy';
import {auditStatement} from './activity-writes';
// This changes an administrator's delivery register only. Coupons remain offline.
// The first delivery timestamp is immutable, even after a checkbox correction.
export async function registerPrizeDelivery(periodId:string,studentId:string,delivered:boolean,actor:string){
 const db=database(),old=await db.prepare('SELECT * FROM incentive_periods WHERE id=? AND result_json IS NOT NULL').bind(periodId).first<RewardPeriod&{result_json:string}>();
 if(!old||!JSON.parse(old.result_json).winners.some((w:{student_id:string})=>w.student_id===studentId))throw new HttpError(400,'该同学不是本期获奖者。');
 const previous=JSON.parse(old.delivery_json),known=await db.prepare('SELECT delivered_at FROM incentive_prize_deliveries WHERE period_id=? AND student_id=?').bind(periodId,studentId).first<{delivered_at:string}>();
 if(delivered&&known&&previous[studentId]===known.delivered_at||!delivered&&!previous[studentId])return;
 const storedConfig=await db.prepare("SELECT value FROM settings WHERE key='incentive_config_v1'").first<{value:string}>(),current=configuredSemester(storedConfig?JSON.parse(storedConfig.value):defaultConfig),result=JSON.parse(old.result_json);
 const semester:RewardSemester|null=old.kind==='month'?(result.reward_semester||(overlapsSemester(old,current)?current:null)):null;
 const path='$.'+JSON.stringify(studentId),guard=crypto.randomUUID(),ops=[db.prepare(`INSERT INTO incentive_write_guards(id,allowed) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM incentive_periods WHERE id=? AND result_json=?) THEN 1 ELSE 0 END`).bind(guard,periodId,old.result_json)];
 if(delivered&&!known&&semester){
  const receiptGuard=crypto.randomUUID();
  const previousReceipt=await db.prepare('SELECT period_id FROM incentive_monthly_redemptions WHERE semester_id=? AND student_id=?').bind(semester.id,studentId).first<{period_id:string}>();
  if(previousReceipt&&previousReceipt.period_id!==periodId)throw new HttpError(409,'本学期已登记另一份月奖礼品，请勿重复发放。');
  ops.push(db.prepare('INSERT OR IGNORE INTO incentive_monthly_redemptions(semester_id,student_id,period_id,delivered_at) VALUES (?,?,?,?)').bind(semester.id,studentId,periodId,new Date().toISOString()),db.prepare('INSERT INTO incentive_write_guards(id,allowed) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM incentive_monthly_redemptions WHERE semester_id=? AND student_id=? AND period_id=?) THEN 1 ELSE 0 END').bind(receiptGuard,semester.id,studentId,periodId),db.prepare('DELETE FROM incentive_write_guards WHERE id=?').bind(receiptGuard));
 }
 if(delivered)ops.push(db.prepare('INSERT OR IGNORE INTO incentive_prize_deliveries(period_id,student_id,delivered_at) SELECT ?,?,COALESCE(json_extract(delivery_json,?),?) FROM incentive_periods WHERE id=?').bind(periodId,studentId,path,new Date().toISOString(),periodId));
 ops.push(delivered?db.prepare('UPDATE incentive_periods SET delivery_json=json_set(delivery_json,?,(SELECT delivered_at FROM incentive_prize_deliveries WHERE period_id=? AND student_id=?)) WHERE id=?').bind(path,periodId,studentId,periodId):db.prepare('UPDATE incentive_periods SET delivery_json=json_set(delivery_json,?,NULL) WHERE id=?').bind(path,periodId));
 ops.push(auditStatement(actor,'prize.delivery',periodId,{student_id:studentId,delivered_at:previous[studentId]??null},{student_id:studentId,delivered,first_delivery_preserved:true}),db.prepare('DELETE FROM incentive_write_guards WHERE id=?').bind(guard));
 try{await db.batch(ops)}catch(error){if(String(error).includes('valid_activity_write'))throw new HttpError(409,'领奖资格或记录已更新，请刷新核对；同学期月奖不得重复发放。');throw error}
}
