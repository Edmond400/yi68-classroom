import {database} from '../data';
import {HttpError} from '../http';
import {CHUNK_BYTES,MAX_PROJECT_BYTES} from './model';
export type FileMetadata={id:string;project_id:string;kind:'audio'|'slide'|'pptx';mime:string;bytes:number;hash:string};
export async function sha256(bytes:Uint8Array){return Buffer.from(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))).toString('hex')}
export function detectMime(bytes:Uint8Array,kind:'audio'|'slide'|'pptx',claimed:string){
 const b=bytes;let actual='';
 if(kind==='audio'){
  if(b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3)actual='audio/webm';
  else if(b.length>=12&&new TextDecoder().decode(b.slice(4,8))==='ftyp')actual='audio/mp4';
  else if(new TextDecoder().decode(b.slice(0,4))==='OggS')actual='audio/ogg';
 }else{
  if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10)actual='image/png';
  else if(b[0]===255&&b[1]===216&&b[2]===255)actual='image/jpeg';
  else if(new TextDecoder().decode(b.slice(0,4))==='RIFF'&&new TextDecoder().decode(b.slice(8,12))==='WEBP')actual='image/webp';
 }
 if(!actual||claimed.split(';')[0].toLowerCase()!==actual)throw new HttpError(415,'文件格式与MIME不匹配，仅支持浏览器音频或静态图片。');
 return actual;
}
export function fileStatements(f:FileMetadata,bytes:Uint8Array){
 const db=database(),stmts=[db.prepare('INSERT INTO rehearsal_files(id,project_id,kind,mime,bytes,hash,created_at) VALUES (?,?,?,?,?,?,?)').bind(f.id,f.project_id,f.kind,f.mime,f.bytes,f.hash,new Date().toISOString())];
 for(let offset=0,i=0;offset<bytes.length;offset+=CHUNK_BYTES,i++)stmts.push(db.prepare('INSERT INTO rehearsal_file_chunks(file_id,chunk_index,data) VALUES (?,?,?)').bind(f.id,i,bytes.slice(offset,offset+CHUNK_BYTES)));
 return stmts;
}
export function capacityGuard(bytes:number){return database().prepare('INSERT INTO rehearsal_write_guards(id,allowed) SELECT ?,CASE WHEN COALESCE((SELECT SUM(bytes) FROM rehearsal_files),0)+?<=? THEN 1 ELSE 0 END').bind(crypto.randomUUID(),bytes,MAX_PROJECT_BYTES)}
export async function getFile(id:string,kind:'audio'|'slide'|'pptx',projectId='current'){return database().prepare('SELECT * FROM rehearsal_files WHERE id=? AND project_id=? AND kind=?').bind(id,projectId,kind).first<FileMetadata>()}
export async function serveFile(request:Request,file:FileMetadata){
 const db=database();const stats=await db.prepare('SELECT count(*) AS n,sum(length(data)) AS bytes FROM rehearsal_file_chunks WHERE file_id=?').bind(file.id).first<{n:number;bytes:number}>();
 if(stats?.n!==Math.ceil(file.bytes/CHUNK_BYTES)||stats.bytes!==file.bytes)throw new HttpError(409,'文件不完整，请联系管理员或重新提交。');
 let start=0,end=file.bytes-1;const range=request.headers.get('range');
 const headers=new Headers({'Content-Type':file.mime,'Content-Disposition':'inline','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Accept-Ranges':'bytes'});
 if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2])){headers.set('Content-Range','bytes */'+file.bytes);return new Response(null,{status:416,headers})}if(!match[1])start=Math.max(0,file.bytes-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]))}if(start>end||start>=file.bytes){headers.set('Content-Range','bytes */'+file.bytes);return new Response(null,{status:416,headers})}headers.set('Content-Range',`bytes ${start}-${end}/${file.bytes}`)}
 const first=Math.floor(start/CHUNK_BYTES),last=Math.floor(end/CHUNK_BYTES);
 // Only requested chunks are read; full payloads are streamed with backpressure.
 let index=first;const stream=new ReadableStream<Uint8Array>({async pull(controller){try{const row=await db.prepare('SELECT hex(data) AS data FROM rehearsal_file_chunks WHERE file_id=? AND chunk_index=?').bind(file.id,index).first<{data:string}>();if(!row)throw new Error('missing chunk');const chunk=Buffer.from(row.data,'hex');const expected=Math.min(CHUNK_BYTES,file.bytes-index*CHUNK_BYTES);if(chunk.length!==expected)throw new Error('invalid chunk');const from=Math.max(0,start-index*CHUNK_BYTES),to=Math.min(chunk.length,end-index*CHUNK_BYTES+1);controller.enqueue(new Uint8Array(chunk.subarray(from,to)));if(index++===last)controller.close()}catch(error){controller.error(error)}}});
 headers.set('Content-Length',String(end-start+1));return new Response(request.method==='HEAD'?null:stream,{status:range?206:200,headers});
}
