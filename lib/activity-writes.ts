import { database } from './data';
import { HttpError } from './http';
import { managerPermission,managerStudentId } from './activity-management-auth';
export type VersionCheck={table:'incentive_tasks'|'incentive_activities'|'incentive_claims'|'activity_admin_grants';id:string;version:number|null};
export function auditStatement(actor:string,action:string,target:string,before:unknown,after:unknown){return database().prepare('INSERT INTO incentive_audit(id,actor,action,target,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,JSON.stringify(before??null),JSON.stringify(after??null),new Date().toISOString())}
export function checkVersion(old:any,expected:number|undefined){if(expected!==undefined&&(!old||old.version!==expected))throw new HttpError(409,'记录已被其他管理员修改，请刷新核对后再保存。')}
export async function guardedWrite(actor:string,checks:VersionCheck[],ops:D1PreparedStatement[],extra:{sql:string;params:unknown[]}[]=[]){
 const db=database(),id=crypto.randomUUID(),permission=managerPermission(actor),clauses=[permission.sql],params:unknown[]=[id,...permission.params];
 for(const check of checks){const key=check.table==='activity_admin_grants'?'account_id':'id';clauses.push(check.version===null?`NOT EXISTS(SELECT 1 FROM ${check.table} WHERE ${key}=?)`:`EXISTS(SELECT 1 FROM ${check.table} WHERE ${key}=? AND version=?)`);params.push(check.id,...(check.version===null?[]:[check.version]));}
 for(const condition of extra){clauses.push(condition.sql);params.push(...condition.params)}
 const guard=db.prepare('INSERT INTO incentive_write_guards(id,allowed) SELECT ?,CASE WHEN '+clauses.map(c=>'('+c+')').join(' AND ')+' THEN 1 ELSE 0 END').bind(...params);
 try{await db.batch([guard,...ops,db.prepare('DELETE FROM incentive_write_guards WHERE id=?').bind(id)])}catch(e){
  if(String(e).includes('valid_activity_write')){await managerStudentId(actor);throw new HttpError(409,'记录或账号状态已被修改，请刷新核对后再操作。')}throw e;
 }
}
