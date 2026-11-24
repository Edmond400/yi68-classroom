// Browser-side, stored ZIP64: originals are read one at a time, without
// recompressing image data or spending Worker CPU on archive generation.
export type AlbumExportPhoto = {
  id: string; filename: string; mime: string; size: number;
  album_id: string; album_title: string; activity_date: string;
};
export type AlbumExportPage = {
  name: string; photos: AlbumExportPhoto[]; snapshot: string; next_cursor: string | null;
};

export function albumExportName(value: string, fallback = '照片') {
  const safe = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>:"/\\|?*]/gu, '_')
    .trim().replace(/^\.+|[. ]+$/g, '');
  const part = Array.from(safe).slice(0, 64).join('') || fallback;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ? '_' + part : part;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function block(length: number, fill: (view: DataView) => void) {
  const bytes = new Uint8Array(length); fill(new DataView(bytes.buffer)); return bytes;
}

export async function writeAlbumZip(
  photos: AlbumExportPhoto[], getImage: (photo: AlbumExportPhoto) => Promise<Response>,
  write: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>,
  onProgress?: (done: number, bytes: number) => void,
) {
  const encoder = new TextEncoder(), central: Uint8Array<ArrayBuffer>[] = [];
  let offset = BigInt(0), receivedTotal = 0;
  const emit = async (bytes: Uint8Array<ArrayBuffer>) => { await write(bytes); offset += BigInt(bytes.length); };
  for (const [index, photo] of photos.entries()) {
    const folder = `${albumExportName(photo.activity_date)}_${albumExportName(photo.album_title)}_${photo.album_id}`;
    const extension = photo.mime === 'image/jpeg' ? 'jpg' : photo.mime === 'image/png' ? 'png' : 'webp';
    const basename = albumExportName(photo.filename.replace(/\.[^.]*$/, ''));
    const name = encoder.encode(`${folder}/${String(index + 1).padStart(5, '0')}_${basename}.${extension}`);
    const size = BigInt(photo.size), start = offset;
    const response = await getImage(photo);
    if (!response.ok || !response.body) throw new Error(`照片 ${photo.filename} 无法下载，可能已被撤回。请刷新后重试。`);
    const reader = response.body.getReader();
    let crc = 0xffffffff, received = 0;
    try {
      await emit(block(30, v => {
        v.setUint32(0, 0x04034b50, true); v.setUint16(4, 45, true); v.setUint16(6, 0x808, true);
        v.setUint16(12, 33, true); v.setUint32(18, 0xffffffff, true); v.setUint32(22, 0xffffffff, true);
        v.setUint16(26, name.length, true); v.setUint16(28, 20, true);
      }));
      await emit(name);
      await emit(block(20, v => { v.setUint16(0, 1, true); v.setUint16(2, 16, true); v.setBigUint64(4, size, true); v.setBigUint64(12, size, true); }));
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        received += value.length;
        if (received > photo.size) throw new Error(`照片 ${photo.filename} 的大小发生变化，请重新导出。`);
        for (const byte of value) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
        await emit(value as Uint8Array<ArrayBuffer>);
        receivedTotal += value.length; onProgress?.(index, receivedTotal);
      }
      if (received !== photo.size) throw new Error(`照片 ${photo.filename} 未下载完整，请重试。`);
      crc = (crc ^ 0xffffffff) >>> 0;
      await emit(block(24, v => { v.setUint32(0, 0x08074b50, true); v.setUint32(4, crc, true); v.setBigUint64(8, size, true); v.setBigUint64(16, size, true); }));
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    central.push(block(46, v => {
      v.setUint32(0, 0x02014b50, true); v.setUint16(4, 45, true); v.setUint16(6, 45, true); v.setUint16(8, 0x808, true);
      v.setUint16(14, 33, true); v.setUint32(16, crc, true); v.setUint32(20, 0xffffffff, true); v.setUint32(24, 0xffffffff, true);
      v.setUint16(28, name.length, true); v.setUint16(30, 28, true); v.setUint32(42, 0xffffffff, true);
    }), name, block(28, v => {
      v.setUint16(0, 1, true); v.setUint16(2, 24, true); v.setBigUint64(4, size, true); v.setBigUint64(12, size, true); v.setBigUint64(20, start, true);
    }));
    onProgress?.(index + 1, receivedTotal);
  }
  const centralStart = offset;
  for (const bytes of central) await emit(bytes);
  const centralSize = offset - centralStart, zip64Start = offset, count = BigInt(photos.length);
  await emit(block(56, v => {
    v.setUint32(0, 0x06064b50, true); v.setBigUint64(4, BigInt(44), true); v.setUint16(12, 45, true); v.setUint16(14, 45, true);
    v.setBigUint64(24, count, true); v.setBigUint64(32, count, true); v.setBigUint64(40, centralSize, true); v.setBigUint64(48, centralStart, true);
  }));
  await emit(block(20, v => { v.setUint32(0, 0x07064b50, true); v.setBigUint64(8, zip64Start, true); v.setUint32(16, 1, true); }));
  await emit(block(22, v => {
    v.setUint32(0, 0x06054b50, true); v.setUint16(8, 0xffff, true); v.setUint16(10, 0xffff, true);
    v.setUint32(12, 0xffffffff, true); v.setUint32(16, 0xffffffff, true);
  }));
}
