import {getPublicData} from '@/lib/data';
import { requireAdministrator } from '@/lib/administrator';
import { readHomeConfig, saveHomeConfig } from '@/lib/home-config';
import { defaultHomeConfig } from '@/lib/site-modules';
import { emitAudit, emitEvent } from '@/lib/site-telemetry';
import { fail, json, readJson } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await requireAdministrator(request);return json({config:await readHomeConfig(),defaults:defaultHomeConfig(),preview_data:await getPublicData()})}catch(e){return fail(e)}}
export async function PUT(request:Request){try{const admin=await requireAdministrator(request),input=await readJson(request);const before=await readHomeConfig();const saved=await saveHomeConfig(input);const changes=saved.entries.filter(e=>JSON.stringify(e)!==JSON.stringify(before.entries.find(b=>b.id===e.id))).map(e=>`${e.id}:${e.visible?'visible':'hidden'}:${e.style}`);void emitEvent({event_name:'home_config_updated',module_id:'home'});const defaults=defaultHomeConfig();const reset=JSON.stringify({entries:saved.entries,blocks:saved.blocks})===JSON.stringify({entries:defaults.entries,blocks:defaults.blocks});void emitAudit(reset?'home_config_restored':'home_config_updated','home',true,`v${before.version}->v${saved.version}; ${changes.join(',')}; order:${saved.entries.map(e=>e.id).join(',')}; blocks:${Object.entries(saved.blocks).map(([k,v])=>k+':'+Number(v)).join(',')}`,admin.id);return json({config:saved})}catch(e){return fail(e)}}
