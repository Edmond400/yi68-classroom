'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { administratorHeaders } from '@/lib/administrator-session';
import { api } from '@/lib/client';
import { favoriteCharacterAdminApi, favoriteCharacterFilename, favoriteCharacterPath, type FavoriteCharacterResponse, type FavoriteCharacterSurvey } from '@/lib/favorite-character-model';
import type { FavoriteCharacterExportMode } from '@/lib/favorite-character-export';
import styles from './favorite-character-survey-admin.module.css';

type Results = { survey: FavoriteCharacterSurvey; responses: FavoriteCharacterResponse[] };
const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' });
const memoryZipLimit = 64 * 1024 * 1024;
type FileSink = { write(bytes: Uint8Array<ArrayBuffer>): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
type SaveAs = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable(): Promise<FileSink> }>;

async function imageResponse(id: string, signal?: AbortSignal) {
  const response = await fetch(`${favoriteCharacterAdminApi}/image/${encodeURIComponent(id)}`, {
    credentials: 'same-origin', cache: 'no-store', headers: administratorHeaders(), signal,
  });
  if (!response.ok) throw new Error(response.status === 401 ? '登录已过期，请重新登录。' : '图片暂时无法读取，请重试。');
  return response;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename; link.href = url;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function ImagePreview({ id, filename, size }: { id: string; filename: string; size: number }) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const large = size > 5 * 1024 * 1024;
  useEffect(() => {
    if (large) return;
    const target = element.current;
    if (!target || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '150px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [large]);
  useEffect(() => {
    if (!visible) return;
    let objectUrl = '';
    const controller = new AbortController();
    setError('');
    imageResponse(id, controller.signal).then(response => response.blob()).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, visible, retry]);

  return <div ref={element} className={styles.preview}>
    {url ? <><a href={url} target="_blank" rel="noreferrer" aria-label={`查看图片 ${filename} 原图`}>
      {/* Browser-local object URLs preserve the authenticated image read. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`投稿图片 ${filename}`} onError={() => { setUrl(''); setError('这张图片无法预览，请核对原图。'); }} />
    </a><a className="text-link" href={url} download={filename}>下载 {filename}</a></>
      : error ? <><p className="field-hint" role="alert">{error}</p><button className="btn secondary" type="button" onClick={() => setRetry(n => n + 1)}>重试预览</button></>
        : large && !visible ? <button className="btn secondary" type="button" onClick={() => setVisible(true)}>加载原图预览（{(size / 1024 / 1024).toFixed(1)} MB）</button>
          : <p className="field-hint">{visible ? '正在读取图片…' : '图片预览'}</p>}
  </div>;
}

export function FavoriteCharacterSurveyAdmin() {
  const [survey, setSurvey] = useState<FavoriteCharacterSurvey>();
  const [responses, setResponses] = useState<FavoriteCharacterResponse[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [choices, setChoices] = useState(new Map<string, string>());
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<FavoriteCharacterExportMode | 'csv' | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [resultsStatus, setResultsStatus] = useState('');
  const [resultsError, setResultsError] = useState('');

  useEffect(() => {
    let active = true;
    api(favoriteCharacterAdminApi).then((data: Results) => {
      if (!active) return;
      setSurvey(data.survey); setSavedOpen(data.survey.open); setResponses(data.responses);
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!survey || saving) return;
    setSaving(true); setError(''); setStatus('');
    try {
      const data = await api(favoriteCharacterAdminApi, survey);
      setSurvey(data.survey); setSavedOpen(data.survey.open);
      setStatus(data.survey.open ? '已保存，问卷正在收集。' : '已保存，当前不接收新投稿。');
    } catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  }

  async function refresh() {
    setRefreshing(true); setResultsError(''); setResultsStatus('');
    try { const data: Results = await api(favoriteCharacterAdminApi); setResponses(data.responses); }
    catch (error) { setResultsError((error as Error).message); }
    finally { setRefreshing(false); }
  }

  const indexed = responses.map((response, offset) => ({ response, index: offset + 1 }));
  const byName = new Map<string, string>();
  const nameCounts = new Map<string, number>();
  for (const response of responses) {
    if (!byName.has(response.name) || choices.get(response.name) === response.id) byName.set(response.name, response.id);
    nameCounts.set(response.name, (nameCounts.get(response.name) ?? 0) + 1);
  }
  const selected = indexed.filter(({ response }) => byName.get(response.name) === response.id);

  async function downloadImages(mode: FavoriteCharacterExportMode) {
    const rows = mode === 'stage' ? selected : indexed;
    if (exporting || !rows.length) return;
    setExporting(mode); setResultsError(''); setResultsStatus('');
    const filename = mode === 'stage' ? 'yi68-character-display.zip' : '艺68角色图片_实名归档.zip';
    let sink: FileSink | undefined;
    try {
      const totalBytes = rows.reduce((sum, { response }) => sum + response.size, 0);
      if (totalBytes > memoryZipLimit) {
        const pickSave = (window as Window & { showSaveFilePicker?: SaveAs }).showSaveFilePicker;
        if (!pickSave) throw new Error('这批图片较大，请用桌面版 Chrome 或 Edge 一次保存；也可以先下载清单或逐张下载。');
        // The picker must happen within the original click's browser activation.
        const handle = await pickSave.call(window, { suggestedName: filename, types: [{ description: 'ZIP 压缩包', accept: { 'application/zip': ['.zip'] } }] });
        sink = await handle.createWritable();
      }
      const { favoriteCharacterExportPlan, writeFavoriteCharacterZip } = await import('@/lib/favorite-character-export');
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      await writeFavoriteCharacterZip(favoriteCharacterExportPlan(rows, mode), mode, imageResponse, async bytes => {
        if (sink) await sink.write(bytes); else chunks.push(bytes);
      }, count => setResultsStatus(`正在打包图片（${count}/${rows.length}）…`));
      if (sink) await sink.close();
      else saveBlob(new Blob(chunks, { type: 'application/zip' }), filename);
      setResultsStatus(mode === 'stage' ? `已打包 ${rows.length} 张现场图片，文件名只含编号。` : `已打包 ${rows.length} 张原图及提交清单。实名归档请勿投屏或群发。`);
    } catch (error) {
      await sink?.abort().catch(() => {});
      if ((error as Error).name === 'AbortError') setResultsStatus('已取消保存。');
      else { setResultsError((error as Error).message); setResultsStatus(''); }
    } finally { setExporting(null); }
  }

  async function downloadCsv() {
    if (exporting || !indexed.length) return;
    setExporting('csv'); setResultsError(''); setResultsStatus('');
    try {
      const { favoriteCharacterArchiveCsv, favoriteCharacterExportPlan } = await import('@/lib/favorite-character-export');
      const csv = favoriteCharacterArchiveCsv(favoriteCharacterExportPlan(indexed, 'archive'));
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), '艺68角色图片_提交清单.csv');
      setResultsStatus(`已导出 ${indexed.length} 份投稿的实名清单。`);
    } catch (error) { setResultsError((error as Error).message); }
    finally { setExporting(null); }
  }

  if (!survey) return error ? <p className="callout error" role="alert">{error}</p> : <p className="callout" role="status">正在读取问卷…</p>;

  return <div className={styles.admin}>
    <form className="panel form-panel" onSubmit={save}>
      <div className={styles.toolbar}>
        <h2>问卷设置</h2><a className="text-link" href={favoriteCharacterPath} target="_blank" rel="noreferrer">打开发送给同学的链接</a>
      </div>
      <p className="field-hint">当前状态：{savedOpen ? '收集中' : '未开放'}</p>
      <fieldset className={styles.settings} disabled={saving}>
        <label className={styles.toggle}><input type="checkbox" checked={survey.open} onChange={event => setSurvey({ ...survey, open: event.target.checked })} />开放收集</label>
        <label>问卷标题<input value={survey.title} required maxLength={100} onChange={event => setSurvey({ ...survey, title: event.target.value })} /></label>
        <label>开头说明<textarea rows={3} value={survey.description} required maxLength={600} onChange={event => setSurvey({ ...survey, description: event.target.value })} /></label>
        <label>图片题提示<input value={survey.imageHint} maxLength={180} onChange={event => setSurvey({ ...survey, imageHint: event.target.value })} /></label>
        <button className="btn" type="submit">{saving ? '保存中…' : '保存并生效'}</button>
      </fieldset>
      {status && <p className="callout" role="status">{status}</p>}
      {error && <p className="callout error" role="alert">{error}</p>}
    </form>
    <section className="panel form-panel">
      <div className={styles.toolbar}>
        <h2>收到 {responses.length} 份（{byName.size} 个不同姓名）</h2>
        <button className="btn secondary" type="button" onClick={refresh} disabled={refreshing || !!exporting}>{refreshing ? '刷新中…' : '刷新投稿'}</button>
      </div>
      <p className="field-hint">现场包只有编号图片；实名归档含所有原图和提交清单，仅供班务核对，请勿投屏或群发。现场包遇同名补交时默认选最早一张，可在下面改选。</p>
      <div className={styles.exports}>
        <button className="btn" type="button" onClick={() => downloadImages('stage')} disabled={!selected.length || !!exporting || refreshing}>下载现场图片 ZIP（{selected.length} 张，无姓名）</button>
        <button className="btn secondary" type="button" onClick={() => downloadImages('archive')} disabled={!indexed.length || !!exporting || refreshing}>下载实名归档 ZIP（{indexed.length} 张＋清单）</button>
        <button className="btn secondary" type="button" onClick={downloadCsv} disabled={!indexed.length || !!exporting || refreshing}>仅下载提交清单 CSV</button>
      </div>
      {resultsStatus && <p className="callout" role="status">{resultsStatus}</p>}
      {resultsError && <p className="callout error" role="alert">{resultsError}</p>}
      {!responses.length ? <p className="field-hint">目前还没有投稿。</p> : <ul className={styles.grid}>
        {indexed.map(({ response, index }) => {
          const filename = favoriteCharacterFilename(index, response.mime);
          const duplicate = (nameCounts.get(response.name) ?? 0) > 1;
          return <li key={response.id} className={styles.card}>
            <ImagePreview id={response.id} filename={filename} size={response.size} />
            <h3>{response.name}</h3>
            {response.character && <p className={styles.character}>{response.character}</p>}
            <time className="field-hint" dateTime={response.created_at}>{date.format(new Date(response.created_at))}</time>
            {duplicate && <label className={styles.toggle}>
              <input type="radio" name={`stage-${response.name}`} checked={byName.get(response.name) === response.id} disabled={!!exporting}
                onChange={() => setChoices(previous => new Map(previous).set(response.name, response.id))} />同名投稿：选这张作现场图
            </label>}
          </li>;
        })}
      </ul>}
    </section>
  </div>;
}
