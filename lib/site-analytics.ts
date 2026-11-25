import { database } from './data';
import { HttpError } from './http';
import { eventTypes, shanghaiDay } from './site-telemetry';
import { moduleIds } from './site-modules';
export type AnalyticsFilter={from:string;to:string;test:number;module:string;event:string;success:string;status:number;request_id:string;page:number;audit:boolean};
function validDay(day:string){return /^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day}
export function analyticsFilter(url:URL):AnalyticsFilter{
 const q=url.searchParams,from=q.get('from')||shanghaiDay(Date.now()-6*86400000),to=q.get('to')||shanghaiDay();
 if(!validDay(from)||!validDay(to)||from>to||Date.parse(to)-Date.parse(from)>3660*86400000)throw new HttpError(400,'请选择有效日期范围（最长十年）。');
 const module=q.get('module')||'',event=q.get('event')||'',success=q.get('success')||'',status=Number(q.get('status')||0),request_id=q.get('request_id')||'';
 if(module&&!moduleIds.includes(module as any)||event&&!eventTypes.includes(event as any)||!['','0','1'].includes(success)||!Number.isInteger(status)||status!==0&&(status<100||status>599)||request_id&&!/^[a-f0-9-]{36}$/.test(request_id))throw new HttpError(400,'筛选条件无效。');
 return {from,to,test:Number(q.get('test')==='1'),module,event,success,status,request_id,page:Math.min(10000,Math.max(1,Math.floor(Number(q.get('page'))||1))),audit:q.get('audit')==='1'};
}
const sum=(rows:any[],key:string)=>rows.reduce((n,r)=>n+Number(r[key]||0),0);
export function metrics(rows:any[]){const pick=(names:string[])=>rows.filter(r=>names.includes(r.event_name));return {
 pv:sum(pick(['page_view']),'count'),clicks:sum(pick(['entry_click']),'count'),uploads:sum(pick(['upload_success','upload_failure']),'count'),upload_success:sum(pick(['upload_success']),'count'),files:sum(pick(['upload_success']),'file_count'),failed_files:sum(pick(['upload_failure']),'failed_files'),upload_bytes:sum(pick(['upload_success']),'bytes'),
 downloads:sum(pick(['download_response','download_failure','export_success','export_failure']),'count'),download_success:sum(pick(['download_response','export_success']),'count'),download_bytes:sum(pick(['download_response','export_success']),'bytes'),
 login_success:sum(pick(['login_success']),'count'),login_failure:sum(pick(['login_failure']),'count'),login_rate_limited:sum(pick(['login_rate_limited']),'count'),interactions:sum(pick(['form_submit_success','comment_created']),'count'),
 // Worker errors are counted once; business failure types are breakdowns, not additions.
 errors:sum(rows.filter(r=>r.event_name==='http_error'&&r.status>=500||r.event_name==='scheduled_task_result'&&!r.success),'count'),rejections:sum(rows.filter(r=>r.event_name==='http_error'&&r.status>=400&&r.status<500),'count'),
 requests:sum(pick(['request_complete']),'count'),duration_count:sum(pick(['request_complete']),'duration_count'),duration_sum:sum(pick(['request_complete']),'duration_sum'),histogram:Object.fromEntries(['le100','le500','le1000','le5000','gt5000'].map(key=>[key,sum(pick(['request_complete']),key)])),
 success_operations:sum(rows.filter(r=>['form_submit_success','comment_created','upload_success','login_success','home_config_updated'].includes(r.event_name)),'count'),failed_operations:sum(rows.filter(r=>['form_submit_failure','upload_failure','login_failure','download_failure','export_failure'].includes(r.event_name)),'count'),
};}
export async function analyticsOverview(f:AnalyticsFilter){
 const db=database();const results=await db.batch([
 db.prepare('SELECT * FROM site_daily_stats WHERE day>=? AND day<=? AND is_test=? AND (?=\'\' OR module_id=?) ORDER BY day').bind(f.from,f.to,f.test,f.module,f.module),
 db.prepare('SELECT COUNT(DISTINCT visitor_hash) AS n FROM site_daily_visitors WHERE day>=? AND day<=? AND is_test=?').bind(f.from,f.to,f.test),
 db.prepare("SELECT key,value FROM settings WHERE key IN('site_telemetry_started','site_telemetry_last_failure','site_telemetry_cleanup','site_storage_last_check') OR key LIKE 'site_task_%'"),
 db.prepare('SELECT MAX(occurred_at) AS last_event FROM site_events'),
 db.prepare("SELECT * FROM site_events WHERE day>=? AND day<=? AND is_test=? AND (?='' OR module_id=?) AND event_name NOT IN('request_complete','scheduled_task_result') ORDER BY occurred_at DESC LIMIT 10").bind(f.from,f.to,f.test,f.module,f.module),
 ]);
 const rows=results[0].results as any[],settings=Object.fromEntries(results[2].results.map((r:any)=>[r.key,r.value])),first=settings.site_telemetry_started||null;
 const firstDay=first?shanghaiDay(Date.parse(first)):shanghaiDay(),available=f.to>=firstDay&&f.from<=shanghaiDay();
 const uvAvailable=!f.module&&f.from>=shanghaiDay(Date.now()-29*86400000);
 const trends=[];for(let d=Date.parse(f.from+'T00:00:00Z');d<=Date.parse(f.to+'T00:00:00Z');d+=86400000){const day=new Date(d).toISOString().slice(0,10),r=rows.filter(x=>x.day===day);const unavailable=day<firstDay||day>shanghaiDay();const values=metrics(r);trends.push({day,...(unavailable?Object.fromEntries(Object.keys(values).map(key=>[key,null])):values),uv:unavailable||f.module?null:sum(r.filter(x=>x.event_name==='daily_unique_browser'),'count'),unavailable});}
 return {measurement_available:available,range:{from:f.from,to:f.to,time_zone:'Asia/Shanghai'},metrics:{...metrics(rows),uv:uvAvailable&&available?(results[1].results[0] as any)?.n||0:null},coverage_note:f.from<firstDay?'所选范围包含上线前日期；上线前未采集，图表和导出留空。上线当天只包含开始采集后的数据。':'仅显示已采集数据；未来日期留空。',uv_note:f.module?'UV 仅提供全站浏览器去重；不记录个人模块轨迹。':uvAvailable?'匿名浏览器估算；跨日去重，不代表真实人数。':'原始去重标识仅保留30天，此范围的跨日UV不可用。',trends,modules:(available?moduleIds:[]).map(module_id=>({module_id,...metrics(rows.filter(r=>r.module_id===module_id))})).sort((a,b)=>b.pv+b.success_operations-a.pv-a.success_operations),started_at:first,last_event:(results[3].results[0] as any)?.last_event||null,last_collection_failure:settings.site_telemetry_last_failure||null,cleanup_at:settings.site_telemetry_cleanup||null,tasks:Object.entries(settings).filter(([key])=>key.startsWith('site_task_')).map(([key,value])=>({name:key.slice(10),...JSON.parse(String(value))})),recent:results[4].results,has_data:rows.some(r=>r.event_name!=='scheduled_task_result'),retention_days:30};
}
export async function analyticsEvents(f:AnalyticsFilter,limit=50){
 const db=database();const from=f.from+'T00:00:00+08:00',to=new Date(Date.parse(f.to+'T00:00:00+08:00')+86400000).toISOString(),start=new Date(from).toISOString();
 const table=f.audit?'site_admin_audit':'site_events';
 let clause='occurred_at>=? AND occurred_at<? AND is_test=?';const values:(string|number)[]=[start,to,f.test];
 if(f.module){clause+=' AND module_id=?';values.push(f.module)}if(f.success){clause+=' AND success=?';values.push(Number(f.success))}if(f.request_id){clause+=' AND request_id=?';values.push(f.request_id)}
 if(!f.audit){if(f.event){clause+=' AND event_name=?';values.push(f.event)}if(f.status){clause+=' AND status=?';values.push(f.status)}}
 const data=await db.batch([db.prepare('SELECT * FROM '+table+' WHERE '+clause+' ORDER BY occurred_at DESC,id DESC LIMIT ? OFFSET ?').bind(...values,limit,(f.page-1)*50),db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE '+clause).bind(...values)]);
 return {rows:data[0].results,total:(data[1].results[0] as any).n,page:f.page,page_size:limit,retention_days:f.audit?180:30};
}
export async function analyticsErrors(f:AnalyticsFilter){
 const db=database();const counts=(await db.prepare("SELECT event_name,status,error_code,SUM(count) AS count FROM site_daily_stats WHERE day>=? AND day<=? AND is_test=? AND (?='' OR module_id=?) AND (success=0) GROUP BY event_name,status,error_code ORDER BY count DESC LIMIT 50").bind(f.from,f.to,f.test,f.module,f.module).all()).results;
 const recent=(await db.prepare("SELECT * FROM site_events WHERE day>=? AND day<=? AND is_test=? AND (?='' OR module_id=?) AND success=0 ORDER BY occurred_at DESC LIMIT 100").bind(f.from,f.to,f.test,f.module,f.module).all()).results;
 return {counts,recent,note:'4xx 和表单校验属于预期拒绝；5xx、未捕获异常及任务失败另列。事件类型可能描述同一请求，请按请求编号关联。覆盖范围为进入 Worker 的请求。'};
}
export async function analyticsStorage(){
 const db=database(),checked_at=new Date().toISOString(),rows=(await db.batch([
 db.prepare("SELECT 'journal' AS module_id,storage_backend AS backend,COUNT(*) AS files,COALESCE(SUM(size),0) AS bytes FROM assets GROUP BY storage_backend"),
 db.prepare("SELECT 'albums' AS module_id,'r2' AS backend,COUNT(*)*2 AS files,COALESCE(SUM(size+thumbnail_size),0) AS bytes FROM class_album_photos"),
 db.prepare("SELECT 'character' AS module_id,'d1' AS backend,COUNT(*) AS files,COALESCE(SUM(size),0) AS bytes FROM favorite_character_responses"),
 db.prepare("SELECT 'character' AS module_id,storage_provider AS backend,COUNT(*) AS files,COALESCE(SUM(size),0) AS bytes FROM favorite_character_object_responses GROUP BY storage_provider"),
 db.prepare("SELECT 'rehearsal' AS module_id,'d1' AS backend,COUNT(*) AS files,COALESCE(SUM(bytes),0) AS bytes FROM rehearsal_files"),
 db.prepare("SELECT key,value FROM settings WHERE key='site_storage_last_check'"),
 db.prepare('SELECT COUNT(*) AS pending_objects FROM album_object_cleanup'),
 db.prepare("SELECT COALESCE(SUM(file_count),0) AS files,COALESCE(SUM(bytes),0) AS bytes FROM site_daily_stats WHERE day=? AND event_name='upload_success' AND is_test=0").bind(shanghaiDay()),
 ]) );
 return {modules:rows.slice(0,5).flatMap(r=>r.results),source:'D1 业务文件元数据；相册包含原图及预览对象。不是 Cloudflare 账户计费量，不扫描 R2。',checked_at,last_full_check:(rows[5].results[0] as any)?.value?JSON.parse((rows[5].results[0] as any).value):null,pending_cleanup:(rows[6].results[0] as any)?.pending_objects||0,today:rows[7].results[0]};
}
export function csv(rows:Record<string,unknown>[],columns:string[]){const cell=(v:unknown)=>{let s=v===null||v===undefined?'':String(v);if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};return '\uFEFF'+[columns,...rows.map(r=>columns.map(c=>r[c]))].map(row=>row.map(cell).join(',')).join('\r\n');}
