import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const origin='https://class.example.invalid',api='/api/admin/sketch-homework',marker='sketch_homework_public_v2_verified';
function sql(command) {
 const r=spawnSync('pnpm',['exec','wrangler','d1','execute','DB','--remote','--json','--command',command],{encoding:'utf8',maxBuffer:2*1024*1024});
 if(r.status!==0)throw new Error('Sketch homework acceptance D1 command failed');
 return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results;
}
if(sql("SELECT value FROM settings WHERE key='"+marker+"'").length){console.log('Sketch homework production acceptance already passed; skipped.');process.exit(0)}
const suffix=randomUUID(),ids=['qa_sketch_a_'+suffix,'qa_sketch_b_'+suffix],account='qa_sketch_'+suffix;
const adminToken=randomBytes(32).toString('hex'),studentToken=randomBytes(32).toString('hex'),hash=v=>createHash('sha256').update(v).digest('hex');
const idList=ids.map(id=>"'"+id+"'").join(','),now=new Date().toISOString();
const originalColor=await (await fetch(origin+'/api/color-homework')).json();
const proof={version:'sketch-homework-public-v2',time:now,checks:[],cleaned:false};
async function call(path,token,body,status=200,source=origin) {
 const response=await fetch(origin+path,{method:body?'PATCH':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{Origin:source,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,status,path);return response;
}
const change=(extra={})=>({student_id:ids[0],submitted:true,sheet_count:30,version:0,...extra});
const adminRead=async()=>(await call(api,adminToken)).json();
try {
 assert.match(await (await call('/')).text(),/href="\/sketch-homework"/);
 for(const path of ['/sketch-homework','/admin/sketch-homework'])assert.match(await (await call(path)).text(),/素描作业/);
 await call('/api/sketch-homework');await call(api,null,undefined,401);await call(api,null,change(),401);
 sql(`INSERT INTO class_roster(student_id,name,enabled) VALUES ('${ids[0]}','合成素描验收甲',1),('${ids[1]}','合成素描验收乙',1);
 INSERT INTO student_accounts(id,student_id,password_hash,status,role,created_at,updated_at) VALUES ('${account}','${ids[0]}','unusable-test-hash','active','student','${now}','${now}');
 INSERT INTO student_sessions(token_hash,account_id,expires_at) VALUES ('${hash(studentToken)}','${account}',${Date.now()+300000});
 INSERT INTO administrator_sessions(token_hash,admin_id,credential_version,expires_at) SELECT '${hash(adminToken)}',id,credential_version,${Date.now()+300000} FROM administrator WHERE id='primary';`);
 let data=await adminRead();const testRow=()=>data.rows.find(r=>r.id===ids[0]);assert.equal(testRow().submitted,false);assert.equal(testRow().sheet_count,0);assert.equal(testRow().updated_at,null);
 assert.equal(sql(`SELECT COUNT(*) n FROM sketch_homework WHERE student_id IN (${idList})`)[0].n,0);
 proof.checks.push('homepage-entry','student-and-admin-pages','anonymous-class-list-allowed-mutation-denied','real-roster-defaults-without-history');
 await call(api,studentToken,change(),401);await call(api,adminToken,change({sheet_count:0}),400);await call(api,adminToken,change({sheet_count:1.5}),400);await call(api,adminToken,change(),403,'https://other.test');
 await call(api,adminToken,change());data=await adminRead();assert.equal(testRow().sheet_count,30);assert(testRow().submitted);assert(testRow().updated_at);
 await call(api,adminToken,change({sheet_count:35,version:testRow().version}));data=await adminRead();assert.equal(testRow().sheet_count,35);
 await call(api,adminToken,change({submitted:false,sheet_count:35,version:testRow().version}));data=await adminRead();assert(!testRow().submitted);assert.equal(testRow().sheet_count,35);
 const summarize=rows=>({total:rows.length,submitted:rows.filter(r=>r.submitted).length,pending:rows.filter(r=>!r.submitted).length,sheets:rows.filter(r=>r.submitted).reduce((s,r)=>s+r.sheet_count,0)});
 for(const [k,v] of Object.entries(summarize(data.rows)))assert.equal(data.summary[k],v);
 const studentResponse=await call('/api/sketch-homework');assert.match(studentResponse.headers.get('Cache-Control'),/no-store/);
 const studentData=await studentResponse.json(),own=studentData.rows.find(r=>r.name==='合成素描验收甲');assert.equal(own.name,'合成素描验收甲');assert.equal(own.sheet_count,0);assert(!JSON.stringify(studentData).includes(ids[0]));assert(studentData.rows.every(r=>!('id' in r)&&!('student_id' in r)));
 const version=testRow().version;
 const responses=await Promise.all([fetch(origin+api,{method:'PATCH',headers:{Authorization:'Bearer '+adminToken,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(change({sheet_count:36,version})),signal:AbortSignal.timeout(30000)}),fetch(origin+api,{method:'PATCH',headers:{Authorization:'Bearer '+adminToken,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(change({sheet_count:37,version})),signal:AbortSignal.timeout(30000)})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);data=await adminRead();assert(testRow().submitted);assert([36,37].includes(testRow().sheet_count));
 const reloaded=await adminRead();assert.equal(reloaded.rows.find(r=>r.id===ids[0]).sheet_count,testRow().sheet_count);
 for(const [k,v] of Object.entries(summarize(reloaded.rows)))assert.equal(reloaded.summary[k],v);
 assert.equal(sql(`SELECT COUNT(*) n FROM sketch_homework WHERE student_id='${ids[0]}'`)[0].n,1);
 proof.checks.push('anonymous-class-wide-readonly','student-response-hides-identifiers','positive-integer-and-origin-validation','admin-register-edit-undo-restore','refresh-persistence','retained-count-excluded-from-stats','summary-matches-roster','concurrent-update-one-winner');
 for(const path of ['/albums','/participation','/rewards','/song-request','/survey/talent'])await call(path);
 proof.checks.push('existing-public-pages-available');
} finally {
 sql(`DELETE FROM sketch_homework WHERE student_id IN (${idList}); DELETE FROM student_sessions WHERE token_hash='${hash(studentToken)}'; DELETE FROM student_accounts WHERE id='${account}'; DELETE FROM class_roster WHERE student_id IN (${idList}); DELETE FROM administrator_sessions WHERE token_hash='${hash(adminToken)}'`);
 assert.equal(sql(`SELECT COUNT(*) n FROM class_roster WHERE student_id IN (${idList})`)[0].n,0);
 assert.equal(sql(`SELECT COUNT(*) n FROM sketch_homework WHERE student_id IN (${idList})`)[0].n,0);proof.cleaned=true;
}
const currentColor=await (await fetch(origin+'/api/color-homework')).json();assert.deepEqual(currentColor,originalColor);proof.checks.push('color-homework-data-unchanged');
sql("INSERT INTO settings(key,value) VALUES ('"+marker+"','"+JSON.stringify(proof).replace(/'/g,"''")+"') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
console.log(JSON.stringify(proof));
