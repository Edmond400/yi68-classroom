import { getStudent, type Student } from './accounts';
import { database } from './data';
import { HttpError } from './http';
export type ActivityManager = { id:string; name:string; student_id:string|null; primary:boolean };
export const primaryManager: ActivityManager = {id:'primary',name:'主管理员 admin',student_id:null,primary:true};
export async function activityManagerFor(student:Student|null):Promise<ActivityManager|null>{
  if(!student)return null;
  const grant=await database().prepare('SELECT g.account_id FROM activity_admin_grants g JOIN student_accounts a ON a.id=g.account_id JOIN class_roster r ON r.student_id=a.student_id WHERE g.account_id=? AND g.enabled=1 AND a.status=\'active\' AND r.enabled=1').bind(student.id).first();
  return grant?{id:'student:'+student.id,name:student.name,student_id:student.student_id,primary:false}:null;
}
export async function requireActivityManager(request:Request){
  const student=await getStudent(request);if(!student)throw new HttpError(401,'请先登录自己的学生账号。');
  const actor=await activityManagerFor(student);if(!actor)throw new HttpError(403,'你当前没有活动管理权限，请联系主管理员。');return actor;
}
export async function managerStudentId(actor:string){
  if(actor==='primary')return null;
  if(!actor.startsWith('student:'))throw new HttpError(403,'管理身份无效。');
  const row=await database().prepare('SELECT r.student_id FROM activity_admin_grants g JOIN student_accounts a ON a.id=g.account_id JOIN class_roster r ON r.student_id=a.student_id WHERE a.id=? AND g.enabled=1 AND a.status=\'active\' AND r.enabled=1').bind(actor.slice(8)).first<{student_id:string}>();
  if(!row)throw new HttpError(403,'活动管理权限已失效。');return row.student_id;
}
export function managerPermission(actor:string){
  return actor==='primary'?{sql:'1=1',params:[] as unknown[]}:{sql:"EXISTS(SELECT 1 FROM activity_admin_grants g JOIN student_accounts a ON a.id=g.account_id JOIN class_roster r ON r.student_id=a.student_id WHERE a.id=? AND g.enabled=1 AND a.status='active' AND r.enabled=1)",params:[actor.startsWith('student:')?actor.slice(8):'invalid'] as unknown[]};
}
