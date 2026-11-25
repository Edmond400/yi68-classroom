import {getStudent} from './accounts';
import { getAdministrator } from './administrator';
import { emitAudit, emitEvent, telemetryContext, isAcceptanceRequest, type SiteEvent } from './site-telemetry';
import { moduleForPath } from './site-modules';
const bot=/bot|crawler|spider|headless|preview|facebookexternalhit/i;
export async function monitorRequest(request:Request,ctx:ExecutionContext,run:()=>Promise<Response>){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/telemetry'||path.startsWith('/assets/')||path.startsWith('/brand/')||path.startsWith('/vendor/')||/\.(?:js|css|png|jpe?g|svg|ico|woff2?|map)$/.test(path)||bot.test(request.headers.get('user-agent')||'')||request.headers.get('purpose')==='prefetch'||request.headers.has('next-router-prefetch'))return run();
 const start=Date.now(),request_id=crypto.randomUUID(),module=moduleForPath(path);
 let admin=null;try{if(path.startsWith('/api/admin')||!['GET','HEAD','OPTIONS'].includes(request.method)||request.headers.get('x-yi68-test')==='1')admin=await getAdministrator(request)}catch{/* Authentication is still enforced by the business handler. */}
 let studentSignedIn=false;if(path==='/api/account'&&request.method==='POST')try{studentSignedIn=!!await getStudent(request)}catch{}
 const acceptance=await isAcceptanceRequest(request);
 return telemetryContext.run({request_id,path,is_test:acceptance||!!admin&&request.headers.get('x-yi68-test')==='1',admin_id:admin?.id,ctx},async()=>{
  let response:Response;try{response=await run()}catch{
   void emitEvent({event_name:'system_error',module_id:module,success:false,status:500,error_code:'uncaught_exception',duration_ms:Date.now()-start});
   response=Response.json({error:'服务暂时不可用，请稍后重试。',request_id},{status:500});
  }
  if(path.startsWith('/api/admin/analytics/'))return response;
  const action=telemetryContext.getStore()?.action||'';
  const success=response.status<400,status=response.status,event={module_id:module,success,status} as SiteEvent;
  void emitEvent({...event,event_name:'request_complete',duration_ms:Date.now()-start});
  if(!success)void emitEvent({...event,event_name:'http_error',error_code:status>=500?'server_error':status===429?'rate_limited':'business_rejection'});
  const mutation=!['GET','HEAD','OPTIONS'].includes(request.method);
  const auth=/^\/api\/(?:admin\/auth|account)$/.test(path);
  if(auth&&mutation&&['login','setup','activate','register','logout'].includes(action)){
   const name=action==='logout'?'logout':status===429?'login_rate_limited':success?'login_success':'login_failure';
   if(action!=='logout'||(path.includes('/admin/')?!!admin:studentSignedIn))void emitEvent({...event,event_name:name,error_code:success?'':status===429?'rate_limited':'authentication_rejected'});
  } else if(mutation&&!path.startsWith('/api/admin/auth')){
   const upload=path==='/api/upload'||path.includes('favorite-character')&&!path.startsWith('/api/admin')||path.includes('/rehearsal/')&&/\/(?:recordings|slides|deck)$/.test(path)||/\/albums\/[a-f0-9-]+\/photos$/.test(path);
   if(!success)void emitEvent({...event,event_name:upload?'upload_failure':'form_submit_failure',failed_files:upload?1:0,error_code:status>=500?'operation_failed':'business_rejection'});
   else if(!auth&&!upload&&!['/api/survey/birthday','/api/survey/boys-day','/survey/boys-day','/survey/drinks','/survey/talent','/song-request','/api/feedback'].includes(path)&&!telemetryContext.getStore()?.business_recorded&&!path.startsWith('/api/admin'))void emitEvent({...event,event_name:'form_submit_success'});
  }
  const download=request.method==='GET'&&(response.headers.get('content-disposition')?.startsWith('attachment')||url.searchParams.get('download')==='1');
  const clientExport=['zip','client_csv'].includes(url.searchParams.get('export')||'');
  const exportRequest=request.method==='GET'&&(path.includes('/export')||url.searchParams.get('export')==='csv'||url.searchParams.get('format')==='csv'||path==='/api/admin/backup'||clientExport);
  if(exportRequest&&(/\/albums\/export$/.test(path)||clientExport)){if(!url.searchParams.has('after'))void emitEvent({...event,event_name:success?'export_requested':'export_failure'});}
  else if(download||exportRequest){
   // Range responses are counted as response requests, with only their returned bytes.
   const len=response.headers.get('content-length');
   void emitEvent({...event,event_name:success?(exportRequest?'export_success':'download_response'):(exportRequest?'export_failure':'download_failure'),bytes:success&&len&&/^\d+$/.test(len)?Number(len):0});
  }
  if(admin&&(mutation||exportRequest))void emitAudit(exportRequest?'export':action||request.method.toLowerCase(),module,success,`HTTP ${status}`,admin.id);
  // Preserve every business response header/cookie; add only a safe diagnostic ID.
  try{response.headers.set('X-Request-ID',request_id)}catch{/* Immutable redirects are valid responses. */}
  return response;
 });
}
