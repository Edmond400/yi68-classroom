// Isolated V2 acceptance; synthetic classes only. Temporary administrator transport is kept in memory.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const origin='https://class.example.invalid',marker='public_albums_v2_verified';
function sql(command){const r=spawnSync('pnpm',['exec','wrangler','d1','execute','DB','--remote','--json','--command',command],{encoding:'utf8',maxBuffer:4*1024*1024});if(r.status!==0)throw new Error('Public album acceptance D1 query failed');return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results}
if(sql("SELECT value FROM settings WHERE key='"+marker+"'").length){console.log('Public album V2 acceptance already passed; skipped.');process.exit(0)}
const token=randomBytes(32).toString('hex'),hash=s=>createHash('sha256').update(s).digest('hex'),proof={version:'public-albums-v2',time:new Date().toISOString(),checks:[],cleaned:false,actual_wechat_device:'not available; UA and cookie-free transport verified'},spaces=[],albums=[],photos=[];
const ua='Mozilla/5.0 (Linux; Android 14) Mobile MicroMessenger/8.0';
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNsYGhgYGBgYmBgYGBgAAAMKgEEhS+DLgAAAABJRU5ErkJggg==','base64');
async function req(path,{body,admin=false,status=200}={}){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{...(admin?{Authorization:'Bearer '+token}:{}),...(body?{Origin:origin}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),'User-Agent':ua},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});assert.equal(r.status,status,path+' '+await r.clone().text().then(s=>s.slice(0,200)));return r}
const data=async(path,options)=> (await req(path,options)).json();
const command=body=>data('/api/admin/albums',{body,admin:true});
function upload(id,name='',key='a'.repeat(32)){const f=new FormData();f.set('id',id);f.set('file',new File([image],'synthetic-v2.png',{type:'image/png'}));f.set('preview',new File([image],'preview.png',{type:'image/png'}));f.set('width','2');f.set('height','2');f.set('author_name',name);f.set('submission_key',key);return f}
try{
 sql(`INSERT INTO administrator_sessions(token_hash,admin_id,credential_version,expires_at) SELECT '${hash(token)}',id,credential_version,${Date.now()+600000} FROM administrator WHERE id='primary'`);
 const baseline=JSON.parse(sql("SELECT value FROM settings WHERE key='public_albums_0022_baseline'")[0].value);
 for(const table of baseline.tables){const rows=sql(table.query);assert.equal(hash(JSON.stringify(rows)),table.sha256,'Historical '+table.name+' changed')}
 proof.checks.push('historical-albums-photos-comments-and-uploader-fields-preserved');
 const old=sql("SELECT id FROM class_albums WHERE class_id='yi68' AND published=1 ORDER BY id LIMIT 1");if(old.length){await req('/albums/'+old[0].id);proof.legacy_url=origin+'/albums/'+old[0].id}
 await req('/api/admin/albums',{status:401});await req('/api/admin/albums/classes',{body:{name:'forbidden',visibility:'public'},status:401});
 for(const visibility of ['public','link']){
  const c=await data('/api/admin/albums/classes',{admin:true,body:{name:'公共相册合成验收'+visibility,description:'自动清理的测试空间',visibility}});spaces.push(c.id);
  const a=await command({action:'create',class_id:c.id,info:{title:'隔离测试相册',activity_date:'1970-01-01'}});albums.push(a.id);await command({action:'publish',id:a.id,confirmed:true});
  const id=randomUUID();photos.push(id);await req('/api/albums/'+a.id+'/photos',{body:upload(id)});await req('/api/albums/'+a.id+'/photos',{body:upload(id)});
  const row=sql(`SELECT * FROM class_album_photos WHERE id='${id}'`)[0];assert.equal(row.uploaded_by,null);assert(row.object_key.startsWith('albums/'+c.id+'/'+a.id+'/'));assert.equal(hash(Buffer.from(await(await req('/api/albums/photos/'+id)).arrayBuffer())),row.checksum);assert.equal(row.size,image.length);
  const check=spawnSync('pnpm',['exec','wrangler','r2','object','get','yi68-character-survey-media/'+row.object_key,'--remote','--pipe'],{maxBuffer:1024*1024});assert.equal(check.status,0);assert.equal(hash(check.stdout),row.checksum);
  const read=await data('/api/albums/'+a.id);assert.equal(read.photos.length,1);assert.equal(read.album.class_id,c.id);assert.equal(read.photos[0].uploaded_by_name,row.uploaded_by_name);
  const nickname=row.uploaded_by_name;assert(nickname.length>0);proof.random_artist=nickname;
  const cp='/api/albums/photos/'+id+'/comments',cid=randomUUID(),comment={action:'create',id:cid,submission_key:'b'.repeat(32),author_name:nickname,content:'合成纯文本 <script>test</script>'};await req(cp,{body:comment});await req(cp,{body:comment});let d=await data(cp);assert.equal(d.comments.length,1);assert.equal(d.comments[0].author_name,nickname);assert.equal(d.comments[0].content,comment.content);assert.equal(d.comments[0].can_delete,false);
  await req('/api/albums/photos/'+id+'/report',{body:{comment_id:cid,reason:'合成验收举报'}});const report=await data('/api/admin/albums/reports',{admin:true});assert(report.reports.some(r=>r.comment_id===cid&&r.class_id===c.id));
  await req('/api/admin/albums/photos/'+id+'/comments',{admin:true,body:{action:'hide',id:cid}});assert.equal((await data(cp)).comments.length,0);await req('/api/admin/albums/photos/'+id+'/comments',{admin:true,body:{action:'restore',id:cid}});assert.equal((await data(cp)).comments.length,1);
  await command({action:'settings',id:a.id,uploads_open:false,comments_open:false});await req('/api/albums/'+a.id+'/photos',{body:upload(randomUUID()),status:409});await req(cp,{body:{...comment,id:randomUUID()},status:409});await command({action:'settings',id:a.id,uploads_open:true,comments_open:true});
 }
 const directory=await data('/api/albums/classes');assert(directory.classes.some(c=>c.id===spaces[0]));assert(!directory.classes.some(c=>c.id===spaces[1]));
 const recent=await data('/api/albums/recent');assert(recent.photos.some(p=>p.id===photos[0]));assert(!recent.photos.some(p=>p.id===photos[1]));
 const classA=await data('/api/albums/classes/'+spaces[0]),classB=await data('/api/albums/classes/'+spaces[1]);assert.equal(classA.albums[0].id,albums[0]);assert.equal(classB.albums[0].id,albums[1]);
 const html=await(await req('/albums')).text();assert(html.includes('班级目录')&&html.includes('最近照片'));const detail=await(await req('/albums/'+albums[0]+'?photo='+photos[0])).text();assert(detail.includes('无需登录')&&!detail.includes('登录并上传照片'));
 await command({action:'hide_photo',id:albums[0],photo_id:photos[0]});await req('/api/albums/photos/'+photos[0],{status:404});await command({action:'restore_photo',id:albums[0],photo_id:photos[0]});
 await data('/api/admin/albums/classes',{admin:true,body:{id:spaces[1],name:'测试归档',visibility:'link',status:'archived'}});await req('/api/albums/'+albums[1],{status:404});
 for(const p of ['/','/survey/talent','/song-request','/survey/drinks','/survey/boys-day','/admin/albums'])await req(p);
 proof.checks.push('admin-created-independent-classes-and-empty-activity-albums','anonymous-upload-and-idempotent-retry','actual-R2-readback-SHA256','anonymous-comments-and-signatures','public-directory-and-recent-exclude-link-class','plain-text-comments-moderation-reports','upload-comment-pause','photo-hide-restore','class-archive-denial','anonymous-management-denied','WeChat-UA-no-cookie-submit','existing-surveys-and-song-smoke');
 proof.test_class_urls=spaces.map(s=>origin+'/albums/classes/'+s);
}finally{
 for(const id of albums){await command({action:'delete_album',id});assert.equal(sql(`SELECT COUNT(*) n FROM class_album_photos WHERE album_id='${id}'`)[0].n,0)}
 for(const id of spaces)sql(`DELETE FROM album_classes WHERE id='${id}' AND NOT EXISTS(SELECT 1 FROM class_albums WHERE class_id='${id}')`);
 sql(`DELETE FROM administrator_sessions WHERE token_hash='${hash(token)}'`);proof.cleaned=true;
}
sql("INSERT INTO settings(key,value) VALUES ('"+marker+"','"+JSON.stringify(proof).replace(/'/g,"''")+"')");console.log(JSON.stringify(proof));
