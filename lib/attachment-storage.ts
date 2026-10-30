import { env } from 'cloudflare:workers';
import { database } from './data';
import { HttpError } from './http';

// Keep each BLOB well below D1's 2,000,000-byte row limit.
export const ATTACHMENT_CHUNK_BYTES = 512 * 1024;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

type Attachment = { id: string; itemId: string; filename: string; mime: string; size: number };

function checkSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) {
    throw new HttpError(400, '请选择10MB以内的文件。');
  }
}

export async function saveAttachment(asset: Attachment, bytes: Uint8Array) {
  checkSize(asset.size);
  if (bytes.byteLength !== asset.size) throw new HttpError(400, '附件大小不匹配。');
  const db = database();
  const metadata = db.prepare('INSERT INTO assets (id,item_id,filename,mime,size) VALUES (?,?,?,?,?)')
    .bind(asset.id, asset.itemId, asset.filename, asset.mime, asset.size);

  // The independent Node server keeps its existing private disk storage.
  // This binding is supplied only by lib/node-runtime.ts, never by Cloudflare.
  if (env.LOCAL_ATTACHMENTS) {
    const key = 'attachments/' + asset.id;
    await env.LOCAL_ATTACHMENTS.put(key, bytes);
    try { await metadata.run(); }
    catch (error) { await env.LOCAL_ATTACHMENTS.delete(key); throw error; }
    return;
  }

  const statements = [metadata];
  for (let offset = 0, index = 0; offset < bytes.byteLength; offset += ATTACHMENT_CHUNK_BYTES, index++) {
    statements.push(db.prepare('INSERT INTO asset_chunks (asset_id,chunk_index,data) VALUES (?,?,?)')
      .bind(asset.id, index, bytes.slice(offset, offset + ATTACHMENT_CHUNK_BYTES)));
  }
  // D1 batch is transactional: failed writes leave neither metadata nor partial files.
  await db.batch(statements);
}

export async function readAttachment(id: string, size: number): Promise<Uint8Array<ArrayBuffer> | null> {
  checkSize(size);
  if (env.LOCAL_ATTACHMENTS) {
    const file = await env.LOCAL_ATTACHMENTS.get('attachments/' + id);
    if (!file) return null;
    if (file.body.byteLength !== size) throw new HttpError(409, '附件暂时无法完整读取，请稍后重试。');
    return new Uint8Array(file.body);
  }

  const db = database();
  const stats = await db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(length(data)),0) AS size FROM asset_chunks WHERE asset_id=?')
    .bind(id).first<{ count: number; size: number }>();
  if (!stats?.count) return null;
  const count = Math.ceil(size / ATTACHMENT_CHUNK_BYTES);
  if (stats.count !== count || stats.size !== size) throw new HttpError(409, '附件暂时无法完整读取，请稍后重试。');
  const bytes = new Uint8Array(size);
  // Read one chunk at a time. Hex avoids D1 expanding binary data into huge number arrays.
  for (let index = 0; index < count; index++) {
    const row = await db.prepare('SELECT hex(data) AS hex FROM asset_chunks WHERE asset_id=? AND chunk_index=?')
      .bind(id, index).first<{ hex: string }>();
    const chunk = row ? Buffer.from(row.hex, 'hex') : null;
    const offset = index * ATTACHMENT_CHUNK_BYTES;
    if (!chunk || chunk.byteLength !== Math.min(ATTACHMENT_CHUNK_BYTES, size - offset)) {
      throw new HttpError(409, '附件暂时无法完整读取，请稍后重试。');
    }
    bytes.set(chunk, offset);
  }
  return bytes;
}

export async function deleteAttachment(id: string) {
  // ON DELETE CASCADE removes all D1 chunks with the metadata in one statement.
  await database().prepare('DELETE FROM assets WHERE id=?').bind(id).run();
  await env.LOCAL_ATTACHMENTS?.delete('attachments/' + id);
}
