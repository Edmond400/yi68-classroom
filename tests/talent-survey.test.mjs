import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const require=createRequire(import.meta.url),{build}=require(require.resolve('esbuild',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(readFileSync('drizzle/0020_talent_registrations.sql','utf8'));
sqlite.exec('CREATE TABLE auth_attempts(key TEXT PRIMARY KEY,hits INTEGER,expires_at INTEGER); CREATE TABLE administrator(id TEXT PRIMARY KEY,username TEXT,password_hash TEXT,credential_version TEXT); CREATE TABLE administrator_sessions(token_hash TEXT PRIMARY KEY,admin_id TEXT,credential_version TEXT,expires_at INTEGER)');
function prepared(sql,p=[]){return{bind(...v){return prepared(sql,v)},async first(){return sqlite.prepare(sql).get(...p)||null},async all(){return{results:sqlite.prepare(sql).all(...p)}},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...p).changes)}}}}}
globalThis.__talentTestEnv={DB:{prepare:prepared}};
const dir=mkdtempSync(resolve(tmpdir(),'yi68-talent-')),out=resolve(dir,'app.mjs'),origin='https://yi68.test';
await build({stdin:{contents:`export * from './lib/talent-survey';export {GET as studentGet,POST as studentPost} from './app/survey/talent/route';export {GET as adminGet,DELETE as adminDelete} from './app/api/admin/surveys/talent/route';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:out,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onResolve({filter:/^next\/headers$/},()=>({path:'headers',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='env'?'export const env=globalThis.__talentTestEnv':'export async function headers(){return new Headers()}'}))}}]});
try{
 const app=await import(pathToFileURL(out).href);
 const post=(name,program,headers={Origin:origin})=>app.studentPost(new Request(origin+app.talentPath,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mobile MicroMessenger/8.0',...headers},body:new URLSearchParams({name,program})}));
 let html=await(await app.studentGet(new Request(origin+app.talentPath))).text();assert.equal((html.match(/<input /g)||[]).length,2);assert(!html.includes('<script'));assert.match(html,/required/g);
 assert.equal((await post(' 同学甲 ','钢琴')).status,303);assert.equal((await post('同学甲','朗诵')).status,303);assert.equal((await post('同学乙','合唱')).status,303);
 let rows=await app.talentRegistrations();assert.equal(rows.length,2);assert.equal(rows.find(r=>r.name==='同学甲').program,'朗诵');
 assert.equal((await post('','节目')).status,400);assert.equal((await post('姓名','  ')).status,400);assert.equal((await post('字'.repeat(41),'节目')).status,400);assert.equal((await post('姓名','字'.repeat(161))).status,400);
 assert.equal((await post('姓名','节目',{Origin:'https://other.test'})).status,403);assert.equal((await post('兼容','节目',{Referer:origin+app.talentPath})).status,303);
 html=await(await post('<img src=x>','')).text();assert(html.includes('&lt;img'));assert(!html.includes('<img'));
 html=await(await app.studentGet(new Request(origin+app.talentPath+'?submitted=1'))).text();assert.match(html,/报名成功！期待你的精彩表演！/);assert(!html.includes('同学甲'));
 const token='b'.repeat(64),hash=createHash('sha256').update(token).digest('hex');sqlite.prepare('INSERT INTO administrator VALUES (?,?,?,?)').run('primary','admin','unused','test');sqlite.prepare('INSERT INTO administrator_sessions VALUES (?,?,?,?)').run(hash,'primary','test',Date.now()+60000);
 const req=(extra='',admin=false,body,source=origin)=>new Request(origin+app.talentApi+extra,{method:body?'DELETE':'GET',headers:{...(admin?{Authorization:'Bearer '+token}:{}),Origin:source,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await app.adminGet(req())).status,401);assert.equal((await app.adminGet(req('?export=csv'))).status,401);assert.equal((await app.adminDelete(req('',false,{name:'同学甲'}))).status,401);
 assert.equal((await app.adminGet(req('',true))).status,200);const csv=await(await app.adminGet(req('?export=csv',true))).text();assert(csv.includes('同学甲'));assert(csv.includes('朗诵'));assert(app.talentCsv([{name:'=1',program:'"带,引号"',submitted_at:new Date().toISOString()}]).includes("'=1"));
 assert.equal((await app.adminDelete(req('',true,{name:'同学甲'},'https://other.test'))).status,403);assert.equal((await app.adminDelete(req('',true,{name:'同学甲'}))).status,200);assert(!(await app.talentRegistrations()).some(r=>r.name==='同学甲'));
 console.log('PASS talent form required fields, WeChat-UA without cookies, same-name upsert, private results/CSV, HTML escaping, origin checks, existing admin auth and deletion');
}finally{sqlite.close();delete globalThis.__talentTestEnv;rmSync(dir,{recursive:true,force:true})}
