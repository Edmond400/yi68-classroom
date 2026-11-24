import { env } from 'cloudflare:workers';
import { createHash } from 'node:crypto';
import { database } from './data';
import { HttpError } from './http';

export const ATTACHMENT_CHUNK_BYTES = 512 * 1024;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
type Attachment = { id: string; itemId: string; filename: string; mime: string; size: number };
export type AttachmentLocation = { storage_backend?: string; object_key?: string | null; checksum?: string | null };
export const attachmentChecksum = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function checkSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) throw new HttpError(400, '请选择10MB以内的文件。');
}
function keyFor(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,90}$/.test(id)) throw new HttpError(400, '附件编号无效。');
  return 'attachments/' + id;
}
function bucket() {
  if (!env.FAVORITE_CHARACTER_MEDIA) throw new HttpError(503, '附件存储暂时不可用，请稍后重试。');
  return env.FAVORITE_CHARACTER_MEDIA;
}
async function readObject(key: string, size: number, checksum?: string | null): Promise<Uint8Array<ArrayBuffer>> {
  const object = await bucket().get(key);
  if (!object || object.size !== size) throw new HttpError(409, '附件暂时无法完整读取，请稍后重试。');
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.length !== size || (checksum && attachmentChecksum(bytes) !== checksum)) throw new HttpError(409, '附件校验失败，请联系维护人员。');
  return bytes;
}
async function putVerified(asset: Attachment, bytes: Uint8Array, checksum: string) {
  const key = keyFor(asset.id);
  if (!await bucket().head(key)) {
    await bucket().put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' }, sha256: checksum,
      httpMetadata: { contentType: asset.mime, cacheControl: 'private, no-store' },
      customMetadata: { asset_id: asset.id, sha256: checksum },
    });
  }
  await readObject(key, asset.size, checksum);
  return key;
}
export async function saveAttachment(asset: Attachment, bytes: Uint8Array) {
  checkSize(asset.size);
  if (bytes.byteLength !== asset.size) throw new HttpError(400, '附件大小不匹配。');
  const db = database();
  const checksum = attachmentChecksum(bytes);
  if (env.LOCAL_ATTACHMENTS) {
    const key = keyFor(asset.id);
    await env.LOCAL_ATTACHMENTS.put(key, bytes);
    try { await db.prepare('INSERT INTO assets (id,item_id,filename,mime,size,checksum) VALUES (?,?,?,?,?,?)').bind(asset.id, asset.itemId, asset.filename, asset.mime, asset.size, checksum).run(); }
    catch (error) { await env.LOCAL_ATTACHMENTS.delete(key); throw error; }
    return;
  }
  if (env.ATTACHMENT_WRITES !== 'd1') {
    const key = await putVerified(asset, bytes, checksum);
    try {
      await db.prepare("INSERT INTO assets (id,item_id,filename,mime,size,storage_backend,object_key,checksum) VALUES (?,?,?,?,?,'r2',?,?)")
        .bind(asset.id, asset.itemId, asset.filename, asset.mime, asset.size, key, checksum).run();
    } catch (error) {
      // Ambiguous DB failures must not destroy potentially committed object bytes.
      try { if (!await db.prepare('SELECT id FROM assets WHERE id=?').bind(asset.id).first()) await bucket().delete(key); }
      catch { console.error('attachment-orphan-check-pending', asset.id); }
      throw error;
    }
    return;
  }
  // Explicit emergency rollback; committed R2 files remain readable.
  const statements = [db.prepare('INSERT INTO assets (id,item_id,filename,mime,size,checksum) VALUES (?,?,?,?,?,?)').bind(asset.id, asset.itemId, asset.filename, asset.mime, asset.size, checksum)];
  for (let offset = 0, index = 0; offset < bytes.length; offset += ATTACHMENT_CHUNK_BYTES, index++) statements.push(db.prepare('INSERT INTO asset_chunks (asset_id,chunk_index,data) VALUES (?,?,?)').bind(asset.id, index, bytes.slice(offset, offset + ATTACHMENT_CHUNK_BYTES)));
  await db.batch(statements);
}
export async function readAttachment(id: string, size: number, location?: AttachmentLocation): Promise<Uint8Array<ArrayBuffer> | null> {
  checkSize(size);
  if (env.LOCAL_ATTACHMENTS) {
    const file = await env.LOCAL_ATTACHMENTS.get(keyFor(id));
    if (!file) return null;
    if (file.body.length !== size) throw new HttpError(409, '附件暂时无法完整读取，请稍后重试。');
    return new Uint8Array(file.body);
  }
  const row = location ?? await database().prepare('SELECT storage_backend,object_key,checksum FROM assets WHERE id=?').bind(id).first<AttachmentLocation>();
  if (row?.storage_backend === 'r2') {
    if (row.object_key !== keyFor(id) || !row.checksum) throw new HttpError(409, '附件索引异常，请联系维护人员。');
    return readObject(row.object_key, size, row.checksum);
  }
  return readD1Attachment(id, size);
}
export async function readD1Attachment(id: string, size: number): Promise<Uint8Array<ArrayBuffer> | null> {
  checkSize(size);
  const db = database();
  const stats = await db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(length(data)),0) AS size FROM asset_chunks WHERE asset_id=?').bind(id).first<{count:number;size:number}>();
  if (!stats?.count) return null;
  const count = Math.ceil(size / ATTACHMENT_CHUNK_BYTES);
  if (stats.count !== count || stats.size !== size) throw new HttpError(409, '附件暂时无法完整读取，请稍后重试。');
  const bytes = new Uint8Array(size);
  for (let index = 0; index < count; index++) {
    const row = await db.prepare('SELECT hex(data) AS hex FROM asset_chunks WHERE asset_id=? AND chunk_index=?').bind(id, index).first<{hex:string}>();
    const chunk = row ? Buffer.from(row.hex, 'hex') : null;
    const offset = index * ATTACHMENT_CHUNK_BYTES;
    if (!chunk || chunk.length !== Math.min(ATTACHMENT_CHUNK_BYTES, size - offset)) throw new HttpError(409, '附件暂时无法完整读取，请稍后重试。');
    bytes.set(chunk, offset);
  }
  return bytes;
}
export async function migrateAttachment(id: string) {
  const db = database();
  const asset = await db.prepare('SELECT * FROM assets WHERE id=?').bind(id).first<AttachmentLocation & {id:string;item_id:string;filename:string;mime:string;size:number}>();
  if (!asset) throw new HttpError(404, '附件不存在。');
  if (asset.storage_backend === 'r2') { await readAttachment(id, asset.size, asset); return { id, skipped: true }; }
  const bytes = await readD1Attachment(id, asset.size);
  if (!bytes) throw new HttpError(409, '旧附件数据缺失，迁移已暂停。');
  const checksum = attachmentChecksum(bytes);
  const key = await putVerified({ ...asset, itemId: asset.item_id }, bytes, checksum);
  const result = await db.prepare("UPDATE assets SET storage_backend='r2',object_key=?,checksum=?,migrated_at=? WHERE id=? AND storage_backend='d1'")
    .bind(key, checksum, new Date().toISOString(), id).run();
  // Keep original chunks until independently verified backup permits cleanup.
  return { id, skipped: result.meta.changes === 0, checksum };
}
export async function deleteAttachment(id: string) {
  const db = database();
  const asset = await db.prepare('SELECT storage_backend,object_key FROM assets WHERE id=?').bind(id).first<AttachmentLocation>();
  // Failed deletion leaves private, recoverable orphan bytes, never a broken live index.
  await db.prepare('DELETE FROM assets WHERE id=?').bind(id).run();
  if (env.LOCAL_ATTACHMENTS) { await env.LOCAL_ATTACHMENTS.delete(keyFor(id)); return; }
  if (asset?.storage_backend === 'r2' && asset.object_key === keyFor(id)) {
    try { await bucket().delete(asset.object_key); } catch { console.error('attachment-object-cleanup-pending', id); }
  }
}
