import handler from 'vinext/server/fetch-handler';
import { runDueSettlements } from './lib/incentives';
import { database } from './lib/data';
import { cleanupAlbumObjects } from './lib/albums';
import { monitorRequest } from './lib/site-request-monitor';
import { safeRecord, telemetryMaintenance } from './lib/site-telemetry';
async function task(name:string,work:()=>Promise<unknown>){
 const now=new Date().toISOString();try{await work();await database().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('site_task_'+name,JSON.stringify({last_run:now,last_success:now,success:true})).run();await safeRecord({event_name:'scheduled_task_result',module_id:'admin',success:true,error_code:name});}
 catch{console.error('scheduled-task-failed',name);try{const key='site_task_'+name;const previous=await database().prepare('SELECT value FROM settings WHERE key=?').bind(key).first<{value:string}>();const last=previous?JSON.parse(previous.value):{};await database().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify({last_run:now,last_success:last.last_success||null,success:false,error_code:'task_failed'})).run()}catch{}await safeRecord({event_name:'scheduled_task_result',module_id:'admin',success:false,error_code:name});}
}
export default {
 fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){return monitorRequest(request,ctx,()=>handler.fetch(request,env,ctx));},
 async scheduled(_event:ScheduledController,_env:Cloudflare.Env,ctx:ExecutionContext){
  if(new Date().getUTCMinutes()===0){ctx.waitUntil(task('album_cleanup',cleanupAlbumObjects));ctx.waitUntil(task('telemetry_cleanup',telemetryMaintenance));}
  ctx.waitUntil(task('reward_settlement',async()=>{await runDueSettlements();await database().prepare("INSERT INTO settings(key,value) VALUES ('incentive_cron_last_success',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(new Date().toISOString()).run()}));
 },
};
