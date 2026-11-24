import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
const require=createRequire(import.meta.url),search=[dirname(require.resolve('wrangler/package.json'))],{build}=require(require.resolve('esbuild',{paths:search})),{Miniflare}=require(require.resolve('miniflare',{paths:search}));
const dir=mkdtempSync(resolve(tmpdir(),'rehearsal-d1-'));
const compiled=await build({stdin:{contents:`import {handleRehearsal} from './lib/rehearsal/service';export default {fetch(r){const u=new URL(r.url),admin=u.pathname.startsWith('/api/admin/');return handleRehearsal(r,u.pathname.replace(/^\\/api\\/(admin\\/)?rehearsal\\/?/,'').split('/').filter(Boolean),admin)}}`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'neutral',format:'esm',write:false,external:['cloudflare:workers','node:*'],plugins:[{name:'headers',setup(b){b.onResolve({filter:/^next\/headers$/},()=>({path:'headers',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function headers(){return new Headers()}',loader:'js'}))}}]});
let mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],d1Persist:resolve(dir,'d1')});
const token='a'.repeat(64),origin='https://rehearsal.test',headers={Origin:origin,Authorization:'Bearer '+token};let seq=0;let projectId='current',groupToken='';const groupHeaders=()=>({'X-Yi68-Rehearsal-Project':projectId,'X-Yi68-Rehearsal-Token':groupToken});const projectHeaders=()=>({'X-Yi68-Rehearsal-Project':projectId});
const post=(path,body,admin=true,extra={})=>mf.dispatchFetch(origin+'/api/'+(admin?'admin/':'')+'rehearsal'+path,{method:'POST',headers:{...(admin?{...headers,...projectHeaders()}:{Origin:origin,...groupHeaders()}),'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
const get=(path='',admin=false,extra={})=>mf.dispatchFetch(origin+'/api/'+(admin?'admin/':'')+'rehearsal'+path,{headers:{...(admin?{...headers,...projectHeaders()}:groupHeaders()),...extra}});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 const db=await mf.getD1Database('DB');const q=(sql,...args)=>db.prepare(sql).bind(...args).first();
 for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+name,'utf8').match(/\s*CREATE TRIGGER\b[\s\S]*?\bEND;|[^;]+;/gi)||[])await db.prepare(sql).run();
 await db.prepare("INSERT INTO administrator VALUES ('primary','admin','test','v','now')").run();await db.prepare("INSERT INTO administrator_sessions VALUES (?,'primary','v',?)").bind(hash(token),Date.now()+3600000).run();
 for(const path of ['','/slides','/recordings','/cleanup'])assert.equal((await post(path,{},false)).status,401);
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await mf.dispatchFetch(origin+'/api/admin/rehearsal',{method,headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,401);
 assert.equal((await get()).status,401);assert.equal((await get('/projects')).status,200);
 const created=await (await post('/projects',{action:'create',title:'D1测试',code:'0123'})).json();projectId=created.id;assert(projectId);
 const entered=await post('/access',{project_id:projectId,code:'0123'},false);assert.equal(entered.status,200,await entered.clone().text());groupToken=(await entered.json()).session_token;
 let config=(await (await get('',true)).json()).project.config;assert.equal((await (await get()).json()).project,null);
 let input={revision:0,title:'D1测试',theme:'测试用可丢弃数据',status:'draft',publishedAt:null,members:[{id:'a',name:'测试甲',enabled:true},{id:'b',name:'测试乙',enabled:true}],blocks:[],slides:[],overrides:{},config};
 let response=await post('',input);assert.equal(response.status,200,await response.clone().text());let p=(await response.json()).project;
 assert.equal((await post('',input)).status,409);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 response=await mf.dispatchFetch(origin+'/api/admin/rehearsal/slides',{method:'POST',headers:{...headers,...projectHeaders(),'Content-Type':'image/png'},body:png});assert.equal(response.status,200);const page=await response.json();
 const body=p=>{const {id,scriptVersion,deckVersion,algorithmVersion,updatedAt,...rest}=p;return rest};
 input={...body(p),status:'published',slides:[{...page,pageIndex:0}],blocks:[{id:'b1',paragraphId:'b1',text:'2026年，甲发言。',memberId:'a',nonspoken:false,slideIndex:0,paragraphEnd:true},{id:'b2',paragraphId:'b2',text:'乙发言。',memberId:'b',nonspoken:false,slideIndex:0,paragraphEnd:true}]};
 response=await post('',input);assert.equal(response.status,200,await response.clone().text());p=(await response.json()).project;
 assert.equal((await get()).status,200);assert.equal((await get('/members/a')).status,200);assert.equal((await get('/members/other')).status,404);
 const audio=Buffer.alloc(10*1024*1024);audio.set([0x1a,0x45,0xdf,0xa3]);for(let i=4;i<audio.length;i++)audio[i]=i%251;
 const recording=(id=crypto.randomUUID(),change={})=>({id,memberId:'a',turnId:'turn-b1',scriptVersion:p.scriptVersion,deckVersion:p.deckVersion,algorithmVersion:p.algorithmVersion,hash:hash(audio),durationMs:10000,mediaDurationMs:10000,clockDurationMs:9990,events:[{t_ms:0,slide_index:0,source:'start'}],...change});
 const upload=(meta,bytes=audio,extra={})=>mf.dispatchFetch(origin+'/api/rehearsal/recordings',{method:'POST',headers:{Origin:origin,...groupHeaders(),'Content-Type':'audio/webm','X-Rehearsal-Metadata':encodeURIComponent(JSON.stringify(meta)),'CF-Connecting-IP':'198.51.100.'+(++seq),...extra},body:bytes});
 const first=recording(),start=performance.now();response=await upload(first);assert.equal(response.status,200,await response.clone().text());console.log('METRIC local D1 10MiB write ms',Math.round(performance.now()-start));
 const stats=await q('SELECT count(*) AS n,max(length(data)) AS largest FROM rehearsal_file_chunks WHERE file_id=?',first.id);assert.deepEqual(stats,{n:20,largest:524288});
 assert.equal((await upload(first)).status,200);assert.equal((await upload({...first,durationMs:9000})).status,409);
 const readStart=performance.now();response=await get('/audio/'+first.id);assert.equal(response.status,200);assert.equal(response.headers.get('content-disposition'),'inline');assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(audio));console.log('METRIC local D1 10MiB streamed read ms',Math.round(performance.now()-readStart));
 response=await get('/audio/'+first.id,false,{Range:'bytes=524280-524310'});assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),audio.subarray(524280,524311));assert.equal((await get('/audio/'+first.id,false,{Range:'bytes=99999999-'})).status,416);
 await db.prepare('DELETE FROM rehearsal_file_chunks WHERE file_id=? AND chunk_index=1').bind(first.id).run();assert.equal((await get('/audio/'+first.id)).status,409);await db.prepare('INSERT INTO rehearsal_file_chunks VALUES (?,1,?)').bind(first.id,audio.subarray(524288,1048576)).run();
 assert.equal((await (await get()).json()).progress.length,1);
 const snapshotBefore=(await q('SELECT snapshot_json FROM rehearsal_recordings WHERE id=?',first.id)).snapshot_json;
 for(const change of [{memberId:'unknown'},{turnId:'wrong'},{scriptVersion:'old'},{hash:'0'.repeat(64)},{events:[{t_ms:1,slide_index:0,source:'start'}]}])assert((await upload(recording(undefined,change))).status>=400);
 assert.equal((await upload(recording(),Buffer.from('not-audio'))).status,415);
 assert.equal((await upload(recording(),Buffer.alloc(10485761))).status,413);
 assert.equal((await upload(recording(),Buffer.from('bad'),{Origin:'https://evil.test'})).status,403);
 await db.prepare("CREATE TRIGGER reject_rehearsal_chunk BEFORE INSERT ON rehearsal_file_chunks WHEN NEW.file_id='11111111-1111-4111-8111-111111111111' AND NEW.chunk_index=1 BEGIN SELECT RAISE(ABORT,'injected failure'); END").run();
 const failed=recording('11111111-1111-4111-8111-111111111111');assert.equal((await upload(failed)).status,409);assert.equal(await q('SELECT id FROM rehearsal_files WHERE id=?',failed.id),null);assert.equal((await q('SELECT count(*) AS n FROM rehearsal_recordings')).n,1);
 assert.equal((await q('SELECT count(*) AS n FROM rehearsal_turn_progress')).n,1,'failed writes cannot add completion');
 await post('/recordings',{id:first.id,action:'review',locked:true,complete:true});
 const second=recording(),third=recording(),fourth=recording();for(const r of [second,third,fourth]){assert.equal((await upload(r)).status,200)}
 assert.equal((await q('SELECT count(*) AS n FROM rehearsal_recordings WHERE member_id=?','a')).n,3);assert(await q('SELECT id FROM rehearsal_recordings WHERE id=?',first.id));assert.equal(await q('SELECT id FROM rehearsal_files WHERE id=?',second.id),null);assert.equal((await q('SELECT count(*) AS n FROM rehearsal_file_chunks WHERE file_id=?',second.id)).n,0);
 for(const r of [third,fourth])await post('/recordings',{id:r.id,action:'review',locked:true});assert.equal((await upload(recording())).status,409);assert.equal((await q('SELECT count(*) AS n FROM rehearsal_recordings')).n,3);
 // Unlock and submit concurrently: exactly three remain, locked version survives.
 await post('/recordings',{id:third.id,action:'review',locked:false});await post('/recordings',{id:fourth.id,action:'review',locked:false});const pair=[recording(),recording()];const concurrent=await Promise.all(pair.map(r=>upload(r)));assert(concurrent.every(r=>r.status===200));assert.equal((await q('SELECT count(*) AS n FROM rehearsal_recordings')).n,3);assert(await q('SELECT id FROM rehearsal_recordings WHERE id=?',first.id));
 assert.equal((await q('SELECT snapshot_json FROM rehearsal_recordings WHERE id=?',first.id)).snapshot_json,snapshotBefore);
 // Updating text rotates script version and invalidates playback/calibration, not old audio.
 input={...body(p),blocks:p.blocks.map((b,i)=>i===0?{...b,text:b.text+'新稿'}:b)};response=await post('',input);assert.equal(response.status,200);const p2=(await response.json()).project;assert.notEqual(p2.scriptVersion,p.scriptVersion);assert.equal(p2.deckVersion,p.deckVersion);assert.equal((await (await get('/playback')).json()).missing.length,2);const retainedAudio=await get('/audio/'+first.id);assert.equal(retainedAudio.status,200);await retainedAudio.arrayBuffer();
 const smallAudio=audio.subarray(0,1024),multipart=recording(undefined,{memberId:'b',turnId:'turn-b2',scriptVersion:p2.scriptVersion,hash:hash(smallAudio),durationMs:1000,mediaDurationMs:1000,clockDurationMs:1000});const form=new FormData();form.append('audio',new Blob([smallAudio],{type:'audio/webm'}),'recording.webm');form.append('metadata',JSON.stringify(multipart));const formRequest=new Request(origin+'/api/rehearsal/recordings',{method:'POST',headers:{Origin:origin,...groupHeaders(),'CF-Connecting-IP':'198.51.100.240'},body:form});response=await mf.dispatchFetch(formRequest.url,{method:'POST',headers:formRequest.headers,body:await formRequest.arrayBuffer()});assert.equal(response.status,200,await response.clone().text());assert.equal((await get('/audio/'+multipart.id)).status,200);
 const publicPayload=await (await get()).json();assert(publicPayload.progress.some(x=>x.memberId==='b'&&x.scriptVersion===p2.scriptVersion));assert(publicPayload.progress.some(x=>x.memberId==='a'&&x.scriptVersion===p.scriptVersion));
 const stored=publicPayload.recordings;assert(stored.every(r=>!('snapshot_json' in r)&&!('request_hash' in r)));
 await post('/recordings',{id:first.id,action:'delete'});assert.equal((await q('SELECT count(*) AS n FROM rehearsal_file_chunks WHERE file_id=?',first.id)).n,0);
 // Request throttling persists across isolate requests; hash keys contain no raw IP.
 let blocked=false;for(let i=0;i<32;i++){const r=await upload(recording(),Buffer.from('bad'),{'CF-Connecting-IP':'203.0.113.1'});if(r.status===429)blocked=true}assert(blocked);assert(!(await q('SELECT key FROM auth_attempts LIMIT 1')).key.includes('203.0.113'));
 // Simulate overall module pressure without allocating 180MiB.
 await db.prepare("INSERT INTO rehearsal_files VALUES ('capacity-fixture',?,'audio','audio/webm',10485760,'fixture','now')").bind(projectId).run();for(let i=0;i<15;i++)await db.prepare("INSERT INTO rehearsal_files VALUES (?,?,'audio','audio/webm',10485760,'fixture','now')").bind('cap-'+i,projectId).run();
 assert.equal((await upload({...recording(),scriptVersion:p2.scriptVersion})).status,409);
 // Pruning audio must not erase successful completion of another turn.
 const progressBefore=(await q('SELECT count(*) AS n FROM rehearsal_turn_progress')).n;await db.prepare('DELETE FROM rehearsal_files WHERE id=?').bind(multipart.id).run();assert.equal((await q('SELECT count(*) AS n FROM rehearsal_turn_progress')).n,progressBefore);
 console.log('PASS real D1 rehearsal: auth, version CAS, 10MiB/20 chunks, hash, Range, multipart upload, corruption, retry, validation, transaction rollback, recent-three locks/concurrency/cascade, historical snapshots, stale playback, rate limit, 180MiB budget');
}finally{await mf.dispose();rmSync(dir,{recursive:true,force:true})}
