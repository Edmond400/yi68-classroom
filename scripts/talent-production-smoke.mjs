import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const origin='https://class.example.invalid',path='/survey/talent',api='/api/admin/surveys/talent',marker='talent_survey_v1_verified';
function sql(command){const r=spawnSync('pnpm',['exec','wrangler','d1','execute','DB','--remote','--json','--command',command],{encoding:'utf8',maxBuffer:2*1024*1024});if(r.status!==0)throw new Error('Talent acceptance D1 command failed');return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results;}
if(sql("SELECT value FROM settings WHERE key='"+marker+"'").length){console.log('Talent production acceptance already passed; skipped.');process.exit(0);}
const name='才艺合成验收'+randomUUID().slice(0,8),token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
const proof={version:'talent-survey-v1',time:new Date().toISOString(),checks:[],cleaned:false};
async function get(p,admin=false,status=200){const r=await fetch(origin+p,{headers:admin?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(30000)});assert.equal(r.status,status,p);return r;}
async function submit(program){const r=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0 (Linux; Android 14) Mobile MicroMessenger/8.0'},body:new URLSearchParams({name,program}),signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);assert.match(await r.text(),/报名成功！期待你的精彩表演！/);}
try{
  const html=await(await get(path)).text();assert.match(html,/艺68 · 才艺表演节目征集/);assert.equal((html.match(/<input /g)||[]).length,2);assert(!html.includes('<script'));
  assert.match(await(await get('/')).text(),/href="\/survey\/talent"/);
  await get(api,false,401);await get(api+'?export=csv',false,401);
  await submit('合成钢琴节目');await submit('合成更新节目');
  const saved=sql("SELECT program FROM talent_registrations WHERE name='"+name+"'");assert.equal(saved.length,1);assert.equal(saved[0].program,'合成更新节目');
  proof.checks.push('anonymous-WeChat-UA-form-submit','same-name-update-single-D1-row','homepage-entry','anonymous-results-and-CSV-denied');
  sql(`INSERT INTO administrator_sessions(token_hash,admin_id,credential_version,expires_at) SELECT '${hash}',id,credential_version,${Date.now()+300000} FROM administrator WHERE id='primary'`);
  const data=await(await get(api,true)).json();assert(data.rows.some(r=>r.name===name&&r.program==='合成更新节目'));
  const csvResponse=await get(api+'?export=csv',true);assert.match(csvResponse.headers.get('Content-Disposition'),/attachment/);const csv=await csvResponse.text();assert(csv.includes(name));assert(csv.includes('合成更新节目'));assert(csv.includes('提交时间'));
  const removed=await fetch(origin+api,{method:'DELETE',headers:{Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name}),signal:AbortSignal.timeout(30000)});assert.equal(removed.status,200);assert.equal(sql("SELECT name FROM talent_registrations WHERE name='"+name+"'").length,0);
  proof.checks.push('existing-admin-authenticated-results','private-CSV-download','admin-delete');
  for(const p of ['/admin/surveys/talent','/albums','/survey/boys-day','/survey/drinks'])await get(p);
  proof.checks.push('admin-page-and-existing-pages-available');
}finally{
  sql(`DELETE FROM talent_registrations WHERE name='${name}'; DELETE FROM administrator_sessions WHERE token_hash='${hash}'`);
  assert.equal(sql(`SELECT name FROM talent_registrations WHERE name='${name}'`).length,0);proof.cleaned=true;
}
sql("INSERT INTO settings(key,value) VALUES ('"+marker+"','"+JSON.stringify(proof).replace(/'/g,"''")+"') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
console.log(JSON.stringify(proof));
