// One-time V1.2 production acceptance, using synthetic identities and photos only.
// Tokens stay in process memory; all temporary sessions, accounts and media are removed.
import assert from 'node:assert/strict';
import { randomBytes,createHash,randomUUID,randomInt } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const origin='https://class.example.invalid',marker='class_albums_v12_verified';
const makeToken=()=>randomBytes(32).toString('hex'),hash=s=>createHash('sha256').update(s).digest('hex');
const adminToken=makeToken(),students=[0,1].map(n=>({id:randomUUID(),student_id:'000'+String(randomInt(1000000,9999999)),name:'相册合成验收'+(n?'乙':'甲'),token:makeToken()}));
function sql(command){const r=spawnSync('pnpm',['exec','wrangler','d1','execute','DB','--remote','--json','--command',command],{encoding:'utf8',maxBuffer:2*1024*1024});if(r.status!==0)throw new Error('Album V1.2 acceptance D1 command failed');return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results}
async function request(path,{body,token,expected=200,ua,cookie=false}={}){
 const headers={...(token?(cookie?{Cookie:'__Host-yi68_session='+token}:{Authorization:'Bearer '+token}):{}),...(body?{Origin:origin}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(ua?{'User-Agent':ua}:{})};
 const r=await fetch(origin+path,{method:body?'POST':'GET',headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
 assert.equal(r.status,expected,'Unexpected status '+r.status+' at '+path);return r;
}
const adminCommand=body=>request('/api/admin/albums',{body,token:adminToken}).then(r=>r.json());
if(sql("SELECT value FROM settings WHERE key='"+marker+"'").length){console.log('Album V1.2 production acceptance already passed; skipped.');process.exit(0)}
const proof={version:'class-albums-v1.2',time:new Date().toISOString(),checks:[]};
const image=readFileSync('tests/fixtures/albums/smoke.jpg'),photos=[randomUUID(),randomUUID(),randomUUID()];
function form(id){const f=new FormData();f.set('id',id);f.set('file',new File([image],'synthetic-album-acceptance.jpg',{type:'image/jpeg'}));f.set('preview',new File([image],'preview.jpg',{type:'image/jpeg'}));f.set('width','960');f.set('height','640');return f}
let album,accountsCreated=false;
try{
 sql("INSERT INTO administrator_sessions(token_hash,admin_id,credential_version,expires_at) SELECT '"+hash(adminToken)+"',id,credential_version,"+(Date.now()+600000)+" FROM administrator WHERE id='primary'");
 // Refuse to touch an existing roster entry, even in the synthetic namespace.
 for(const s of students)assert.equal(sql("SELECT student_id FROM class_roster WHERE student_id='"+s.student_id+"'").length,0);
 const now=new Date().toISOString();
 accountsCreated=true;
 sql(students.map(s=>"INSERT INTO class_roster(student_id,name,enabled) VALUES ('"+s.student_id+"','"+s.name+"',1);INSERT INTO student_accounts(id,student_id,password_hash,status,role,created_at,updated_at) VALUES ('"+s.id+"','"+s.student_id+"','unusable-synthetic-password','active','student','"+now+"','"+now+"');INSERT INTO student_sessions(token_hash,account_id,expires_at) VALUES ('"+hash(s.token)+"','"+s.id+"',"+(Date.now()+600000)+");").join(''));
 album=(await adminCommand({action:'create',info:{title:'相册互动验收（自动清理）',activity_date:'1970-01-01',description:'仅合成照片和测试留言，完成后自动移除。'}})).id;
 await request('/api/admin/albums/'+album+'/photos',{body:form(photos[0]),token:adminToken});
 await adminCommand({action:'publish',id:album,confirmed:true});
 for(const id of photos.slice(1))await request('/api/albums/'+album+'/photos',{body:form(id),token:students[0].token});
 const detail=await (await request('/api/albums/'+album)).json();assert.equal(detail.photos.length,3);
 const rows=sql("SELECT id,size,checksum,object_key,thumbnail_key,uploaded_by,uploaded_by_name FROM class_album_photos WHERE album_id='"+album+"'");
 for(const id of photos.slice(1)){
  const row=rows.find(p=>p.id===id);assert.equal(row.uploaded_by,students[0].id);assert.equal(row.uploaded_by_name,students[0].name);
  assert(row.object_key.startsWith('albums/'+album+'/'));
  const raw=await request('/api/albums/photos/'+id);assert.equal(hash(Buffer.from(await raw.arrayBuffer())),row.checksum);
  assert((await (await request('/api/albums/photos/'+id+'?preview=1')).arrayBuffer()).byteLength>0);
 }
 proof.checks.push('student-batch-upload-immediately-public','D1-uploader-index-and-R2-readback');
 const cp='/api/albums/photos/'+photos[1]+'/comments',cp2='/api/albums/photos/'+photos[2]+'/comments';
 await request('/api/albums/'+album+'/photos',{body:form(randomUUID()),expected:401});
 await request(cp,{body:{action:'create',content:'anonymous'},expected:401});
 await request('/api/admin/albums',{body:{action:'delete_album',id:album},token:students[0].token,expected:401});
 await request('/api/albums',{body:{action:'delete_photo',id:album,photo_id:photos[0]},token:students[0].token,expected:403});
 const content='班级记忆 🎨😊 <script>普通文本</script>';
 let c=(await (await request(cp,{body:{action:'create',content},token:students[0].token,cookie:true})).json()).id;
 let data=await (await request(cp)).json();assert.equal(data.comments.length,1);assert.equal(data.comments[0].content,content);assert.equal(data.comments[0].author_name,students[0].name);assert.equal(data.comments[0].can_delete,false);assert.equal(data.viewer.can_comment,false);assert(!('account_id' in data.comments[0]));
 assert.equal((await (await request(cp2)).json()).comments.length,0);
 assert.equal((await (await request(cp,{token:students[0].token})).json()).comments[0].can_delete,true);
 await request(cp,{body:{action:'delete',id:c},token:students[1].token,expected:403});
 await request(cp,{body:{action:'delete',id:c},token:students[0].token});assert.equal((await (await request(cp)).json()).comments.length,0);
 c=(await (await request(cp,{body:{action:'create',content:'管理员删除验收'},token:students[0].token})).json()).id;
 await request('/api/admin/albums/photos/'+photos[1]+'/comments',{body:{action:'delete',id:c},token:adminToken});assert.equal((await (await request(cp)).json()).comments.length,0);
 await request(cp,{body:{action:'create',content:'随照片清理'},token:students[0].token});
 assert.equal(sql("SELECT COUNT(*) n FROM class_album_comments WHERE photo_id='"+photos[1]+"'")[0].n,1);
 await adminCommand({action:'delete_photo',id:album,photo_id:photos[1]});
 await request(cp,{expected:404});assert.equal(sql("SELECT COUNT(*) n FROM class_album_comments WHERE photo_id='"+photos[1]+"'")[0].n,0);
 proof.checks.push('public-student-comments-cookie-and-bearer','anonymous-and-student-management-denied','own-and-admin-comment-deletion','per-photo-scope-and-cascade');
 for(const ua of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148','Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile MicroMessenger/8.0']){
  const page=await (await request('/albums/'+album,{ua})).text();assert(page.includes('album-student-upload'));assert(page.includes('欢迎分享班级活动照片'));
  await request(cp2,{ua});
 }
 for(const path of ['/api/health','/survey/birthday','/survey/favorite-character','/funds'])await request(path);
 proof.checks.push('mobile-and-wechat-UA-upload-page-and-comments','existing-health-surveys-funds');
}finally{
 try{if(album){await adminCommand({action:'delete_album',id:album});assert.equal(sql("SELECT COUNT(*) n FROM class_album_photos WHERE album_id='"+album+"'")[0].n,0)}}finally{
  sql("DELETE FROM administrator_sessions WHERE token_hash='"+hash(adminToken)+"'");
  if(accountsCreated)sql(students.map(s=>"DELETE FROM student_sessions WHERE account_id='"+s.id+"';DELETE FROM student_accounts WHERE id='"+s.id+"';DELETE FROM class_roster WHERE student_id='"+s.student_id+"';").join(''));
 }
}
proof.checks.push('synthetic-media-accounts-and-sessions-cleaned');
const result={...proof,result:'PASS'};
sql("INSERT INTO settings(key,value) VALUES ('"+marker+"','"+JSON.stringify(result).replaceAll("'","''")+"') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
console.log('ALBUM_V12_PRODUCTION_ACCEPTANCE '+JSON.stringify(result));
