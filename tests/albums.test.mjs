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
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
function prepared(sql,params=[]){return {bind(...p){return prepared(sql,p)},async first(){return sqlite.prepare(sql).get(...params)||null},async all(){return {results:sqlite.prepare(sql).all(...params)}},async run(){const r=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}}}}}
const db={prepare:prepared,async batch(s){sqlite.exec('BEGIN');try{const r=[];for(const a of s)r.push(await a.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',r2Buckets:['MEDIA']});
let failPut=false,failDelete=false;
const token='b'.repeat(64),tokenHash=createHash('sha256').update(token).digest('hex'),origin='https://yi68.test';
const get=(path,admin=false)=>new Request(origin+'/api/'+(admin?'admin/':'')+'albums/'+path.join('/'),{headers:admin?{Authorization:'Bearer '+token}:{}});
const post=p=>new Request(origin+'/api/admin/albums',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(p)});
const image=readFileSync('tests/fixtures/albums/smoke.jpg');
function upload(album,id=randomUUID(),bytes=image,mime='image/jpeg') {const f=new FormData();f.set('file',new File([bytes],'example.jpg',{type:mime}));f.set('preview',new File([image],'preview.jpg',{type:'image/jpeg'}));f.set('width','960');f.set('height','640');f.set('id',id);return new Request(origin+`/api/admin/albums/${album}/photos`,{method:'POST',headers:{Authorization:'Bearer '+token,Origin:origin},body:f})}
try{
 const r2=await mf.getR2Bucket('MEDIA');globalThis.__albumEnv={DB:db,FAVORITE_CHARACTER_MEDIA:{get:k=>r2.get(k),head:k=>r2.head(k),put:(...a)=>{if(failPut)throw Error('injected put failure');return r2.put(...a)},delete:k=>{if(failDelete)throw Error('injected delete failure');return r2.delete(k)}}};
 const outfile=resolve(dir,'app.mjs');await build({stdin:{contents:`export * from './lib/albums';export * from './lib/album-image';`,resolveDir:root,loader:'ts'},absWorkingDir:root,bundle:true,platform:'node',format:'esm',outfile,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onResolve({filter:/^next\/headers$/},()=>({path:'headers',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='env'?'export const env=globalThis.__albumEnv':'export async function headers(){return new Headers()}'}))}}]});
 const app=await import(pathToFileURL(outfile).href);
 sqlite.prepare('INSERT INTO administrator VALUES (?,?,?,?,?)').run('primary','admin','unused','test','now');sqlite.prepare('INSERT INTO administrator_sessions VALUES (?,?,?,?)').run(tokenHash,'primary','test',Date.now()+600000);
 assert.equal((await app.albumGet(get([],false),[],true)).status,401);assert.equal((await app.albumPost(new Request(origin+'/api/admin/albums',{method:'POST'}),[])).status,401);
 let r=await app.albumPost(post({action:'create',info:{title:'相册测试',activity_date:'2026-11-20',description:'介绍'}}),[]);assert.equal(r.status,200);const album=(await r.json()).id;
 const ids=[randomUUID(),randomUUID()];for(const id of ids){r=await app.albumPost(upload(album,id),[album,'photos']);assert.equal(r.status,200,await r.text())}
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM class_album_photos').get().n,2);
 const row=sqlite.prepare('SELECT * FROM class_album_photos WHERE id=?').get(ids[0]);assert.equal((await r2.head(row.object_key)).size,row.size);assert.equal(createHash('sha256').update(new Uint8Array(await (await r2.get(row.object_key)).arrayBuffer())).digest('hex'),row.checksum);
 assert.equal((await app.albumGet(get([album]),[album])).status,404);assert.equal((await app.albumGet(get(['photos',ids[0]]),['photos',ids[0]])).status,404);assert.deepEqual((await (await app.albumGet(get([]),[])).json()).albums,[]);assert.equal((await app.albumGet(get(['photos',ids[0]],true),['photos',ids[0]],true)).status,200);
 console.log('PASS administrator batch uploads; actual private R2 originals/previews and D1 indexes; anonymous drafts and management denied');
 assert.equal((await app.albumPost(post({action:'publish',id:album}),[])).status,400);
 assert.equal((await app.albumPost(post({action:'cover',id:album,photo_id:ids[1]}),[])).status,200);assert.equal((await app.albumPost(post({action:'reorder',id:album,photo_ids:[...ids].reverse()}),[])).status,200);
 assert.equal((await app.albumPost(post({action:'publish',id:album,confirmed:true}),[])).status,200);
 const data=await (await app.albumGet(get([album]),[album])).json();assert.equal(data.album.cover_photo_id,ids[1]);assert.equal(data.photos[0].id,ids[1]);assert.equal(data.album.semester,'2026-2027学年秋季');
 r=await app.albumGet(get(['photos',ids[0]]),['photos',ids[0]]);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new Uint8Array(image));
 r=await app.albumMedia(new Request(origin+'/api/albums/photos/'+ids[0]+'?download=1'),ids[0]);assert.match(r.headers.get('Content-Disposition'),/attachment/);

 const students=[{id:randomUUID(),student_id:'0000000018',name:'合成学生甲',token:'c'.repeat(64)},{id:randomUUID(),student_id:'0000000019',name:'合成学生乙',token:'d'.repeat(64)}];
 for(const s of students){sqlite.prepare('INSERT INTO class_roster VALUES (?,?,1)').run(s.student_id,s.name);sqlite.prepare('INSERT INTO student_accounts VALUES (?,?,?,\'active\',\'student\',?,?)').run(s.id,s.student_id,'unused','now','now');sqlite.prepare('INSERT INTO student_sessions VALUES (?,?,?)').run(createHash('sha256').update(s.token).digest('hex'),s.id,Date.now()+600000)}
 function studentRequest(path,body,who=students[0],cookie=false){return new Request(origin+'/api/albums/'+path.join('/'),{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(who?(cookie?{Cookie:'__Host-yi68_session='+who.token}:{Authorization:'Bearer '+who.token}):{})},body:JSON.stringify(body)})}
 function studentUpload(id,who=students[0]){const r=upload(album,id);r.headers.set('Authorization','Bearer '+who.token);return r}
 const added=[randomUUID(),randomUUID()];
 for(const id of added){r=await app.albumStudentPost(studentUpload(id),[album,'photos']);assert.equal(r.status,200,await r.text());assert.equal((await app.albumGet(get(['photos',id]),['photos',id])).status,200)}
 const own=sqlite.prepare('SELECT * FROM class_album_photos WHERE id=?').get(added[0]);assert.equal(own.uploaded_by,students[0].id);assert.equal(own.uploaded_by_name,students[0].name);assert.equal((await r2.head(own.object_key)).size,own.size);
 const listed=await (await app.albumGet(get([album],true),[album],true)).json();assert.equal(listed.photos.find(p=>p.id===added[0]).uploaded_by_name,students[0].name);
 const publicPhotos=(await (await app.albumGet(get([album]),[album])).json()).photos;assert(!('uploaded_by_name' in publicPhotos[0]));
 const anonymousUpload=studentUpload(randomUUID());anonymousUpload.headers.delete('Authorization');assert.equal((await app.albumStudentPost(anonymousUpload,[album,'photos'])).status,401);
 assert.equal((await app.albumPost(studentUpload(randomUUID()),[album,'photos'])).status,401);
 assert.equal((await app.albumStudentPost(studentRequest([],{action:'delete_photo',id:album,photo_id:ids[0]}),[])).status,403);
 const commentPath=['photos',added[0],'comments'],otherPath=['photos',added[1],'comments'];
 assert.equal((await app.albumStudentPost(studentRequest(commentPath,{action:'create',content:'匿名'},null),commentPath)).status,401);
 assert.equal((await app.albumStudentPost(studentRequest(commentPath,{action:'create',content:'   '}),commentPath)).status,400);
 assert.equal((await app.albumStudentPost(studentRequest(commentPath,{action:'create',content:'字'.repeat(501)}),commentPath)).status,400);
 const text='<script>alert(1)</script> 一起记录 🎨😊';
 r=await app.albumStudentPost(studentRequest(commentPath,{action:'create',content:text},students[0],true),commentPath);assert.equal(r.status,200);const firstComment=(await r.json()).id;
 let comments=await (await app.albumGet(get(commentPath),commentPath)).json();assert.equal(comments.comments[0].content,text);assert.equal(comments.comments[0].author_name,students[0].name);assert.equal(comments.comments[0].can_delete,false);assert(!('account_id' in comments.comments[0]));assert.equal(comments.viewer.can_comment,false);
 const ownGet=get(commentPath);ownGet.headers.set('Authorization','Bearer '+students[0].token);assert.equal((await (await app.albumGet(ownGet,commentPath)).json()).comments[0].can_delete,true);
 assert.equal((await (await app.albumGet(get(otherPath),otherPath)).json()).comments.length,0);
 assert.equal((await app.albumStudentPost(studentRequest(commentPath,{action:'delete',id:firstComment},students[1]),commentPath)).status,403);
 assert.equal((await app.albumStudentPost(studentRequest(otherPath,{action:'delete',id:firstComment}),otherPath)).status,404);
 assert.equal((await app.albumStudentPost(studentRequest(commentPath,{action:'delete',id:firstComment}),commentPath)).status,200);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM class_album_comments').get().n,0);
 r=await app.albumStudentPost(studentRequest(commentPath,{action:'create',content:'管理员可删除'}),commentPath);assert.equal(r.status,200);const adminDelete=(await r.json()).id;
 const adminCommentRequest=post({action:'delete',id:adminDelete});assert.equal((await app.albumPost(adminCommentRequest,commentPath)).status,200);
 for(let n=0;n<4;n++)assert.equal((await app.albumStudentPost(studentRequest(commentPath,{action:'create',content:'留言 '+n}),commentPath)).status,200);
 assert.equal((await app.albumStudentPost(studentRequest(commentPath,{action:'create',content:'触发防刷'}),commentPath)).status,429);
 assert.equal((await app.albumPost(post({action:'delete_photo',id:album,photo_id:added[0]}),[])).status,200);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM class_album_comments').get().n,0);assert.equal((await app.albumGet(get(commentPath),commentPath)).status,404);
 await app.albumPost(post({action:'delete_photo',id:album,photo_id:added[1]}),[]);
 console.log('PASS student published batch upload + D1/R2 attribution; anonymous/management denial; cookie and bearer comments; own/admin deletion; photo scoping, plain emoji text, length/rate limits and cascade');
 assert.equal((await app.albumPost(upload(album),[album,'photos'])).status,409);
 assert.equal((await app.albumPost(post({action:'unpublish',id:album}),[])).status,200);assert.equal((await app.albumGet(get(['photos',ids[0]]),['photos',ids[0]])).status,404);
 assert.equal((await app.albumStudentPost(studentUpload(randomUUID()),[album,'photos'])).status,404);
 console.log('PASS cover, reorder, publish confirmation, public listing/detail/download, immediate withdrawal and safe append policy');
 failPut=true;assert.equal((await app.albumPost(upload(album),[album,'photos'])).status,500);failPut=false;assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM class_album_photos').get().n,2);
 const failId=randomUUID();sqlite.exec(`CREATE TRIGGER reject_album_photo BEFORE INSERT ON class_album_photos WHEN NEW.id='${failId}' BEGIN SELECT RAISE(ABORT,'injected index failure');END`);assert.equal((await app.albumPost(upload(album,failId),[album,'photos'])).status,500);assert.equal(await r2.head(`albums/${album}/${failId}/original`),null);
 const retry=await app.albumPost(upload(album,ids[0]),[album,'photos']);assert.equal(retry.status,200);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM class_album_photos').get().n,2);
 const boundaryId=randomUUID(),boundary=new Uint8Array(30*1024*1024);boundary.set(image);const boundaryResponse=await app.albumPost(upload(album,boundaryId,boundary),[album,'photos']);assert.equal(boundaryResponse.status,200,await boundaryResponse.text());assert.equal(sqlite.prepare('SELECT size FROM class_album_photos WHERE id=?').get(boundaryId).size,boundary.length);await app.albumPost(post({action:'delete_photo',id:album,photo_id:boundaryId}),[]);
 const huge=new Uint8Array(30*1024*1024+1);assert.equal((await app.albumPost(upload(album,randomUUID(),huge),[album,'photos'])).status,413);
 const jpegWithMetadata=Buffer.concat([image.subarray(0,2),Buffer.from([255,225,0,15]),Buffer.from('GPS-PRIVATE!\0'),image.subarray(2)]);const clean=app.cleanAlbumImage(jpegWithMetadata,'image/jpeg');assert(!Buffer.from(clean).includes(Buffer.from('GPS-PRIVATE!')));assert.deepEqual(Buffer.from(clean),image);

 for(const [mime,encoded] of [['image/png','iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNsYGhgYGBgYmBgYGBgAAAMKgEEhS+DLgAAAABJRU5ErkJggg=='],['image/webp','UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD++LUX/zNDPJR5cP/SbPE2eJs+AAAA']]){const original=Buffer.from(encoded,'base64');assert.deepEqual(Buffer.from(app.cleanAlbumImage(original,mime)),original)}
 const orientation=Buffer.from([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);const oriented=Buffer.concat([image.subarray(0,2),orientation,image.subarray(2)]);assert.deepEqual(Buffer.from(app.cleanAlbumImage(oriented,'image/jpeg')),oriented);
 assert.throws(()=>app.cleanAlbumImage(new Uint8Array([1,2,3]),'image/png'));
 const foreign=new Request(origin+'/api/admin/albums',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://evil.test','Content-Type':'application/json'},body:'{}'});assert.equal((await app.albumPost(foreign,[])).status,403);
 console.log('PASS upload size and format bounds, metadata stripping, idempotent retry, R2/index failure cleanup and origin protection');
 failDelete=true;assert.equal((await app.albumPost(post({action:'delete_photo',id:album,photo_id:ids[0]}),[])).status,200);failDelete=false;assert.equal((await app.albumGet(get(['photos',ids[0]],true),['photos',ids[0]],true)).status,404);assert.ok(await r2.head(row.object_key));
 assert.equal((await app.albumPost(post({action:'delete_album',id:album}),[])).status,200);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM class_album_photos').get().n,0);assert.equal((await app.albumGet(get([album]),[album])).status,404);
 console.log('PASS deletion removes indexes first, failed object deletion stays private, album deletion removes associated photos');
}finally{await mf.dispose();sqlite.close();rmSync(dir,{recursive:true,force:true})}
