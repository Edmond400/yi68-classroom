import { env } from 'cloudflare:workers';
import { getActor } from '@/lib/auth';
import { database } from '@/lib/data';
import { readAttachment, migrateAttachment, type AttachmentLocation } from '@/lib/attachment-storage';
import { HttpError, json, fail, readJson } from '@/lib/http';
export const dynamic = 'force-dynamic';
async function authorize(request?:Request) { if (!(await getActor(request))?.isAdmin) throw new HttpError(403,'仅班长可以查看存储情况。'); }
export async function GET(request?:Request) {
  try {
    await authorize(request);
    const db=database();
    const stats=await db.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(size),0) AS bytes,
      COALESCE(SUM(storage_backend='d1'),0) AS d1,COALESCE(SUM(storage_backend='r2'),0) AS r2,
      COALESCE(SUM(migrated_at IS NOT NULL),0) AS migrated FROM assets`).first();
    const chunks=await db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(length(data)),0) AS bytes FROM asset_chunks').first();
    const assets=(await db.prepare('SELECT id,filename,size,storage_backend,object_key,checksum,migrated_at FROM assets ORDER BY id').all()).results as (AttachmentLocation & {id:string;size:number})[];
    const anomalies:{id:string;error:string}[]=[];
    // Cheap checks are always available. Explicit audit reads every file once.
    const audit=request&&new URL(request.url).searchParams.get('audit')==='1';
    for(const asset of assets) {
      try {
        if(audit) { if(!await readAttachment(asset.id,asset.size,asset))throw new Error('文件缺失'); }
        else if(asset.storage_backend==='r2') { const head=await env.FAVORITE_CHARACTER_MEDIA?.head(asset.object_key||'');if(!head||head.size!==asset.size||head.customMetadata?.sha256!==asset.checksum)throw new Error('R2对象或校验索引异常'); }
        else if(!env.LOCAL_ATTACHMENTS) { const row=await db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(length(data)),0) AS size FROM asset_chunks WHERE asset_id=?').bind(asset.id).first<{n:number;size:number}>();if(!row||row.n!==Math.ceil(asset.size/(512*1024))||row.size!==asset.size)throw new Error('D1分块不完整'); }
      } catch(error) { anomalies.push({id:asset.id,error:error instanceof Error?error.message:'读取失败'}); }
    }
    const orphan_chunks=await db.prepare('SELECT COUNT(*) AS count FROM asset_chunks c LEFT JOIN assets a ON a.id=c.asset_id WHERE a.id IS NULL').first();
    const orphans:{key:string;size:number;uploaded:string}[]=[];
    let cursor:string|undefined;
    if(env.FAVORITE_CHARACTER_MEDIA) do {
      const page=await env.FAVORITE_CHARACTER_MEDIA.list({prefix:'attachments/',cursor});
      for(const obj of page.objects) if(!await db.prepare('SELECT id FROM assets WHERE object_key=?').bind(obj.key).first()) orphans.push({key:obj.key,size:obj.size,uploaded:obj.uploaded.toISOString()});
      cursor=page.truncated?page.cursor:undefined;
    } while(cursor);
    return json({writes:env.ATTACHMENT_WRITES||'r2',stats,chunks,anomaly_count:anomalies.length,anomalies,orphan_chunks,orphans,assets,audit:!!audit});
  } catch(error) { return fail(error); }
}
export async function POST(request:Request) {
  try {
    await authorize(request);const input=await readJson(request);
    if(input.action==='migrate'&&typeof input.id==='string') return json(await migrateAttachment(input.id));
    if(input.action==='cleanup_orphan'&&typeof input.key==='string'&&/^attachments\/[a-zA-Z0-9_-]{1,90}$/.test(input.key)) {
      if(await database().prepare('SELECT id FROM assets WHERE object_key=? OR id=?').bind(input.key,input.key.slice(12)).first())throw new HttpError(409,'对象仍被引用，不能清理。');
      const object=await env.FAVORITE_CHARACTER_MEDIA?.head(input.key);
      if(object&&Date.now()-object.uploaded.getTime()<3600000)throw new HttpError(409,'新对象可能仍在上传，请稍后核对。');
      await env.FAVORITE_CHARACTER_MEDIA?.delete(input.key);return json({ok:true});
    }
    throw new HttpError(400,'操作无效。');
  } catch(error) { return fail(error); }
}
