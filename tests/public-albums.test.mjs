import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash,randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync,readdirSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const root=process.cwd(),require=createRequire(import.meta.url),paths=[dirname(require.resolve('wrangler/package.json'))];
const {build}=require(require.resolve('esbuild',{paths})),{Miniflare}=require(require.resolve('miniflare',{paths}));
const dir=mkdtempSync(resolve(tmpdir(),'yi68-albums-')),sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
 if(f.startsWith('0022')){
 sqlite.exec("INSERT INTO class_roster VALUES ('0000000099','历史同学',1);INSERT INTO student_accounts VALUES ('legacy-account','0000000099','unused','active','student','now','now');INSERT INTO class_albums VALUES ('legacy-album','旧相册','2026-11-20','秋季','',1,'legacy-photo','now','now');INSERT INTO class_album_photos(id,album_id,filename,mime,size,checksum,object_key,thumbnail_key,thumbnail_size,width,height,position,created_at,uploaded_by,uploaded_by_name) VALUES ('legacy-photo','legacy-album','历史.jpg','image/jpeg',100,'hash','legacy/full','legacy/thumb',20,10,10,0,'now','legacy-account','历史同学');INSERT INTO class_album_comments VALUES ('legacy-comment','legacy-photo','legacy-account','历史同学','历史留言','now')");
 }
 sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
}
function prepared(sql,params=[]){return {bind(...p){return prepared(sql,p)},async first(){return sqlite.prepare(sql).get(...params)||null},async all(){return {results:sqlite.prepare(sql).all(...params)}},async run(){const r=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}}}}}
const db={prepare:prepared,async batch(s){sqlite.exec('BEGIN');try{const r=[];for(const a of s)r.push(await a.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',r2Buckets:['MEDIA']});
let failPut=false,failDelete=false;
const token='b'.repeat(64),tokenHash=createHash('sha256').update(token).digest('hex'),origin='https://yi68.test';
const get=(path,admin=false)=>new Request(origin+'/api/'+(admin?'admin/':'')+'albums/'+path.join('/'),{headers:admin?{Authorization:'Bearer '+token}:{}});
const post=p=>new Request(origin+'/api/admin/albums',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(p)});
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNsYGhgYGBgYmBgYGBgAAAMKgEEhS+DLgAAAABJRU5ErkJggg==','base64');
function upload(album,id=randomUUID(),bytes=image,mime='image/png') {const f=new FormData();f.set('file',new File([bytes],'example.png',{type:mime}));f.set('preview',new File([image],'preview.png',{type:'image/png'}));f.set('width','960');f.set('height','640');f.set('id',id);return new Request(origin+`/api/admin/albums/${album}/photos`,{method:'POST',headers:{Authorization:'Bearer '+token,Origin:origin},body:f})}
try{
 const r2=await mf.getR2Bucket('MEDIA');globalThis.__albumEnv={DB:db,FAVORITE_CHARACTER_MEDIA:r2};
 const outfile=resolve(dir,'app.mjs');await build({stdin:{contents:`export * from './lib/albums';export * from './lib/artist-names';`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,platform:'node',format:'esm',outfile,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onResolve({filter:/^next\/headers$/},()=>({path:'headers',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='env'?'export const env=globalThis.__albumEnv':'export async function headers(){return new Headers()}'}))}}]});
 const app=await import(pathToFileURL(outfile).href);
 sqlite.prepare('INSERT INTO administrator VALUES (?,?,?,?,?)').run('primary','admin','unused','test','now');sqlite.prepare('INSERT INTO administrator_sessions VALUES (?,?,?,?)').run(tokenHash,'primary','test',Date.now()+600000);
 assert.equal(app.ARTIST_NAMES.length,200);assert.equal(new Set(app.ARTIST_NAMES).size,200);for(let i=0;i<200;i++)assert.notEqual(app.randomArtist(app.ARTIST_NAMES[i]),app.ARTIST_NAMES[i]);assert.throws(()=>app.displaySignature('<script>'));assert.throws(()=>app.displaySignature('x'.repeat(31)));assert.throws(()=>app.displaySignature('a\u202Eb'));
 assert.equal(sqlite.prepare("SELECT class_id,indexed FROM class_albums WHERE id='legacy-album'").get().class_id,'yi68');assert.equal(sqlite.prepare("SELECT indexed FROM class_albums WHERE id='legacy-album'").get().indexed,0);assert.equal(sqlite.prepare("SELECT author_name FROM class_album_comments WHERE id='legacy-comment'").get().author_name,'历史同学');assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal((await app.readAlbum('legacy-album')).photos[0].uploaded_by_name,'历史同学');
 const command=async(input,path=[])=>{const r=await app.albumPost(post(input),path);assert.equal(r.status,200,await r.clone().text());return r.json()};
 const getData=async(path)=>{const r=await app.albumGet(get(path),path);assert.equal(r.status,200,await r.clone().text());return r.json()};
 const space=(await command({name:'第二班',description:'独立班级',visibility:'link'},['classes'])).id;
 assert.equal((await getData(['classes'])).classes.length,1);assert.equal((await getData(['classes',space])).space.name,'第二班');
 const album=(await command({action:'create',class_id:space,info:{title:'新活动',activity_date:'2026-11-21'}})).id;
 await command({action:'publish',id:album,confirmed:true});
 const photo=randomUUID(),key='e'.repeat(32);
 function anonUpload(id=photo,signature='',submission=key){const r=upload(album,id);r.headers.delete('Authorization');return r.formData().then(f=>{f.set('author_name',signature);f.set('submission_key',submission);return new Request(origin+'/api/albums/'+album+'/photos',{method:'POST',headers:{Origin:origin},body:f})})}
 let r=await app.albumStudentPost(await anonUpload(),[album,'photos']);assert.equal(r.status,200,await r.text());
 const saved=sqlite.prepare('SELECT * FROM class_album_photos WHERE id=?').get(photo);assert.equal(saved.uploaded_by,null);assert(app.ARTIST_NAMES.includes(saved.uploaded_by_name));assert(saved.object_key.startsWith('albums/'+space+'/'+album+'/'));assert.deepEqual(new Uint8Array(await(await r2.get(saved.object_key)).arrayBuffer()),new Uint8Array(image));
 assert.equal((await app.albumStudentPost(await anonUpload(),[album,'photos'])).status,200);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM class_album_photos WHERE album_id=?').get(album).n,1);
 assert.equal((await app.albumStudentPost(await anonUpload(photo,'冒用','f'.repeat(32)),[album,'photos'])).status,409);
 assert.equal((await app.recentPhotos()).length,0);assert.equal((await getData(['classes','yi68'])).albums.length,1);assert.equal((await getData(['classes',space])).albums[0].id,album);assert.equal((await getData([])).albums.some(a=>a.id===album),false);
 await command({id:space,name:'第二班',visibility:'public'},['classes']);assert.equal((await app.recentPhotos()).length,1);
 const cp=['photos',photo,'comments'],commentId=randomUUID(),body={action:'create',id:commentId,submission_key:key,author_name:'自愿署名',content:'<script>alert(1)</script> 纯文本 🎨'};
 function comment(input){return app.albumStudentPost(new Request(origin+'/api/albums/'+cp.join('/'),{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)}),cp)}
 r=await comment(body);assert.equal(r.status,200,await r.text());assert.equal((await comment(body)).status,200);assert.equal((await getData(cp)).comments[0].author_name,'自愿署名');assert.equal((await getData(cp)).comments[0].can_delete,false);assert.equal((await comment({...body,id:randomUUID(),content:'字'.repeat(501)})).status,400);
 await command({action:'hide',id:commentId},cp);assert.equal((await getData(cp)).comments.length,0);await command({action:'restore',id:commentId},cp);assert.equal((await getData(cp)).comments.length,1);
 const reportRequest=new Request(origin+'/api/albums/photos/'+photo+'/report',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({reason:'隐私撤回',comment_id:commentId})});assert.equal((await app.albumStudentPost(reportRequest,['photos',photo,'report'])).status,200);
 assert.equal((await app.albumGet(get(['reports']),['reports'],true)).status,401);assert.equal((await app.albumPost(post({name:'恶意班级',visibility:'public'}),['classes'])).status,200);
 for(const action of ['create','delete_photo','hide_photo']){const req=post({action,id:album});req.headers.delete('Authorization');assert.equal((await app.albumPost(req,[])).status,401)}
 assert.equal((await app.albumGet(get(['reports']),['reports'])).status,404);
 await command({action:'hide_photo',id:album,photo_id:photo});assert.equal((await app.albumGet(get(['photos',photo]),['photos',photo])).status,404);assert.equal((await app.recentPhotos()).length,0);assert.equal((await app.albumGet(get(cp),cp)).status,404);await command({action:'restore_photo',id:album,photo_id:photo});
 await command({action:'settings',id:album,uploads_open:false,comments_open:false});assert.equal((await app.albumStudentPost(await anonUpload(randomUUID()),[album,'photos'])).status,409);assert.equal((await comment({...body,id:randomUUID()})).status,409);
 await command({action:'settings',id:album,uploads_open:true,comments_open:true});globalThis.__albumEnv.PUBLIC_ALBUM_POSTS='off';assert.equal((await comment({...body,id:randomUUID()})).status,503);globalThis.__albumEnv.PUBLIC_ALBUM_POSTS='on';
 for(const state of ['hidden','archived']){await command({id:space,name:'第二班',visibility:'public',status:state},['classes']);assert.equal((await app.albumGet(get([album]),[album])).status,404);assert.equal((await app.recentPhotos()).length,0)}
 await command({id:space,name:'第二班',visibility:'public',status:'active'},['classes']);
 for(let i=0;i<8;i++){r=await comment({...body,id:randomUUID()});if(r.status===429)break}assert.equal((await comment({...body,id:randomUUID()})).status,429);
 const invalid=await anonUpload(randomUUID());const badForm=await invalid.formData();badForm.set('file',new File([new Uint8Array([1,2,3])],'fake.png',{type:'image/png'}));assert.equal((await app.albumStudentPost(new Request(origin+'/api/albums/'+album+'/photos',{method:'POST',headers:{Origin:origin},body:badForm}),[album,'photos'])).status,400);
 const tooLarge=await anonUpload(randomUUID());tooLarge.headers.set('content-length',String(32*1024*1024));assert.equal((await app.albumStudentPost(tooLarge,[album,'photos'])).status,413);
 const bad=await anonUpload(randomUUID());bad.headers.set('Origin','https://evil.test');assert.equal((await app.albumStudentPost(bad,[album,'photos'])).status,403);
 // Export traverses its own keyset pages, independently of the 60-photo gallery.
 const extra=Array.from({length:205},()=>randomUUID());
 const duplicate=sqlite.prepare(`INSERT INTO class_album_photos(id,album_id,filename,mime,size,checksum,object_key,thumbnail_key,thumbnail_size,width,height,position,created_at)
 SELECT ?,album_id,filename,mime,size,checksum,object_key||hex(randomblob(16)),thumbnail_key||hex(randomblob(16)),thumbnail_size,width,height,position,created_at FROM class_album_photos WHERE id=?`);
 for(const id of extra)duplicate.run(id,photo);
 await command({action:'hide_photo',id:album,photo_id:extra[0]});
 async function exported(query,admin=false,auth=false){const req=new Request(origin+'/api/'+(admin?'admin/':'')+'albums/export?'+query,{headers:auth?{Authorization:'Bearer '+token}:{}});return app.albumGet(req,['export'],admin)}
 const query=new URLSearchParams({album_id:album});
 let page=await(await exported(query)).json();assert.equal(page.photos.length,200);assert(page.next_cursor);assert(!page.photos.some(p=>p.id===extra[0]));assert(!('object_key' in page.photos[0]));
 const first=page.photos.map(p=>p.id);query.set('after',page.next_cursor);query.set('snapshot',page.snapshot);
 const later=randomUUID();duplicate.run(later,photo);sqlite.prepare('UPDATE class_album_photos SET created_at=? WHERE id=?').run(new Date(Date.now()+60000).toISOString(),later);
 page=await(await exported(query)).json();assert.equal(page.photos.length,5);assert.equal(page.next_cursor,null);assert.equal(new Set([...first,...page.photos.map(p=>p.id)]).size,205);assert(!page.photos.some(p=>p.id===later));
 assert.equal((await exported(new URLSearchParams({album_id:album}),true)).status,401);
 const administratorPage=await(await exported(new URLSearchParams({album_id:album}),true,true)).json();assert.equal(administratorPage.photos.length,200);
 await command({action:'settings',id:album,indexed:false});assert.equal((await(await exported(new URLSearchParams({class_id:space}))).json()).photos.length,200);
 const draft=(await command({action:'create',class_id:space,info:{title:'草稿不公开',activity_date:'2026-11-22'}})).id;
 sqlite.prepare('UPDATE class_album_photos SET album_id=? WHERE id=?').run(draft,extra[1]);
 assert.equal((await exported(new URLSearchParams({album_id:draft}))).status,404);
 assert.equal((await(await exported(new URLSearchParams({album_id:draft}),true,true)).json()).photos.length,1);
 for(const status of ['hidden','archived']){await command({id:space,name:'第二班',visibility:'link',status},['classes']);assert.equal((await exported(new URLSearchParams({album_id:album}))).status,404);assert.equal((await exported(new URLSearchParams({class_id:space}))).status,404)}
 await command({id:space,name:'第二班',visibility:'link',status:'active'},['classes']);
 assert.equal((await exported(new URLSearchParams({class_id:space,album_id:album}))).status,400);assert.equal((await exported(new URLSearchParams({class_id:space,snapshot:'invalid'}))).status,400);
 sqlite.prepare('DELETE FROM class_album_photos WHERE id<>? AND (album_id=? OR album_id=?)').run(photo,album,draft);await command({action:'delete_album',id:draft});
 console.log('PASS export scope authorization; 205 visible photos over multiple pages; stable snapshot and keyset cursor; hidden/draft/archived exclusion; link-class access; admin-only unpublished export');
 await command({action:'delete_album',id:album});assert.equal(await r2.head(saved.object_key),null);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM album_reports').get().n,0);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM album_object_cleanup').get().n,0);
 console.log('PASS: 200 unique artists; historical album/comment migration; anonymous R2 upload and retry; class isolation; private/index visibility; comments, XSS-safe text, moderation and reports; administrator authorization; pause and global switches; origin, size and rate limits; database/R2 cleanup');
}finally{await mf.dispose();sqlite.close();rmSync(dir,{recursive:true,force:true})}
