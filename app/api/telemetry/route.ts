import { z } from 'zod';
import { createHash } from 'node:crypto';
import { database } from '@/lib/data';
import { fail, HttpError, json, readBytes, sameOrigin } from '@/lib/http';
import { getAdministrator } from '@/lib/administrator';
import { moduleIds, moduleForPath } from '@/lib/site-modules';
import { recordEvent, isAcceptanceRequest } from '@/lib/site-telemetry';
export const dynamic='force-dynamic';
const input=z.object({id:z.string().uuid(),event_name:z.enum(['page_view','entry_click']),path:z.string().min(1).max(200).regex(/^\/[a-zA-Z0-9/_-]*$/),module_id:z.enum(moduleIds as [string,...string[]]),visitor:z.string().uuid().optional(),is_test:z.boolean().optional()}).strict();
export async function POST(request:Request){try{
 sameOrigin(request);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'格式无效。');
 if(/bot|spider|crawler|headless|preview/i.test(request.headers.get('user-agent')||''))return json({ok:true,ignored:true});
 let data;try{data=input.parse(JSON.parse(new TextDecoder().decode(await readBytes(request,2048))))}catch{throw new HttpError(400,'事件格式无效。')}
 if(data.event_name==='page_view'&&data.module_id!==moduleForPath(data.path))throw new HttpError(400,'页面模块无效。');
 // Persist only a short-lived salted digest, never an IP address or HTTP headers.
 const window=Math.floor(Date.now()/60000),address=request.headers.get('cf-connecting-ip')||'local';
 const key=createHash('sha256').update(`telemetry:${window}:${address}`).digest('hex');
 const hits=await database().prepare('INSERT INTO site_telemetry_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(key,(window+1)*60000).first<{hits:number}>();
 if(!hits||hits.hits>180)throw new HttpError(429,'事件提交过于频繁。');
 const test=await isAcceptanceRequest(request)||!!data.is_test&&!!await getAdministrator(request);
 await recordEvent({...data,module_id:data.module_id as any,route:data.path,is_test:test},data.visitor);
 return json({ok:true});
}catch(error){return fail(error)}}
