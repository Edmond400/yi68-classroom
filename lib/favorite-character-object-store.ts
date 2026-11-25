import {monitoredBucket} from './storage-telemetry';
import { env } from 'cloudflare:workers';
import { HttpError } from './http';
import type { FavoriteCharacterMime } from './favorite-character-model';

export type FavoriteCharacterObjectStore = {
  provider: 'r2' | 'oss';
  put(key: string, image: Blob, mime: FavoriteCharacterMime): Promise<{ size: number; fingerprint: string }>;
  open(key: string): Promise<{ size: number; fingerprint: string; body: ReadableStream<Uint8Array> } | null>;
  discard(key: string): Promise<void>;
};
const settings = () => env as typeof env & { FAVORITE_CHARACTER_MEDIA?: R2Bucket; FAVORITE_CHARACTER_OBJECT_WRITES?: string };

export function getFavoriteCharacterObjectStore(): FavoriteCharacterObjectStore | null {
  const configured = settings().FAVORITE_CHARACTER_MEDIA;
  if (!configured) return null;
  const bucket=monitoredBucket(configured);
  return {
    provider: 'r2',
    async put(key, image, mime) {
      const result = await bucket.put(key, image, {
        onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: mime, cacheControl: 'private, no-store' },
      });
      if (!result) throw new HttpError(503, '暂时无法保存图片，请稍后重试。');
      return { size: result.size, fingerprint: result.etag };
    },
    async open(key) {
      const value = await bucket.get(key);
      return value ? { size: value.size, fingerprint: value.etag, body: value.body } : null;
    },
    discard: key => bucket.delete(key),
  };
}

export function favoriteCharacterWriteMode() {
  const value = settings().FAVORITE_CHARACTER_OBJECT_WRITES;
  if (value === 'on') return 'object';
  return value === 'paused' ? 'paused' : 'legacy';
}
