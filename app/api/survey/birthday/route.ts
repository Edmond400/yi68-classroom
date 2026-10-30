import { database } from '@/lib/data';
import { fail,HttpError,json,readJson } from '@/lib/http';
import { validate } from '@/lib/validation';
import { birthdayInput } from '@/lib/birthday';
import { rateLimit } from '@/lib/administrator';
import { digest } from '@/lib/passwords';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const p=validate(birthdayInput,await readJson(request));await rateLimit(request,'birthday-submit',300);
 const db=database(),key=digest(p.request_key),payloadHash=digest(JSON.stringify([p.name,p.month,p.day,p.participation]));
 await db.prepare('INSERT OR IGNORE INTO birthday_responses (id,request_key,payload_hash,name,month,day,participation,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),key,payloadHash,p.name,p.month,p.day,p.participation,new Date().toISOString()).run();
 const stored=await db.prepare('SELECT payload_hash FROM birthday_responses WHERE request_key=?').bind(key).first<{payload_hash:string}>();
 if(!stored)throw new Error('Survey write did not persist');if(stored.payload_hash!==payloadHash)throw new HttpError(409,'本次提交标识已使用，请刷新页面重新填写。');
 return json({ok:true});
}catch(error){return fail(error)}}
