import type { Student } from './accounts';
import { database } from './data';
import { HttpError } from './http';
import { nicknameIssue } from './nickname-rules';
export async function nicknameSettings(student:Student){
 const saved=await database().prepare('SELECT nickname FROM student_nicknames WHERE student_id=?').bind(student.student_id).first<{nickname:string}>();
 return {name:student.name,nickname:saved?.nickname??'',display_name:saved?.nickname||student.name};
}
export async function saveNickname(student:Student,value:string){
 const nickname=value.normalize('NFC');
 if(nickname){const issue=nicknameIssue(nickname);if(issue)throw new HttpError(400,issue)}
 const db=database(),active="SELECT r.student_id FROM student_accounts a JOIN class_roster r ON r.student_id=a.student_id WHERE a.id=? AND r.student_id=? AND a.status='active' AND r.enabled=1";
 try{
  if(nickname){
   const r=await db.prepare('INSERT INTO student_nicknames(student_id,nickname,updated_at) SELECT student_id,?,? FROM ('+active+') WHERE true ON CONFLICT(student_id) DO UPDATE SET nickname=excluded.nickname,updated_at=excluded.updated_at').bind(nickname,new Date().toISOString(),student.id,student.student_id).run();
   if(!r.meta.changes)throw new HttpError(401,'登录状态已失效，请重新登录。');
  }else{
   const r=await db.batch([db.prepare(active).bind(student.id,student.student_id),db.prepare('DELETE FROM student_nicknames WHERE student_id=? AND EXISTS('+active+')').bind(student.student_id,student.id,student.student_id)]);
   if(!r[0].results.length)throw new HttpError(401,'登录状态已失效，请重新登录。');
  }
 }catch(e){
  const message=e instanceof Error?e.message:String(e);
  if(message.includes('nickname_real_name_conflict')||message.includes('UNIQUE constraint failed: student_nicknames.nickname'))throw new HttpError(409,'这个昵称与其他同学的姓名或昵称重复，请换一个。');
  throw e;
 }
 return nicknameSettings(student);
}
