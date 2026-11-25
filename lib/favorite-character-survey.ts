import {emitEvent} from './site-telemetry';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ATTACHMENT_CHUNK_BYTES } from './attachment-storage';
import { database } from './data';
import { HttpError } from './http';
import { digest } from './passwords';
import { defaultFavoriteCharacterSurvey, favoriteCharacterMaxBytes, favoriteCharacterObjectMaxBytes, favoriteCharacterNameLimit, favoriteCharacterRoleLimit, type FavoriteCharacterMime, type FavoriteCharacterResponse } from './favorite-character-model';
import { getFavoriteCharacterObjectStore, type FavoriteCharacterObjectStore } from './favorite-character-object-store';

const settingKey = 'favorite_character_survey';
const maxResponses = 64;
const maxStoredBytes = 128 * 1024 * 1024;
const legacyDefaultHint = '一人交一张。支持 JPG、PNG、WebP，最多 5 MB。';

export const favoriteCharacterSettingsInput = z.object({
  open: z.boolean(),
  title: z.string().trim().min(1, '请填写标题。').max(100),
  description: z.string().trim().min(1, '请填写开头说明。').max(600),
  imageHint: z.string().trim().max(180),
}).strict();

export const favoriteCharacterResponseInput = z.object({
  name: z.string().trim().min(1, '请填写你的姓名。').max(favoriteCharacterNameLimit),
  character: z.string().trim().max(favoriteCharacterRoleLimit),
  request_key: z.string().uuid(),
}).strict();

export async function readFavoriteCharacterSurvey() {
  const row = await database().prepare('SELECT value FROM settings WHERE key = ?').bind(settingKey).first<{ value: string }>();
  const survey = row ? favoriteCharacterSettingsInput.parse(JSON.parse(row.value)) : defaultFavoriteCharacterSurvey;
  return survey.imageHint === legacyDefaultHint ? { ...survey, imageHint: defaultFavoriteCharacterSurvey.imageHint } : survey;
}

export async function saveFavoriteCharacterSurvey(survey: z.infer<typeof favoriteCharacterSettingsInput>) {
  await database().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(settingKey, JSON.stringify(survey)).run();
}

function imageMime(head: Uint8Array, tail: Uint8Array, size: number): FavoriteCharacterMime {
  const at = (bytes: Uint8Array, offset: number, tag: string) => [...tag].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  if (size >= 4 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff && tail.at(-2) === 0xff && tail.at(-1) === 0xd9) return 'image/jpeg';
  if (size >= 45 && [137,80,78,71,13,10,26,10].every((n, i) => head[i] === n) && at(head, 12, 'IHDR') && at(tail, tail.length - 8, 'IEND')) return 'image/png';
  if (size >= 20 && at(head, 0, 'RIFF') && at(head, 8, 'WEBP') && (at(head, 12, 'VP8 ') || at(head, 12, 'VP8L') || at(head, 12, 'VP8X')) && new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(4, true) + 8 === size) return 'image/webp';
  throw new HttpError(415, '请选择能正常打开的 JPG、PNG 或 WebP 图片。如果手机照片无法上传，可以先截图，再上传截图。');
}

export async function recordFavoriteCharacterResponse(answer: z.infer<typeof favoriteCharacterResponseInput>, bytes: Uint8Array) {
  if (!bytes.length) throw new HttpError(400, '请从相册选择一张图片。');
  if (bytes.length > favoriteCharacterMaxBytes) throw new HttpError(413, '图片超过 5 MB，请压缩或截图后重新选择。');
  const mime = imageMime(bytes.subarray(0, 20), bytes.subarray(-12), bytes.length);
  const id = crypto.randomUUID();
  const key = digest(answer.request_key);
  const payload = digest(JSON.stringify([answer.name, answer.character, createHash('sha256').update(bytes).digest('hex')]));
  const db = database();
  // The survey switch, limits, receipt and all image chunks are checked/written in one transaction.
  const writes = [db.prepare(`INSERT INTO favorite_character_responses (id,request_key,payload_hash,name,character,mime,size,created_at)
    SELECT ?,?,?,?,?,?,?,? WHERE COALESCE((SELECT json_extract(value,'$.open') FROM settings WHERE key=?),0)=1
      AND (SELECT COUNT(*) + (SELECT COUNT(*) FROM favorite_character_object_responses) < ? AND COALESCE(SUM(size),0) <= ? FROM favorite_character_responses)
      AND NOT EXISTS(SELECT 1 FROM favorite_character_object_responses WHERE request_key=?)
    ON CONFLICT(request_key) DO NOTHING`)
    .bind(id, key, payload, answer.name, answer.character, mime, bytes.length, new Date().toISOString(), settingKey, maxResponses, maxStoredBytes - bytes.length, key)];
  for (let offset = 0, index = 0; offset < bytes.length; offset += ATTACHMENT_CHUNK_BYTES, index++) {
    writes.push(db.prepare(`INSERT INTO favorite_character_image_chunks(response_id,chunk_index,data)
      SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM favorite_character_responses WHERE id=?)`)
      .bind(id, index, bytes.slice(offset, offset + ATTACHMENT_CHUNK_BYTES), id));
  }
  writes.push(db.prepare('SELECT payload_hash FROM favorite_character_responses WHERE request_key=?').bind(key));
  const result = await db.batch<{ payload_hash: string }>(writes);
  const stored = result.at(-1)?.results[0];
  if (stored?.payload_hash === payload) {if(result[0].meta.changes)void emitEvent({id:'character-upload:'+key,event_name:'upload_success',module_id:'character',file_count:1,bytes:bytes.length});return;}
  if (stored) throw new HttpError(409, '刚才那份已经提交。本次填写内容已保留，请重新选择图片后再提交。');
  if (!(await readFavoriteCharacterSurvey()).open) throw new HttpError(409, '当前未开放收集。');
  throw new HttpError(409, '可接收的答卷或图片容量已达上限，请联系班长。');
}

export async function recordFavoriteCharacterObject(answer: z.infer<typeof favoriteCharacterResponseInput>, image: Blob, store: FavoriteCharacterObjectStore) {
  if (!image.size) throw new HttpError(400, '请从相册选择一张图片。');
  if (image.size > favoriteCharacterObjectMaxBytes) throw new HttpError(413, '图片超过 30 MB，请重新选择。');
  const db = database();
  const key = digest(answer.request_key);
  const legacy = await db.prepare('SELECT id FROM favorite_character_responses WHERE request_key=?').bind(key).first();
  if (legacy) throw new HttpError(409, '刚才那份已经提交。如要补交，请重新选择图片后提交。');
  const [head, tail] = await Promise.all([image.slice(0, 20).arrayBuffer(), image.slice(-12).arrayBuffer()]);
  const mime = imageMime(new Uint8Array(head), new Uint8Array(tail), image.size);
  const id = crypto.randomUUID();
  const objectKey = `surveys/favorite-character/${id}`;
  const discardUnreferenced = async () => { try { await store.discard(objectKey); } catch { console.warn('favorite-character-object-cleanup-deferred'); } };
  const uploaded = await store.put(objectKey, image, mime);
  if (uploaded.size !== image.size || !uploaded.fingerprint) {
    await discardUnreferenced();
    throw new HttpError(503, '图片存储校验未通过，请重新提交。');
  }
  const payload = digest(JSON.stringify([answer.name, answer.character, mime, image.size, uploaded.fingerprint]));
  const stored = await (async () => {
    try {
      const [, lookup] = await db.batch<{ id: string; payload_hash: string }>([
        db.prepare(`INSERT INTO favorite_character_object_responses (id,request_key,payload_hash,name,character,mime,size,object_key,storage_provider,fingerprint,created_at)
          SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT json_extract(value,'$.open') FROM settings WHERE key=?),0)=1
            AND (SELECT COUNT(*) FROM favorite_character_responses)+(SELECT COUNT(*) FROM favorite_character_object_responses) < ?
            AND NOT EXISTS(SELECT 1 FROM favorite_character_responses WHERE request_key=?)
          ON CONFLICT(request_key) DO NOTHING`)
          .bind(id, key, payload, answer.name, answer.character, mime, image.size, objectKey, store.provider, uploaded.fingerprint, new Date().toISOString(), settingKey, maxResponses, key),
        db.prepare('SELECT id,payload_hash FROM favorite_character_object_responses WHERE request_key=?').bind(key),
      ]);
      return lookup.results[0];
    } catch (error) {
      try {
        // An uncertain SQL result must not delete an object that might have committed.
        const reference = await db.prepare('SELECT id FROM favorite_character_object_responses WHERE object_key=?').bind(objectKey).first();
        if (reference) return { id, payload_hash: payload };
      } catch { throw error; }
      await discardUnreferenced();
      throw error;
    }
  })();
  if (stored?.id !== id) await discardUnreferenced();
  if (stored?.payload_hash === payload) {if(stored.id===id)void emitEvent({id:'character-upload:'+key,event_name:'upload_success',module_id:'character',file_count:1,bytes:image.size});return;}
  if (stored) throw new HttpError(409, '刚才那份已经提交。本次填写内容已保留，请重新选择图片后再提交。');
  if (!(await readFavoriteCharacterSurvey()).open) throw new HttpError(409, '当前未开放收集。');
  throw new HttpError(409, '可接收的答卷数量已达上限，或同一份已经提交。');
}

export async function readFavoriteCharacterResponses() {
  const result = await database().prepare(
    `SELECT id,name,character,mime,size,created_at FROM favorite_character_responses
      UNION ALL SELECT id,name,character,mime,size,created_at FROM favorite_character_object_responses ORDER BY created_at,id`,
  ).all<FavoriteCharacterResponse>();
  return result.results;
}

export async function readFavoriteCharacterImage(id: string) {
  const db = database();
  const ref = await db.prepare('SELECT mime,size,object_key,storage_provider,fingerprint FROM favorite_character_object_responses WHERE id=?').bind(id)
    .first<Pick<FavoriteCharacterResponse, 'mime' | 'size'> & { object_key: string; storage_provider: FavoriteCharacterObjectStore['provider']; fingerprint: string }>();
  if (ref) {
    const storage = getFavoriteCharacterObjectStore();
    if (!storage || storage.provider !== ref.storage_provider) throw new HttpError(503, '图片存储暂时不可用，请稍后重试。');
    const value = await storage.open(ref.object_key);
    if (!value || value.size !== ref.size || value.fingerprint !== ref.fingerprint) {
      if (value) await value.body.cancel().catch(() => {});
      throw new HttpError(409, '图片暂时无法完整读取，请稍后重试。');
    }
    return { mime: ref.mime, body: value.body, size: ref.size };
  }
  const row = await db.prepare('SELECT mime,size FROM favorite_character_responses WHERE id=?').bind(id).first<Pick<FavoriteCharacterResponse, 'mime' | 'size'>>();
  if (!row) throw new HttpError(404, '这张图片不存在。');
  const bytes = new Uint8Array(row.size);
  for (let offset = 0, index = 0; offset < bytes.length; offset += ATTACHMENT_CHUNK_BYTES, index++) {
    const chunk = await db.prepare('SELECT hex(data) AS hex FROM favorite_character_image_chunks WHERE response_id=? AND chunk_index=?').bind(id, index).first<{ hex: string }>();
    const data = chunk ? Buffer.from(chunk.hex, 'hex') : null;
    if (!data || data.length !== Math.min(ATTACHMENT_CHUNK_BYTES, bytes.length - offset)) throw new HttpError(409, '图片暂时无法完整读取，请稍后重试。');
    bytes.set(data, offset);
  }
  return { mime: row.mime, body: bytes, size: row.size };
}
