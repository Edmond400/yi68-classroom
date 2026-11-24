'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { administratorHeaders } from '@/lib/administrator-session';
import type { SongRequest } from '@/lib/song-requests';
const endpoint = '/api/admin/song-requests';
export function SongRequestAdmin() {
  const [rows, setRows] = useState<SongRequest[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const pending = useRef(false), live = useRef(true), table = useRef<HTMLDivElement>(null);
  async function load(manual = false) {
    if (pending.current) return;
    pending.current = true;
    if (manual) setBusy(true);
    try { const data = await api(endpoint); if (live.current) { setRows(data.rows); setError(''); setLoaded(true); } }
    catch (e) { if (live.current) setError((e as Error).message); }
    finally { pending.current = false; if (live.current && manual) setBusy(false); }
  }
  useEffect(() => {
    live.current = true; void load(true);
    const timer = setInterval(() => { if (!document.hidden && !table.current?.contains(document.activeElement)) void load(); }, 10000);
    return () => { live.current = false; clearInterval(timer); };
  }, []);
  async function remove(row: SongRequest) {
    if (pending.current) return;
    pending.current = true;
    if (!window.confirm(`确定删除“${row.song}”的点歌记录吗？`)) { pending.current = false; return; }
    setBusy(true); setError('');
    try { await api(endpoint, { id: row.id }, 'DELETE'); setRows(current => current.filter(item => item.id !== row.id)); }
    catch (e) { setError((e as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }
  async function download() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(endpoint + '?export=csv', { headers: administratorHeaders(), credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('导出失败，请刷新后重试。');
      const url = URL.createObjectURL(await response.blob()), a = document.createElement('a');
      a.href = url; a.download = '艺68-现场点歌.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError((e as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="panel form-panel"><div className="panel-head"><h2>现场点歌 · {rows.length} 首</h2><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><button type="button" className="btn" disabled={busy} onClick={() => load(true)}>刷新</button><button type="button" className="btn" disabled={busy} onClick={download}>下载 CSV</button></div></div><p>按提交先后排列，页面打开期间约每10秒自动刷新。</p>{error && <p className="callout error" role="alert">{error}</p>}<div ref={table} style={{ overflowX: 'auto', marginTop: 16 }}>{rows.length === 0 ? <p role="status">{loaded ? '暂无点歌。' : '正在读取点歌…'}</p> : <table style={{ width: '100%', minWidth: 440, textAlign: 'left' }}><thead><tr><th>歌名</th><th>提交时间（北京时间）</th><th>操作</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td style={{ overflowWrap: 'anywhere', maxWidth: 320 }}>{row.song}</td><td>{new Date(row.submitted_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</td><td><button type="button" disabled={busy} onClick={() => remove(row)}>删除</button></td></tr>)}</tbody></table>}</div><details style={{ marginTop: 28 }}><summary>点歌二维码 · 查看和下载</summary><p style={{ marginTop: 12 }}><a href="/song-request">打开点歌页面</a> · <a href="/song-request-qr.png" download="艺68-现场点歌二维码.png">下载二维码 PNG</a></p><img src="/song-request-qr.png" width="320" height="320" style={{ maxWidth: '100%', height: 'auto', marginTop: 12 }} alt="艺68现场点歌二维码：扫码后填写歌名"/></details></section>;
}
