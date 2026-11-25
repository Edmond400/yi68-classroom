import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { database } from './data';
import { moduleForPath, normalizedRoute, type ModuleId } from './site-modules';
export const eventTypes=['page_view','entry_click','upload_success','upload_failure','download_response','download_failure','export_success','export_failure','login_success','login_failure','login_rate_limited','logout','form_submit_success','form_submit_failure','comment_created','admin_action','home_config_updated','http_error','system_error','scheduled_task_result','request_complete','export_requested'] as const;
export type SiteEvent={id?:string;event_name:typeof eventTypes[number];module_id?:ModuleId;route?:string;success?:boolean;status?:number;file_count?:number;failed_files?:number;bytes?:number;duration_ms?:number;error_code?:string;is_test?:boolean};
type Context={request_id:string;path:string;is_test:boolean;ctx?:ExecutionContext;admin_id?:string;business_recorded?:boolean;action?:string};
export const telemetryContext=new AsyncLocalStorage<Context>();
export const shanghaiDay=(time=Date.now())=>new Date(time+8*3600000).toISOString().slice(0,10);
export function safeCode(error:unknown){const e=error as {status?:number;name?:string};return e?.status&&e.status<500?'business_rejection':/D1|SQLITE|SQL_ERROR/i.test(String(e?.name)+' '+String((error as Error)?.message))?'database_error':'operation_failed';}
export async function recordEvent(event:SiteEvent,visitor?:string){
 const c=telemetryContext.getStore(),now=new Date().toISOString(),day=shanghaiDay(),id=event.id||crypto.randomUUID(),test=Number(c?.is_test||event.is_test||false);
 const db=database(),path=event.route||c?.path||'/',module=event.module_id||moduleForPath(path);
 const insert=db.prepare('INSERT OR IGNORE INTO site_events(id,occurred_at,day,event_name,module_id,route,success,status,request_id,file_count,failed_files,bytes,duration_ms,error_code,is_test) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,now,day,event.event_name,module,normalizedRoute(path),Number(event.success??true),event.status||0,c?.request_id||null,event.file_count||0,event.failed_files||0,event.bytes||0,event.duration_ms===undefined?null:Math.max(0,Math.min(86400000,Math.round(event.duration_ms))),event.error_code||'',test);
 if(visitor&&event.event_name==='page_view'){
  const hash=createHash('sha256').update('yi68-uv-v1:'+visitor).digest('hex');
  await db.batch([insert,db.prepare('INSERT OR IGNORE INTO site_daily_visitors(day,visitor_hash,is_test,last_seen) SELECT ?,?,?,? WHERE changes()>0').bind(day,hash,test,now)]);
 }else await insert.run();
}
export async function safeRecord(event:SiteEvent,visitor?:string){try{await recordEvent(event,visitor)}catch{console.error('site-telemetry-write-failed');try{await database().prepare("INSERT INTO settings(key,value) VALUES('site_telemetry_last_failure',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(new Date().toISOString()).run()}catch{ /* Business continues even when D1 is unavailable. */ }}}
export function emitEvent(event:SiteEvent){const c=telemetryContext.getStore();if(c&&['upload_success','comment_created','form_submit_success'].includes(event.event_name))c.business_recorded=true;const job=safeRecord(event);if(c?.ctx)c.ctx.waitUntil(job);return job;}
export async function auditAction(action:string,module_id:ModuleId,success=true,summary='',adminId?:string){
 const c=telemetryContext.getStore();try{await database().prepare('INSERT INTO site_admin_audit VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),new Date().toISOString(),adminId||c?.admin_id||'administrator',action,module_id,Number(success),summary.slice(0,500),c?.request_id||null,Number(c?.is_test||false)).run()}catch{console.error('site-audit-write-failed')}
}
export function emitAudit(action:string,module:ModuleId,success=true,summary='',adminId?:string){void emitEvent({event_name:'admin_action',module_id:module,success});const c=telemetryContext.getStore();const job=auditAction(action,module,success,summary,adminId);if(c?.ctx)c.ctx.waitUntil(job);return job;}
export async function telemetryMaintenance(){
 const db=database(),cutoff=new Date(Date.now()-30*86400000).toISOString(),auditCutoff=new Date(Date.now()-180*86400000).toISOString();
 // Aggregation triggers commit atomically with each event. Bounded deletes are safe to repeat.
 await db.batch([
 db.prepare('DELETE FROM site_events WHERE id IN(SELECT id FROM site_events WHERE occurred_at<? LIMIT 1000)').bind(cutoff),
 db.prepare('DELETE FROM site_daily_visitors WHERE rowid IN(SELECT rowid FROM site_daily_visitors WHERE last_seen<? LIMIT 1000)').bind(cutoff),
 db.prepare('DELETE FROM site_admin_audit WHERE id IN(SELECT id FROM site_admin_audit WHERE occurred_at<? LIMIT 1000)').bind(auditCutoff),
 db.prepare('DELETE FROM site_telemetry_limits WHERE key IN(SELECT key FROM site_telemetry_limits WHERE expires_at<? LIMIT 1000)').bind(Date.now()),
 db.prepare("INSERT INTO settings(key,value) VALUES('site_telemetry_cleanup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(new Date().toISOString()),
 ]);
}

export async function isAcceptanceRequest(request:Request){const value=request.headers.get('x-yi68-test');if(!value||!/^[a-f0-9]{64}$/.test(value))return false;try{const row=await database().prepare("SELECT value FROM settings WHERE key='site_acceptance_marker'").first<{value:string}>();const saved=row?JSON.parse(row.value):null;return !!saved&&saved.expires_at>Date.now()&&saved.hash===createHash('sha256').update(value).digest('hex')}catch{return false}}

const safeActions=new Set(['create','update','delete','publish','unpublish','reorder','cover','settings','hide_photo','restore_photo','delete_photo','delete_album','hide','restore','migrate','cleanup_orphan','change_password','setup','login','logout','item','progress','event','feedback','reset_account','account','submit','register','activate','identify']);
export function rememberAction(input:unknown){const c=telemetryContext.getStore();if(!c||!input||typeof input!=='object')return;const value=(input as any).action||(input as any).entity;if(typeof value==='string'&&safeActions.has(value))c.action=value;}
