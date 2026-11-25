'use client';
import { useRef, useState } from 'react';
import { api } from '@/lib/client';
import { administratorHeaders } from '@/lib/administrator-session';
import type { AlbumExportPage, AlbumExportPhoto } from '@/lib/album-export';

type Sink = { write(bytes: Uint8Array<ArrayBuffer>): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
type SaveAs = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable(): Promise<Sink> }>;

export function AlbumExport({ albumId, classId, name, admin = false, disabled = false }: {
  albumId?: string; classId?: string; name: string; admin?: boolean; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const lock = useRef(false), controller = useRef<AbortController | null>(null);
  async function download() {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setStatus('正在准备照片清单…');
    const abort = new AbortController(); controller.current = abort;
    let sink: Sink | undefined, cleanup: (() => Promise<void>) | undefined, diskFile: (() => Promise<File>) | undefined;
    try {
      // Open the native save dialog during the original click activation.
      const picker = (window as Window & { showSaveFilePicker?: SaveAs }).showSaveFilePicker;
      if (picker) {
        let handle;
        try {
          handle = await picker.call(window, { suggestedName: name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80) + '_全部照片.zip', types: [{ description: '照片 ZIP 压缩包', accept: { 'application/zip': ['.zip'] } }] });
        } catch (reason) {
          if ((reason as Error).name === 'AbortError') throw reason;
          // Some embedded browsers expose the API but prohibit its use.
          // Fall through to a normal browser download in that context.
        }
        if (handle) sink = await handle.createWritable();
      }
      if (!sink && navigator.storage?.getDirectory) {
        // Embedded/mobile browsers can spool to temporary origin-private disk.
        try {
          const directory = await navigator.storage.getDirectory(), key = 'album-export-' + crypto.randomUUID() + '.zip';
          const file = await directory.getFileHandle(key, { create: true });
          cleanup = () => directory.removeEntry(key); sink = await file.createWritable();
          // Retain the disk-backed file until the browser has started its download.
          diskFile = () => file.getFile();
        } catch (reason) {
          await cleanup?.().catch(() => {}); cleanup = undefined;
          if (!['SecurityError', 'NotAllowedError', 'NotSupportedError'].includes((reason as Error).name)) throw reason;
        }
      }
      const { albumExportName, writeAlbumZip } = await import('@/lib/album-export');
      const prefix = admin ? '/api/admin/albums' : '/api/albums';
      const query = new URLSearchParams(albumId ? { album_id: albumId } : { class_id: classId || 'yi68' });
      const photos: AlbumExportPhoto[] = []; let cursor: string | null = null, snapshot = '';
      do {
        if (abort.signal.aborted) throw new DOMException('已取消', 'AbortError');
        if (cursor) query.set('after', cursor); if (snapshot) query.set('snapshot', snapshot);
        const page: AlbumExportPage = await api(prefix + '/export?' + query);
        photos.push(...page.photos); snapshot = page.snapshot; cursor = page.next_cursor;
        setStatus(`已找到 ${photos.length} 张照片，正在准备…`);
      } while (cursor);
      if (!photos.length) throw new Error('当前没有可导出的照片。');
      const chunks: Uint8Array<ArrayBuffer>[] = [], total = photos.reduce((sum, p) => sum + p.size, 0);
      let lastUpdate = 0;
      await writeAlbumZip(photos, async photo => {
        const response = await fetch(prefix + '/photos/' + encodeURIComponent(photo.id)+'?download=1&transfer=zip', {
          credentials: 'same-origin', cache: 'no-store', signal: abort.signal, headers: admin ? administratorHeaders() : {},
        });
        return response;
      }, async bytes => {
        if (abort.signal.aborted) throw new DOMException('已取消', 'AbortError');
        if (sink) await sink.write(bytes); else chunks.push(bytes);
      }, (done, bytes) => {
        if (Date.now() - lastUpdate < 150 && done !== photos.length) return;
        lastUpdate = Date.now(); setStatus(`正在打包 ${done}/${photos.length} 张 · ${Math.min(100, Math.round(bytes / total * 100))}%`);
      });
      if (sink) await sink.close();
      if (!sink || diskFile) {
        const blob = diskFile ? await diskFile() : new Blob(chunks, { type: 'application/zip' });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = albumExportName(name) + '_全部照片.zip'; document.body.appendChild(link); link.click(); link.remove();
        const remove = cleanup; cleanup = undefined;
        setTimeout(() => { URL.revokeObjectURL(url); void remove?.().catch(() => {}); }, 60_000);
      }
      setStatus(`已导出 ${photos.length} 张原图。`);
    } catch (reason) {
      await sink?.abort().catch(() => {}); await cleanup?.().catch(() => {});
      if ((reason as Error).name === 'AbortError') setStatus('已取消导出。');
      else { setError((reason as Error).message || '导出失败，请重试。'); setStatus(''); }
    } finally { lock.current = false; controller.current = null; setBusy(false); }
  }
  return <div className="album-export"><button type="button" className="btn" disabled={disabled || busy} onClick={download}>{busy ? '正在导出…' : '一键下载全部照片 ZIP'}</button>{busy && <button className="btn secondary" type="button" onClick={() => controller.current?.abort()}>取消导出</button>}{status && <p role="status">{status}</p>}{error && <p className="callout error" role="alert">{error}</p>}</div>;
}
