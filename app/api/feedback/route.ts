import {emitEvent} from '@/lib/site-telemetry';
import { database } from '@/lib/data';
import { json,fail,readJson } from '@/lib/http';
import { validate,feedbackSchema } from '@/lib/validation';
import { rateLimit } from '@/lib/administrator';
export async function POST(request:Request){try{const p=validate(feedbackSchema,await readJson(request));await rateLimit(request,'feedback-submit',150);const result=await database().prepare("INSERT OR IGNORE INTO feedback (id,body,name,contact,status,resolution,created_at) VALUES (?,?,?,?,'待处理','',?)").bind(p.id,p.body,p.name,p.contact,new Date().toISOString()).run();if(result.meta.changes)void emitEvent({id:'feedback:'+p.id,event_name:'form_submit_success',module_id:'feedback'});return json({ok:true,id:p.id})}catch(e){return fail(e)}}
