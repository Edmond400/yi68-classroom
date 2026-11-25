import {monitoredBucket} from './storage-telemetry';
import {emitEvent} from './site-telemetry';
import { env } from 'cloudflare:workers';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { database } from './data';
import { getAdministrator, requireAdministrator, rateLimit } from './administrator';
import { displaySignature } from './artist-names';
import { HttpError, json, fail, readJson, sameOrigin } from './http';
import { ALBUM_PHOTO_LIMIT, cleanAlbumImage } from './album-image';
import type { AlbumExportPage, AlbumExportPhoto } from './album-export';
export type AlbumPhoto={id:string;album_id:string;filename:string;mime:string;size:number;width:number;height:number;position:number;created_at:string;uploaded_by_name?:string;hidden?:number};
export type Album={id:string;title:string;activity_date:string;semester:string;description:string;published:number;cover_photo_id:string|null;photo_count:number;updated_at:string;class_id:string;indexed:number;archived:number;uploads_open:number;comments_open:number};
const photoColumns='id,album_id,filename,mime,size,width,height,position,created_at,uploaded_by_name,hidden';
const albumColumns=`a.*, (SELECT COUNT(*) FROM class_album_photos p WHERE p.album_id=a.id AND p.hidden=0) AS photo_count,
 COALESCE((SELECT p.id FROM class_album_photos p WHERE p.id=a.cover_photo_id AND p.album_id=a.id AND p.hidden=0),
 (SELECT p.id FROM class_album_photos p WHERE p.album_id=a.id AND p.hidden=0 ORDER BY p.position,p.created_at,p.id LIMIT 1)) AS cover_id`;
function bucket(){if(!env.FAVORITE_CHARACTER_MEDIA)throw new HttpError(503,'照片存储暂时不可用。');return monitoredBucket(env.FAVORITE_CHARACTER_MEDIA)}
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const idSchema=z.string().uuid();
const infoSchema=z.object({title:z.string().trim().min(1).max(120),activity_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d=>{const date=new Date(d+'T00:00:00Z');return Number.isFinite(+date)&&date.toISOString().slice(0,10)===d}),description:z.string().trim().max(4000).default('')});
export function albumSemester(date:string){const year=Number(date.slice(0,4)),month=Number(date.slice(5,7));const start=month>=9?year:year-1;return `${start}-${start+1}学年${month>=2&&month<=8?'春季':'秋季'}`}
const visibleAlbum="a.published=1 AND a.archived=0 AND c.status='active'";
export async function listClasses(admin=false,offset=0){return (await database().prepare(`SELECT c.*,(SELECT COUNT(*) FROM class_albums a WHERE a.class_id=c.id AND a.published=1 AND a.archived=0) AS album_count FROM album_classes c WHERE (?=1 OR (c.status='active' AND c.visibility='public')) ORDER BY c.created_at,c.id LIMIT 61 OFFSET ?`).bind(Number(admin),offset).all<any>()).results}
export async function readClass(id:string,admin=false){const row=await database().prepare("SELECT * FROM album_classes WHERE id=? AND (?=1 OR status='active')").bind(id,Number(admin)).first<any>();if(!row)throw new HttpError(404,'班级空间不存在或已隐藏。');return row}
export async function recentPhotos(offset=0){return (await database().prepare(`SELECT p.id,p.album_id,p.width,p.height,p.uploaded_by_name,a.title,c.name AS class_name FROM class_album_photos p JOIN class_albums a ON a.id=p.album_id JOIN album_classes c ON c.id=a.class_id WHERE ${visibleAlbum} AND a.indexed=1 AND c.visibility='public' AND p.hidden=0 ORDER BY p.created_at DESC,p.id DESC LIMIT 25 OFFSET ?`).bind(offset).all<any>()).results}
export async function listAlbums(admin=false,semester='',classId='',offset=0){
 const rows=(await database().prepare(`SELECT ${albumColumns} FROM class_albums a JOIN album_classes c ON c.id=a.class_id WHERE (?=1 OR (${visibleAlbum})) AND (?='' OR a.semester=?) AND (?='' OR a.class_id=?) AND (?=1 OR ?<>'' OR c.visibility='public') ORDER BY a.activity_date DESC,a.created_at DESC,a.id LIMIT 61 OFFSET ?`).bind(Number(admin),semester,semester,classId,classId,Number(admin),classId,offset).all<Album&{cover_id:string|null}>()).results;
 return rows.map(({cover_id,...a})=>({...a,cover_photo_id:cover_id}));
}
export async function readAlbum(id:string,admin=false,offset=0,focus=''){
 const album=await database().prepare(`SELECT ${albumColumns} FROM class_albums a JOIN album_classes c ON c.id=a.class_id WHERE a.id=? AND (?=1 OR (${visibleAlbum}))`).bind(id,Number(admin)).first<Album&{cover_id:string|null}>();
 if(!album)throw new HttpError(404,'相册不存在或尚未发布。');
 const photos=(await database().prepare(`SELECT ${photoColumns} FROM class_album_photos WHERE album_id=? AND (?=1 OR hidden=0) ORDER BY position,created_at,id LIMIT ? OFFSET ?`).bind(id,Number(admin),admin?5000:60,offset).all<AlbumPhoto>()).results;
 if(focus&&!photos.some(p=>p.id===focus)){const target=await database().prepare(`SELECT ${photoColumns} FROM class_album_photos WHERE album_id=? AND id=? AND (?=1 OR hidden=0)`).bind(id,focus,Number(admin)).first<AlbumPhoto>();if(target)photos.unshift(target)}
 const {cover_id,...rest}=album;return {album:{...rest,cover_photo_id:cover_id},photos,next_offset:photos.length>=60?offset+60:null};
}
async function signature(value:unknown){try{return displaySignature(value)}catch(e){throw new HttpError(400,(e as Error).message)}}
async function publicPosting(){if((env as any).PUBLIC_ALBUM_POSTS==='off')throw new HttpError(503,'公共投稿暂时暂停，请稍后再试。')}
async function removeObjects(keys:string[]){for(const key of keys)await database().prepare('INSERT OR IGNORE INTO album_object_cleanup VALUES (?,?)').bind(key,new Date().toISOString()).run();try{if(keys.length)await bucket().delete(keys);for(const key of keys)await database().prepare('DELETE FROM album_object_cleanup WHERE object_key=?').bind(key).run()}catch{console.error('album-private-object-cleanup-pending')}}
export async function cleanupAlbumObjects(){const rows=(await database().prepare('SELECT object_key FROM album_object_cleanup LIMIT 100').all<{object_key:string}>()).results;for(const row of rows){if(await database().prepare('SELECT id FROM class_album_photos WHERE object_key=? OR thumbnail_key=?').bind(row.object_key,row.object_key).first())continue;await removeObjects([row.object_key])}}

export async function writeAlbum(input:unknown){
 const p=z.object({action:z.enum(['create','update','publish','unpublish','cover','reorder','delete_photo','delete_album','settings','hide_photo','restore_photo']),id:idSchema.optional(),info:infoSchema.optional(),photo_id:idSchema.optional(),photo_ids:z.array(idSchema).max(5000).optional(),class_id:z.string().min(1).max(80).optional(),indexed:z.boolean().optional(),archived:z.boolean().optional(),uploads_open:z.boolean().optional(),comments_open:z.boolean().optional(),confirmed:z.boolean().optional()}).strict().parse(input),db=database(),now=new Date().toISOString();
 if(p.action==='create'){
  const info=infoSchema.parse(p.info),id=crypto.randomUUID();await readClass(p.class_id||'yi68',true);
  await db.prepare('INSERT INTO class_albums (id,title,activity_date,semester,description,created_at,updated_at,class_id,indexed) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,info.title,info.activity_date,albumSemester(info.activity_date),info.description,now,now,p.class_id||'yi68',1).run();return {ok:true,id};
 }
 const id=idSchema.parse(p.id),current=await readAlbum(id,true);
 if(p.action==='settings')await db.prepare('UPDATE class_albums SET indexed=?,archived=?,uploads_open=?,comments_open=?,updated_at=? WHERE id=?').bind(Number(p.indexed??!!current.album.indexed),Number(p.archived??!!current.album.archived),Number(p.uploads_open??!!current.album.uploads_open),Number(p.comments_open??!!current.album.comments_open),now,id).run();
 if(p.action==='hide_photo'||p.action==='restore_photo')await db.prepare('UPDATE class_album_photos SET hidden=? WHERE id=? AND album_id=?').bind(Number(p.action==='hide_photo'),idSchema.parse(p.photo_id),id).run();
 if(p.action==='update'){const info=infoSchema.parse(p.info);await db.prepare('UPDATE class_albums SET title=?,activity_date=?,semester=?,description=?,updated_at=? WHERE id=?').bind(info.title,info.activity_date,albumSemester(info.activity_date),info.description,now,id).run()}
 if(p.action==='publish'){
  if(!p.confirmed)throw new HttpError(400,'请确认所有照片适合公开展示。');
  
  // Only publish complete objects. New uploads are restricted to draft albums.
  const rows=(await db.prepare('SELECT object_key,thumbnail_key,size,thumbnail_size FROM class_album_photos WHERE album_id=?').bind(id).all<any>()).results;
  for(const row of rows){const [full,thumb]=await Promise.all([bucket().head(row.object_key),bucket().head(row.thumbnail_key)]);if(!full||!thumb||full.size!==row.size||thumb.size!==row.thumbnail_size)throw new HttpError(409,'有照片上传未完成，请删除该照片后重新上传。')}
  await db.prepare('UPDATE class_albums SET published=1,updated_at=? WHERE id=?').bind(now,id).run();
 }
 if(p.action==='unpublish')await db.prepare('UPDATE class_albums SET published=0,updated_at=? WHERE id=?').bind(now,id).run();
 if(p.action==='cover'){
  const photo=idSchema.parse(p.photo_id);if(!current.photos.some(x=>x.id===photo))throw new HttpError(400,'封面照片不在此相册。');
  await db.prepare('UPDATE class_albums SET cover_photo_id=?,updated_at=? WHERE id=?').bind(photo,now,id).run();
 }
 if(p.action==='reorder'){
  const ids=z.array(idSchema).parse(p.photo_ids),existing=new Set(current.photos.map(x=>x.id));
  if(ids.length!==existing.size||new Set(ids).size!==existing.size||ids.some(x=>!existing.has(x)))throw new HttpError(409,'照片列表已变化，请刷新后重试。');
  await db.batch([...ids.map((photo,n)=>db.prepare('UPDATE class_album_photos SET position=? WHERE id=? AND album_id=?').bind(n,photo,id)),db.prepare('UPDATE class_albums SET updated_at=? WHERE id=?').bind(now,id)]);
 }
 if(p.action==='delete_photo'){
  const photo=idSchema.parse(p.photo_id),row=await db.prepare('SELECT object_key,thumbnail_key FROM class_album_photos WHERE id=? AND album_id=?').bind(photo,id).first<any>();if(!row)throw new HttpError(404,'照片不存在。');
  await db.batch([db.prepare('DELETE FROM class_album_photos WHERE id=? AND album_id=?').bind(photo,id),db.prepare('UPDATE class_albums SET cover_photo_id=CASE WHEN cover_photo_id=? THEN NULL ELSE cover_photo_id END,updated_at=? WHERE id=?').bind(photo,now,id)]);
  await removeObjects([row.object_key,row.thumbnail_key]);
 }
 if(p.action==='delete_album'){
  const rows=(await db.prepare('SELECT object_key,thumbnail_key FROM class_album_photos WHERE album_id=?').bind(id).all<any>()).results;
  await db.batch([db.prepare('DELETE FROM class_album_photos WHERE album_id=?').bind(id),db.prepare('DELETE FROM class_albums WHERE id=?').bind(id)]);
  for(let n=0;n<rows.length;n+=100)await removeObjects(rows.slice(n,n+100).flatMap(x=>[x.object_key,x.thumbnail_key]));
 }
 return {ok:true,id};
}
export async function uploadAlbumPhoto(request:Request,albumId:string,anonymous=false){
 sameOrigin(request);const current=await readAlbum(albumId,!anonymous);if(anonymous){await publicPosting();if(!current.album.uploads_open)throw new HttpError(409,'此相册已暂停投稿。');await rateLimit(request,'public-album-upload',30,600)}
 if(!anonymous&&current.album.published)throw new HttpError(409,'请先撤回发布，再追加照片。');
 const limit=ALBUM_PHOTO_LIMIT+1024*1024;
 if(Number(request.headers.get('content-length')||0)>limit)throw new HttpError(413,'每张照片最大 30 MiB。');
 if(!request.body||!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw new HttpError(400,'请通过照片上传表单提交。');
 // Bound the multipart stream without retaining a second full request buffer.
 let received=0;
 const body=request.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){received+=chunk.length;if(received>limit)throw new HttpError(413,'每张照片最大 30 MiB。');controller.enqueue(chunk)}}));
 const form=await new Response(body,{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();
 const file=form.get('file'),preview=form.get('preview'),id=idSchema.parse(form.get('id'));
 if(!(file instanceof File)||!(preview instanceof File)||!file.size||file.size>ALBUM_PHOTO_LIMIT||!preview.size||preview.size>512*1024)throw new HttpError(413,'每张照片最大 30 MiB，预览图最大 512 KiB。');
 const width=z.coerce.number().int().min(1).max(60000).parse(form.get('width')),height=z.coerce.number().int().min(1).max(60000).parse(form.get('height'));
 const name=anonymous?await signature(form.get('author_name')):'管理员',submission=anonymous?z.string().regex(/^[a-f0-9]{32,64}$/).parse(form.get('submission_key')):'admin';const submissionHash=hash(new TextEncoder().encode(submission));
 const db=database(),existing=await db.prepare('SELECT id,album_id,submission_hash FROM class_album_photos WHERE id=?').bind(id).first<any>();
 if(existing){if(existing.album_id!==albumId||(anonymous&&existing.submission_hash!==submissionHash))throw new HttpError(409,'上传标识冲突。');return {ok:true,id}}
 const full=cleanAlbumImage(new Uint8Array(await file.arrayBuffer()),file.type),thumb=cleanAlbumImage(new Uint8Array(await preview.arrayBuffer()),preview.type);
 const checksum=hash(full),key=`albums/${current.album.class_id}/${albumId}/${id}/${submissionHash}/${checksum}/original`,thumbKey=`albums/${current.album.class_id}/${albumId}/${id}/${submissionHash}/${checksum}/preview`,store=bucket();
 const filename=file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,180)||'photo';
 try{
  await store.put(key,full,{httpMetadata:{contentType:file.type},customMetadata:{sha256:checksum}});
  await store.put(thumbKey,thumb,{httpMetadata:{contentType:preview.type}});
  const [saved,savedThumb]=await Promise.all([store.head(key),store.head(thumbKey)]);if(saved?.size!==full.length||savedThumb?.size!==thumb.length)throw new Error('Album object write incomplete');
  const now=new Date().toISOString();
  const result=await db.prepare(`INSERT INTO class_album_photos (id,album_id,filename,mime,size,checksum,object_key,thumbnail_key,thumbnail_size,width,height,position,created_at,uploaded_by,uploaded_by_name,submission_hash)
   SELECT ?,id,?,?,?,?,?,?,?,?,?,COALESCE((SELECT MAX(position)+1 FROM class_album_photos WHERE album_id=?),0),?,?,?,? FROM class_albums WHERE id=? AND published=? AND (?=0 OR (uploads_open=1 AND archived=0 AND EXISTS(SELECT 1 FROM album_classes c WHERE c.id=class_albums.class_id AND c.status='active')))`).bind(id,filename,file.type,full.length,checksum,key,thumbKey,thumb.length,width,height,albumId,now,null,name,submissionHash,albumId,Number(anonymous),Number(anonymous)).run();
  if(!result.meta.changes)throw new HttpError(409,'相册发布状态已变化或相册被删除，请刷新后重试。');
  void emitEvent({id:'album-upload:'+id,event_name:'upload_success',module_id:'albums',file_count:2,bytes:full.length+thumb.length});
 }catch(error){
  // A failed response can follow a committed insert; never delete referenced bytes.
  let committed;try{committed=await db.prepare('SELECT id FROM class_album_photos WHERE id=?').bind(id).first()}catch{throw error}
  if(committed){const saved=await db.prepare('SELECT submission_hash,object_key,thumbnail_key FROM class_album_photos WHERE id=? AND album_id=?').bind(id,albumId).first<any>();if(saved?.submission_hash===submissionHash){await removeObjects([key,thumbKey].filter(k=>k!==saved.object_key&&k!==saved.thumbnail_key));return {ok:true,id}}await removeObjects([key,thumbKey]);throw new HttpError(409,'上传标识冲突。')}await removeObjects([key,thumbKey]);throw error;
 }
 return {ok:true,id};
}
async function commentPhoto(id:string,admin=false){
 idSchema.parse(id);const photo=await database().prepare(`SELECT p.id,a.comments_open FROM class_album_photos p JOIN class_albums a ON a.id=p.album_id JOIN album_classes c ON c.id=a.class_id WHERE p.id=? AND (?=1 OR (${visibleAlbum} AND p.hidden=0))`).bind(id,Number(admin)).first<any>();
 if(!photo)throw new HttpError(404,'照片不存在或尚未发布。');return photo;
}
export async function albumComments(request:Request,photoId:string,admin=false){
 const photo=await commentPhoto(photoId,admin),administrator=await getAdministrator(request),offset=pageOffset(request);
 const rows=(await database().prepare('SELECT id,author_name,content,created_at,hidden FROM class_album_comments WHERE photo_id=? AND (?=1 OR hidden=0) ORDER BY created_at,id LIMIT 61 OFFSET ?').bind(photoId,Number(admin),offset).all<any>()).results;
 return {comments:rows.slice(0,60).map(row=>({...row,can_delete:!!administrator})),next_offset:rows.length>60?offset+60:null,viewer:{name:null,can_comment:!!photo.comments_open&&((env as any).PUBLIC_ALBUM_POSTS!=='off'),is_admin:!!administrator}};
}
async function commentPost(request:Request,photoId:string,admin=false){
 const input=await readJson(request),db=database();
 if(admin){await requireAdministrator(request);await commentPhoto(photoId,true);const id=idSchema.parse(input.id);if(!['delete','hide','restore'].includes(input.action))throw new HttpError(400,'操作无效。');
 if(input.action==='delete')await db.prepare('DELETE FROM class_album_comments WHERE id=? AND photo_id=?').bind(id,photoId).run();else await db.prepare('UPDATE class_album_comments SET hidden=? WHERE id=? AND photo_id=?').bind(Number(input.action==='hide'),id,photoId).run();return {ok:true}}
 await publicPosting();const photo=await commentPhoto(photoId);if(!photo.comments_open)throw new HttpError(409,'此相册已暂停评论。');
 const p=z.object({action:z.literal('create'),id:idSchema,submission_key:z.string().regex(/^[a-f0-9]{32,64}$/),author_name:z.string().max(100).optional(),content:z.string().trim().min(1).refine(s=>Array.from(s).length<=500)}).strict().parse(input);
 const submissionHash=hash(new TextEncoder().encode(p.submission_key)),existing=await db.prepare('SELECT photo_id,submission_hash FROM class_album_comments WHERE id=?').bind(p.id).first<any>();if(existing){if(existing.photo_id!==photoId||existing.submission_hash!==submissionHash)throw new HttpError(409,'提交标识冲突。');return {ok:true,id:p.id}}
 await rateLimit(request,'public-album-comment',8,60);const name=await signature(p.author_name);
 const result=await db.prepare(`INSERT INTO class_album_comments(id,photo_id,account_id,author_name,content,created_at,submission_hash) SELECT ?,p.id,NULL,?,?,?,? FROM class_album_photos p JOIN class_albums a ON a.id=p.album_id JOIN album_classes c ON c.id=a.class_id WHERE p.id=? AND ${visibleAlbum} AND a.comments_open=1 AND p.hidden=0`).bind(p.id,name,p.content,new Date().toISOString(),submissionHash,photoId).run();
 if(!result.meta.changes)throw new HttpError(409,'照片或评论状态已变化，请刷新。');void emitEvent({id:'album-comment:'+p.id,event_name:'comment_created',module_id:'albums'});return {ok:true,id:p.id};
}
export async function albumStudentPost(request:Request,path:string[]){try{
 if(path.length===2&&path[1]==='photos')return json(await uploadAlbumPhoto(request,path[0],true));
 if(path.length===3&&path[0]==='photos'&&path[2]==='comments')return json(await commentPost(request,path[1]));
 if(path.length===3&&path[0]==='photos'&&path[2]==='report'){
 const input=await readJson(request);await commentPhoto(path[1]);await rateLimit(request,'album-report',5,3600);const p=z.object({comment_id:idSchema.optional(),reason:z.string().trim().min(1).max(500)}).strict().parse(input);
 if(p.comment_id&&!await database().prepare('SELECT id FROM class_album_comments WHERE id=? AND photo_id=? AND hidden=0').bind(p.comment_id,path[1]).first())throw new HttpError(404,'留言不存在。');
 await database().prepare('INSERT INTO album_reports(id,photo_id,comment_id,reason,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),path[1],p.comment_id||null,p.reason,new Date().toISOString()).run();return json({ok:true})}
 throw new HttpError(403,'此操作需要管理员权限。');
 }catch(e){if(e instanceof z.ZodError)return json({error:'请检查输入内容、500字评论上限及上传信息。'},400);return fail(e)}}
function pageOffset(request:Request){return Math.min(100000,Math.max(0,Math.floor(Number(new URL(request.url).searchParams.get('offset'))||0)))}
export async function albumMedia(request:Request,id:string,admin=false){
 const row=await database().prepare(`SELECT p.* FROM class_album_photos p JOIN class_albums a ON a.id=p.album_id JOIN album_classes c ON c.id=a.class_id WHERE p.id=? AND (?=1 OR (${visibleAlbum} AND p.hidden=0))`).bind(id,Number(admin)).first<any>();
 if(!row)throw new HttpError(404,'照片不存在或尚未发布。');
 const url=new URL(request.url),preview=url.searchParams.get('preview')==='1',object=await bucket().get(preview?row.thumbnail_key:row.object_key);
 if(!object)throw new HttpError(404,'照片暂时不可用。');
 const headers=new Headers({'Content-Type':object.httpMetadata?.contentType||row.mime,'Content-Length':String(object.size),'Cache-Control':'private, no-store','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff'});
 if(url.searchParams.get('download')==='1')headers.set('Content-Disposition',`attachment; filename="photo.${row.mime==='image/jpeg'?'jpg':row.mime.split('/')[1]}"; filename*=UTF-8''${encodeURIComponent(row.filename).replace(/'/g,'%27')}`);
 return new Response(object.body,{headers});
}
export async function albumExportPage(request:Request,admin=false):Promise<AlbumExportPage>{
 const q=new URL(request.url).searchParams,albumId=q.get('album_id')||'',classId=q.get('class_id')||'';
 if((!albumId&&!classId)||(albumId&&classId)||albumId.length>80||classId.length>80)throw new HttpError(400,'请选择一个活动相册或班级进行导出。');
 const name=albumId?(await readAlbum(albumId,admin)).album.title:(await readClass(classId,admin)).name;
 const after=q.get('after')||'',snapshot=q.get('snapshot')||new Date().toISOString();
 if(after.length>80||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(snapshot)||!Number.isFinite(Date.parse(snapshot)))throw new HttpError(400,'导出进度无效，请重新导出。');
 const photos=(await database().prepare(`SELECT p.id,p.filename,p.mime,p.size,p.album_id,a.title AS album_title,a.activity_date
 FROM class_album_photos p JOIN class_albums a ON a.id=p.album_id JOIN album_classes c ON c.id=a.class_id
 WHERE (?=1 OR (${visibleAlbum} AND p.hidden=0)) AND (?='' OR a.id=?) AND (?='' OR a.class_id=?) AND p.id>? AND p.created_at<=?
 ORDER BY p.id LIMIT 201`).bind(Number(admin),albumId,albumId,classId,classId,after,snapshot).all<AlbumExportPhoto>()).results;
 return {name,photos:photos.slice(0,200),snapshot,next_cursor:photos.length>200?photos[199].id:null};
}
export async function albumGet(request:Request,path:string[],admin=false){try{
 if(admin)await requireAdministrator(request);
 if(path.length===1&&path[0]==='export')return json(await albumExportPage(request,admin));
 if(path.length===3&&path[0]==='photos'&&path[2]==='comments')return json(await albumComments(request,path[1],admin));
 if(path[0]==='classes'){if(path[1]){const space=await readClass(path[1],admin);return json({space,albums:await listAlbums(admin,'',path[1],pageOffset(request))})}return json({classes:await listClasses(admin,pageOffset(request))})}
 if(path[0]==='recent'&&!admin)return json({photos:await recentPhotos(pageOffset(request))});
 if(path[0]==='reports'&&admin)return json({reports:(await database().prepare('SELECT r.*,p.album_id,a.class_id,a.title FROM album_reports r JOIN class_album_photos p ON p.id=r.photo_id JOIN class_albums a ON a.id=p.album_id ORDER BY r.created_at DESC LIMIT 200').all()).results});
 if(!path.length)return json({albums:await listAlbums(admin,new URL(request.url).searchParams.get('semester')||'',new URL(request.url).searchParams.get('class_id')||'',pageOffset(request))});
 if(path.length===2&&path[0]==='photos')return await albumMedia(request,path[1],admin);
 if(path.length===1)return json(await readAlbum(path[0],admin,pageOffset(request),new URL(request.url).searchParams.get('photo')||''));throw new HttpError(404,'页面不存在。');
 }catch(e){return fail(e)}}
export async function albumPost(request:Request,path:string[]){try{
 await requireAdministrator(request);
 if(path[0]==='cleanup'){sameOrigin(request);await cleanupAlbumObjects();return json({ok:true})}
 if(path[0]==='classes'){
 const p=z.object({id:z.string().min(1).max(80).regex(/^[a-zA-Z0-9-]+$/).optional(),name:z.string().trim().min(1).max(80),description:z.string().trim().max(2000).default(''),visibility:z.enum(['public','link']),status:z.enum(['active','hidden','archived']).default('active')}).strict().parse(await readJson(request)),now=new Date().toISOString(),id=p.id||crypto.randomUUID();
 await database().prepare('INSERT INTO album_classes VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,visibility=excluded.visibility,status=excluded.status,updated_at=excluded.updated_at').bind(id,p.name,p.description,p.visibility,p.status,now,now).run();return json({ok:true,id})}
 if(path[0]==='reports'){const p=await readJson(request);await database().prepare("UPDATE album_reports SET status='resolved' WHERE id=?").bind(idSchema.parse(p.id)).run();return json({ok:true})}
 if(path.length===3&&path[0]==='photos'&&path[2]==='comments')return json(await commentPost(request,path[1],true));
 if(path.length===2&&path[1]==='photos')return json(await uploadAlbumPhoto(request,path[0]));
 if(!path.length)return json(await writeAlbum(await readJson(request)));
 throw new HttpError(404,'页面不存在。');
 }catch(e){if(e instanceof z.ZodError)return json({error:'请检查标题、日期与必填信息。'},400);return fail(e)}}

