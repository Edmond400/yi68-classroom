import { Zip, ZipPassThrough } from 'fflate';
import { favoriteCharacterExtensions, favoriteCharacterFilename, type FavoriteCharacterResponse } from './favorite-character-model';

export type FavoriteCharacterIndexed = { response: FavoriteCharacterResponse; index: number };
export type FavoriteCharacterExportMode = 'stage' | 'archive';
export type FavoriteCharacterExportEntry = FavoriteCharacterIndexed & { filename: string };

function filenamePart(text: string, fallback: string, max: number) {
  const safe = text.normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069<>:"/\\|?*]/gu, '_')
    .trim().replace(/^\.+|[. ]+$/g, '');
  const chars = Array.from(safe).slice(0, max);
  const encoder = new TextEncoder();
  while (encoder.encode(chars.join('')).length > max * 3) chars.pop();
  return chars.join('').replace(/[. ]+$/g, '') || fallback;
}

export function favoriteCharacterExportPlan(rows: FavoriteCharacterIndexed[], mode: FavoriteCharacterExportMode): FavoriteCharacterExportEntry[] {
  const used = new Set<string>();
  return rows.map(row => {
    const { response, index } = row;
    if (mode === 'stage') return { ...row, filename: favoriteCharacterFilename(index, response.mime) };
    const basename = `${filenamePart(response.name, '未填写姓名', 24)}_${filenamePart(response.character, '未填写角色名', 48)}`;
    const extension = favoriteCharacterExtensions[response.mime];
    let filename = `${basename}.${extension}`;
    let suffix = 2;
    while (used.has(filename.toLowerCase())) filename = `${basename}_${String(suffix++).padStart(2, '0')}.${extension}`;
    used.add(filename.toLowerCase());
    return { ...row, filename };
  });
}

function csvCell(value: string) {
  const safe = /^[\t\r\n]|^\s*[=+\-@]/u.test(value.normalize('NFKC')) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function favoriteCharacterArchiveCsv(entries: FavoriteCharacterExportEntry[]) {
  const rows = [['提交者姓名', '角色名或作品名', '图片文件名', '提交时间（UTC）'], ...entries.map(({ response, filename }) => [response.name, response.character, filename, response.created_at])];
  return new TextEncoder().encode('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n');
}

// ZIP entries are stored, not recompressed. Only the current image chunk and the
// central directory are held while the output sink writes successive chunks.
export async function writeFavoriteCharacterZip(
  entries: FavoriteCharacterExportEntry[], mode: FavoriteCharacterExportMode,
  getImage: (id: string) => Promise<Response>, write: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>,
  onImage?: (count: number) => void,
) {
  const pending: Uint8Array<ArrayBuffer>[] = [];
  let error: Error | null = null;
  const zip = new Zip((err, bytes) => { if (err) error = err; else if (bytes?.length) pending.push(bytes as Uint8Array<ArrayBuffer>); });
  async function flush() {
    if (error) throw error;
    for (const bytes of pending.splice(0)) await write(bytes);
  }
  try {
    if (mode === 'archive') {
      const manifest = new ZipPassThrough('提交清单.csv');
      zip.add(manifest); manifest.push(favoriteCharacterArchiveCsv(entries), true);
      await flush();
    }
    for (const [offset, { response, filename }] of entries.entries()) {
      onImage?.(offset + 1);
      const incoming = await getImage(response.id);
      if (!incoming.ok || !incoming.body) throw new Error(`图片 ${filename} 无法读取，请重试。`);
      const file = new ZipPassThrough(filename);
      zip.add(file);
      const reader = incoming.body.getReader();
      let received = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          received += value.length;
          if (received > response.size) throw new Error(`图片 ${filename} 的大小与答卷不符。`);
          file.push(value);
          await flush();
        }
        if (received !== response.size) throw new Error(`图片 ${filename} 没有下载完整，请重试。`);
        file.push(new Uint8Array(0), true);
        await flush();
      } catch (reason) {
        await reader.cancel().catch(() => {});
        throw reason;
      } finally { reader.releaseLock(); }
    }
    zip.end();
    await flush();
  } catch (reason) {
    zip.terminate();
    throw reason;
  }
}
