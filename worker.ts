import handler from 'vinext/server/fetch-handler';
import { runDueSettlements } from './lib/incentives';
import { database } from './lib/data';
export default {
 fetch: handler.fetch,
 async scheduled(_event:ScheduledController,_env:Cloudflare.Env,ctx:ExecutionContext){
  ctx.waitUntil(runDueSettlements().then(async()=>{await database().prepare("INSERT INTO settings(key,value) VALUES ('incentive_cron_last_success',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(new Date().toISOString()).run()}).catch(error=>{console.error('reward-settlement-failed',error instanceof Error?error.message:'unknown');throw error}));
 },
};
