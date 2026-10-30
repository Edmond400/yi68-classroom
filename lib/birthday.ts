import { z } from 'zod';
import { database } from './data';
import { HttpError } from './http';
import { daysInBirthdayMonth,participationLabels,type BirthdayResponse,type BirthdayResults,type Participation } from './birthday-model';
export const birthdayInput=z.object({name:z.string().trim().min(1,'请填写姓名。').max(40,'姓名最多40个字符。'),month:z.number().int().min(1).max(12),day:z.number().int().min(1).max(31),participation:z.enum(['yes','no','unsure']),request_key:z.string().uuid()}).strict().refine(p=>p.day<=daysInBirthdayMonth(p.month),{message:'请填写有效的公历生日。',path:['day']});
export async function birthdayResults(url:URL):Promise<BirthdayResults>{
 const month=url.searchParams.get('month'),participation=url.searchParams.get('participation');
 if(month&&!/^(?:[1-9]|1[0-2])$/.test(month))throw new HttpError(400,'月份筛选无效。');
 if(participation&&!['yes','no','unsure'].includes(participation))throw new HttpError(400,'意愿筛选无效。');
 const where:string[]=[],params:(string|number)[]=[];
 if(month){where.push('r.month=?');params.push(Number(month))}if(participation){where.push('r.participation=?');params.push(participation)}
 const db=database(),data=await db.batch([
  db.prepare('SELECT r.id,r.name,r.month,r.day,r.participation,r.created_at,(SELECT COUNT(*) FROM birthday_responses b WHERE b.name=r.name) AS duplicate_count FROM birthday_responses r'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY r.month,r.day,r.created_at DESC').bind(...params),
  db.prepare('SELECT participation,COUNT(*) AS count FROM birthday_responses GROUP BY participation'),
 ]);
 const counts={yes:0,no:0,unsure:0};for(const row of data[1].results as {participation:Participation;count:number}[])counts[row.participation]=row.count;
 return {rows:data[0].results as BirthdayResponse[],counts,total:counts.yes+counts.no+counts.unsure};
}
export function birthdayCsv(rows:BirthdayResponse[]){
 const cell=(value:string|number)=>{let text=String(value);if(/^[\s\uFEFF]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};
 const values:(string|number)[][]=[['姓名','公历生日（月日）','参与意愿','提交时间（北京时间）','疑似重复']];
 for(const row of rows)values.push([row.name,`${row.month}月${row.day}日`,participationLabels[row.participation],new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(row.created_at)),row.duplicate_count>1?'同名记录，请核对':'']);
 return '\uFEFF'+values.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
