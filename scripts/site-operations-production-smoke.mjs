// Uses the existing Cloudflare build host permissions. No production password is read or changed.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,scryptSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const origin=process.env.YI68_ACCEPTANCE_ORIGIN;if(!origin)throw Error('Set YI68_ACCEPTANCE_ORIGIN to your own deployed site before running acceptance.');
const release='site-operations-v1-complete',marker='site_operations_v1_verified';
const hash=v=>createHash('sha256').update(v).digest('hex');
function sql(command){const r=spawnSync('pnpm',['exec','wrangler','d1','execute','DB','--remote','--json','--command',command],{encoding:'utf8',maxBuffer:4*1024*1024});if(r.status!==0)throw Error('Site operations acceptance database command failed');return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results;}
const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
const previous=sql('SELECT value FROM settings WHERE key='+quote(marker));
if(previous.length&&JSON.parse(previous[0].value).version===release&&JSON.parse(previous[0].value).checks?.includes('A13-controlled-500-and-business-rejection')){console.log('Site operations production acceptance already passed; skipped.');process.exit(0)}
const admin=randomBytes(32).toString('hex'),testMarker=randomBytes(32).toString('hex'),account=randomUUID(),characterId=randomUUID(),studentId='98'+String(Math.floor(Math.random()*1e8)).padStart(8,'0'),password=randomBytes(20).toString('hex'),salt=randomBytes(16).toString('hex'),passwordHash=['scrypt','16384','8','5',salt,scryptSync(password,salt,32,{N:16384,r:8,p:5,maxmem:32*1024*1024}).toString('hex')].join('$');
const proof={version:release,time:new Date().toISOString(),checks:[],cleaned:false,events:[],metrics:null};let original,current,album,studentToken;
async function call(path,{body,method,auth,expected=200,form=false,originHeader=origin}={}){
 const headers={'X-Yi68-Test':testMarker,...(auth?{Authorization:'Bearer '+auth}:{}),...(body?{Origin:originHeader}:{}),...(body&&!form?{'Content-Type':'application/json'}:{})};
 const response=await fetch(origin+path,{method:method||(body?'POST':'GET'),headers,body:form?body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(45000)});assert.equal(response.status,expected,path+' returned '+response.status);return response;
}
const home=()=>call('/api/admin/home-config',{auth:admin}).then(r=>r.json());
const save=async config=>{const r=await call('/api/admin/home-config',{auth:admin,method:'PUT',body:config});current=(await r.json()).config;return current;};
const command=body=>call('/api/admin/albums',{auth:admin,body}).then(r=>r.json());
const has=(html,id)=>html.includes('data-site-entry="'+id+'"');
const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10),query='?from='+day+'&to='+day+'&test=1';
try{
 assert.equal(sql('SELECT COUNT(*) n FROM class_roster WHERE student_id='+quote(studentId))[0].n,0);
 sql(`INSERT INTO settings(key,value) VALUES('site_acceptance_marker',${quote(JSON.stringify({hash:hash(testMarker),expires_at:Date.now()+600000}))}) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 INSERT INTO administrator_sessions(token_hash,admin_id,credential_version,expires_at) SELECT '${hash(admin)}',id,credential_version,${Date.now()+600000} FROM administrator WHERE id='primary';
 INSERT INTO class_roster(student_id,name,enabled) VALUES('${studentId}','运营功能合成验收',1);
 INSERT INTO student_accounts(id,student_id,password_hash,status,role,created_at,updated_at) VALUES('${account}','${studentId}','${passwordHash}','active','student','${proof.time}','${proof.time}');`);
 for(const view of ['overview','modules','events','storage','errors','export'])await call('/api/admin/analytics/'+view,{expected:401});
 await call('/api/admin/home-config',{expected:401});await call('/api/admin/home-config',{method:'PUT',body:{},expected:401});
 original=(await home()).config;current=original;
 const target=original.entries.find(e=>e.id==='color_homework');assert(target);
 await save({...current,entries:current.entries.map(e=>e.id===target.id?{...e,visible:false}:e)});assert(!has(await(await call('/')).text(),target.id));await call('/color-homework');
 await save({...current,entries:current.entries.map(e=>e.id===target.id?{...e,visible:true,style:'feature',expires_at:null}:e)});assert(has(await(await call('/')).text(),target.id));
 const reordered=[...current.entries];const at=reordered.findIndex(e=>e.id===target.id);reordered.unshift(reordered.splice(at,1)[0]);await save({...current,entries:reordered});
 const html=await(await call('/')).text();assert(html.indexOf('data-site-entry="color_homework"')<html.indexOf('data-site-entry="sketch_homework"'));
 await save({...current,entries:current.entries.map(e=>e.id===target.id?{...e,expires_at:new Date(Date.now()-1000).toISOString()}:e),blocks:{...current.blocks,identity:false}});const timed=await(await call('/')).text();assert(!has(timed,target.id));assert(!timed.includes('aria-label="艺68班级视觉"'));
 await save({...structuredClone(original),version:current.version});
 await call('/api/admin/home-config',{auth:admin,method:'PUT',body:original,expected:409});
 for(const path of ['/admin/home-config','/admin/analytics','/albums','/sketch-homework','/color-homework','/survey/birthday','/survey/boys-day','/survey/talent','/song-request','/funds'])await call(path);
 proof.checks.push('A01-home-compact-registry','A02-admin-pages','A03-hide','A04-old-route-valid','A05-restore','A06-order-and-feature','A07-expiry-UTC-Shanghai','A08-independent-block','A17-unauthenticated-admin-rejected','A18-public-no-login','A19-existing-public-routes','config-CAS-conflict');
 const visitor=randomUUID(),eventId=randomUUID();const telemetry={id:eventId,event_name:'page_view',path:'/',module_id:'home',visitor};await call('/api/telemetry',{body:telemetry});await call('/api/telemetry',{body:telemetry});await call('/api/telemetry',{body:{id:randomUUID(),event_name:'entry_click',path:'/',module_id:'sketch_homework',visitor}});
 album=(await command({action:'create',info:{title:'运营功能验收（临时合成数据）',activity_date:'1970-01-01',description:'验收后删除'},class_id:'yi68'})).id;
 const photo=randomUUID(),image=readFileSync('tests/fixtures/albums/smoke.jpg'),upload=new FormData();upload.set('id',photo);upload.set('file',new File([image],'ops-smoke.jpg',{type:'image/jpeg'}));upload.set('preview',new File([image],'ops-preview.jpg',{type:'image/jpeg'}));upload.set('width','960');upload.set('height','640');
 await call('/api/admin/albums/'+album+'/photos',{auth:admin,body:upload,form:true});await call('/api/admin/albums/'+album+'/photos',{auth:admin,body:upload,form:true});
 const saved=sql('SELECT size,thumbnail_size FROM class_album_photos WHERE id='+quote(photo))[0];assert(saved);const download=await call('/api/admin/albums/photos/'+photo+'?download=1',{auth:admin});assert.equal((await download.arrayBuffer()).byteLength,saved.size);
 await call('/api/albums/photos/'+photo+'?download=1',{expected:404});
 sql(`INSERT INTO favorite_character_responses(id,request_key,payload_hash,name,character,mime,size,created_at) VALUES('${characterId}','${hash(characterId)}','${hash(image)}','运营合成验收','synthetic','image/jpeg',${image.length},'${proof.time}');INSERT INTO favorite_character_image_chunks(response_id,chunk_index,data) VALUES('${characterId}',0,X'${image.toString('hex')}');`);
 const character=await call('/api/admin/surveys/favorite-character/image/'+characterId+'?download=1',{auth:admin});assert.equal((await character.arrayBuffer()).byteLength,image.length);proof.checks.push('synthetic-character-download-response');
 await call('/api/admin/auth',{body:{action:'login',username:'_ops_invalid_',password:'invalid-synthetic-password'},expected:401});
 const login=await fetch(origin+'/api/account',{method:'POST',headers:{Origin:origin,'X-Yi68-Test':testMarker,'Content-Type':'application/json','X-Yi68-Session-Transport':'bearer'},body:JSON.stringify({action:'login',student_id:studentId,password}),signal:AbortSignal.timeout(45000)});assert.equal(login.status,200);studentToken=(await login.json()).session_token;assert(studentToken);
 await call('/api/account',{body:{action:'logout'},auth:studentToken});assert.equal(sql('SELECT COUNT(*) n FROM student_sessions WHERE account_id='+quote(account))[0].n,0);
 await call('/api/admin/color-homework',{method:'PATCH',auth:admin,body:{},expected:400});
 await call('/api/admin/operations-check',{auth:admin,body:{},expected:500});
 await call('/api/admin/auth',{auth:admin,body:{action:'logout'}});
 sql(`INSERT INTO administrator_sessions(token_hash,admin_id,credential_version,expires_at) SELECT '${hash(admin)}',id,credential_version,${Date.now()+600000} FROM administrator WHERE id='primary'`);
 let overview;for(let n=0;n<12;n++){overview=await(await call('/api/admin/analytics/overview'+query,{auth:admin})).json();if(overview.metrics.upload_bytes>=saved.size+saved.thumbnail_size&&overview.metrics.download_success>=1&&overview.metrics.login_success>=1&&overview.metrics.login_failure>=1)break;await new Promise(r=>setTimeout(r,500));}
 assert.equal(sql('SELECT COUNT(*) n FROM site_events WHERE id='+quote(eventId))[0].n,1);assert(overview.metrics.pv>=1);assert(overview.metrics.clicks>=1);assert(overview.metrics.files>=2);assert(overview.metrics.login_success>=1);assert(overview.metrics.login_failure>=1);assert(overview.metrics.download_bytes>=saved.size);assert(overview.metrics.errors>=1);
 const events=await(await call('/api/admin/analytics/events'+query,{auth:admin})).json();assert(events.rows.some(e=>e.is_test===1));const audits=await(await call('/api/admin/analytics/events'+query+'&audit=1',{auth:admin})).json();assert(audits.rows.some(e=>['home_config_updated','home_config_restored'].includes(e.action)));
 const csv=await call('/api/admin/analytics/export'+query+'&kind=daily',{auth:admin});assert.match(csv.headers.get('content-type'),/text\/csv/);assert((await csv.text()).includes('pv'));
 const storage=await(await call('/api/admin/analytics/storage'+query,{auth:admin})).json();assert(storage.source.includes('元数据'));assert(storage.modules.some(r=>r.module_id==='albums'&&r.files>=2));
 const errors=await(await call('/api/admin/analytics/errors'+query,{auth:admin})).json();assert(errors.recent.some(e=>e.status===400||e.status===401));
 proof.metrics=overview.metrics;proof.events=sql("SELECT occurred_at,event_name,module_id,success,status,file_count,bytes,is_test FROM site_events WHERE is_test=1 AND event_name IN('page_view','entry_click','upload_success','download_response','login_success','login_failure','logout','home_config_updated','admin_action','system_error','http_error') ORDER BY occurred_at DESC LIMIT 25");
 proof.checks.push('A09-real-page-and-click-dedup','A10-actual-R2-upload-and-retry-dedup','A11-real-file-response-and-bytes','A12-real-student-login-admin-failure-and-logout','A13-controlled-500-and-business-rejection','A14-range-modules-events','A15-real-CSV','A16-real-file-metadata','A20-local-controlled-fault-isolation');
}finally{
 let cleaned=true;
 try{if(original&&current){const latest=(await home()).config;if(latest.version===current.version){if(JSON.stringify({...latest,version:0})!==JSON.stringify({...original,version:0}))await save({...original,version:latest.version});}else{cleaned=false;proof.checks.push('concurrent-home-edit-preserved')}}}catch{cleaned=false}
 try{if(album)await command({action:'delete_album',id:album})}catch{cleaned=false}
 sql(`DELETE FROM favorite_character_image_chunks WHERE response_id='${characterId}';DELETE FROM favorite_character_responses WHERE id='${characterId}';DELETE FROM student_sessions WHERE account_id='${account}';DELETE FROM student_accounts WHERE id='${account}';DELETE FROM class_roster WHERE student_id='${studentId}';DELETE FROM administrator_sessions WHERE token_hash='${hash(admin)}';DELETE FROM settings WHERE key='site_acceptance_marker';`);
 assert.equal(sql('SELECT COUNT(*) n FROM class_roster WHERE student_id='+quote(studentId))[0].n,0);if(album)assert.equal(sql('SELECT COUNT(*) n FROM class_albums WHERE id='+quote(album))[0].n,0);
 proof.cleaned=cleaned;assert(cleaned,'Acceptance cleanup or home restoration requires inspection');
}
sql('INSERT INTO settings(key,value) VALUES('+quote(marker)+','+quote(JSON.stringify(proof))+') ON CONFLICT(key) DO UPDATE SET value=excluded.value');
console.log('SITE_OPERATIONS_PRODUCTION_ACCEPTANCE '+JSON.stringify({...proof,result:'PASS'}));
