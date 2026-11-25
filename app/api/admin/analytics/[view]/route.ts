import { requireAdministrator } from '@/lib/administrator';
import { analyticsFilter,analyticsOverview,analyticsEvents,analyticsStorage,analyticsErrors,csv } from '@/lib/site-analytics';
import { fail, HttpError, json, sameOrigin } from '@/lib/http';
import { emitAudit, emitEvent } from '@/lib/site-telemetry';
import { database } from '@/lib/data';
import { GET as auditStorage } from '@/app/api/admin/storage/route';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{view:string}>}){try{
 const admin=await requireAdministrator(request),view=(await params).view,f=analyticsFilter(new URL(request.url));
 if(view==='overview'||view==='modules')return json(await analyticsOverview(f));
 if(view==='events')return json(await analyticsEvents(f));
 if(view==='errors')return json(await analyticsErrors(f));
 if(view==='storage')return json(await analyticsStorage());
 if(view==='export'){
  const kind=new URL(request.url).searchParams.get('kind')||'events';let rows:any[],columns:string[];
  if(kind==='daily'){rows=(await analyticsOverview(f)).trends;columns=['day','pv','uv','clicks','uploads','files','upload_bytes','downloads','download_success','download_bytes','login_success','login_failure','errors','rejections'];}
  else if(kind==='modules'){rows=(await analyticsOverview(f)).modules;columns=['module_id','pv','clicks','success_operations','failed_operations','files','upload_bytes','downloads','download_bytes'];}
  else {const data=await analyticsEvents({...f,page:1,audit:kind==='audit'},10000);rows=data.rows;columns=kind==='audit'?['id','occurred_at','admin_id','action','module_id','success','summary','request_id','is_test']:['id','occurred_at','event_name','module_id','route','success','status','request_id','file_count','failed_files','bytes','duration_ms','error_code','is_test'];}
  const text=csv(rows,columns),bytes=new TextEncoder().encode(text);void emitAudit('analytics_export','admin',true,`${kind}; rows ${rows.length}`,admin.id);void emitEvent({event_name:'export_success',module_id:'admin',bytes:bytes.length});
  return new Response(bytes,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="site-'+kind+'.csv"','Content-Length':String(bytes.length),'Cache-Control':'private, no-store','X-Export-Row-Count':String(rows.length),'X-Export-Limit':'10000'}});
 }
 throw new HttpError(404,'统计页面不存在。');
}catch(e){return fail(e)}}
export async function POST(request:Request,{params}:{params:Promise<{view:string}>}){try{await requireAdministrator(request);sameOrigin(request);if((await params).view!=='storage')throw new HttpError(404,'操作不存在。');const url=new URL(request.url);url.pathname='/api/admin/storage';url.search='?audit=1';const response=await auditStorage(new Request(url,{headers:request.headers}));if(!response.ok)return response;const result=await response.json() as any,summary={checked_at:new Date().toISOString(),anomaly_count:result.anomaly_count,orphan_count:result.orphans?.length||0,scope:'general_attachments',note:'附件审计；相册待清理对象与其他模块元数据在总览另列。'};await database().prepare("INSERT INTO settings(key,value) VALUES('site_storage_last_check',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(summary)).run();void emitAudit('storage_audit','admin',true,`anomalies ${summary.anomaly_count}`);return json(summary)}catch(e){return fail(e)}}
