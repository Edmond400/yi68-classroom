import { z } from 'zod';
import { statuses, today } from './model';
import { HttpError } from './http';
const line=z.string().trim().max(500);
export const id=z.string().regex(/^[a-zA-Z0-9_-]{1,90}$/);
const url=z.string().trim().max(2000).refine(v=>{if(!v)return true;try{return ['https:','http:'].includes(new URL(v).protocol)}catch{return false}},'请填写 http 或 https 开头的完整链接');
export const detailSchema=z.object({summary:z.string().trim().min(1).max(2000),lead:line,collaborators:line,audience:line,goal:z.string().max(5000),department:line,duration:line,body:z.string().max(30000),action:z.string().max(5000),sourceUrl:url,status:z.string().refine(v=>statuses.includes(v)),category:line,pinned:z.boolean()}).strict();
export const itemSchema=z.object({id,kind:z.enum(['task','notice']),title:z.string().trim().min(1).max(120),data:detailSchema,published:z.boolean()}).strict();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const dt=new Date(v+'T00:00:00Z');return !isNaN(+dt)&&dt.toISOString().slice(0,10)===v&&v<=today()},'日志日期须为今天或以前的有效日期');
export const progressSchema=z.object({id,item_id:id,day,summary:z.string().trim().min(1).max(6000),next_step:z.string().max(3000),cooperation:z.string().max(3000),published:z.boolean()}).strict();
export const eventSchema=z.object({id,item_id:id,title:z.string().trim().min(1).max(120),type:z.enum(['deadline','activity']),starts_at:z.string().datetime(),ends_at:z.union([z.literal(''),z.string().datetime()]),location:line,action:z.string().max(3000),audience:line,state:z.enum(['active','cancelled'])}).strict().refine(v=>!v.ends_at||Date.parse(v.ends_at)>=Date.parse(v.starts_at),'结束时间不能早于开始时间');
export const feedbackSchema=z.object({id:z.string().uuid(),body:z.string().trim().min(3,'请至少填写3个字').max(6000),name:z.string().trim().max(80),contact:z.string().trim().max(200)}).strict();
export const memberSchema=z.object({name:z.string().trim().min(2).max(50),note:z.string().trim().max(500)}).strict();
export function validate<T>(schema:z.ZodType<T>,value:unknown):T{const r=schema.safeParse(value);if(!r.success)throw new HttpError(400,r.error.issues[0]?.message||'请检查填写内容。');return r.data}
