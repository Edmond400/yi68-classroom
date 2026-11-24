'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { homeworkSummary, type HomeworkData, type HomeworkRow } from '@/lib/color-homework-model';
import styles from './color-homework.module.css';

function timeLabel(value: string | null) {
 return value ? new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value)) : '尚无登记';
}
export function ColorHomeworkAdmin() { return <ColorHomeworkView admin/>; }
export function ColorHomeworkView({admin=false}:{admin?:boolean}) {
 const [data,setData]=useState<HomeworkData|null>(null),[error,setError]=useState(''),[blocked,setBlocked]=useState(false),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const editing=useRef(new Set<string>()),live=useRef(true),requestVersion=useRef(0);
 const endpoint=admin?'/api/admin/color-homework':'/api/color-homework';
 const apply=useCallback((next:HomeworkData)=>{
  if(!live.current)return;
  setData(previous=>{
   // Slower responses from another row must never overwrite a newer saved row.
   const rows=next.rows.map(r=>{const old=admin?previous?.rows.find(p=>p.id===r.id):undefined;return old&&old.version>r.version?old:r});
   return {rows,summary:homeworkSummary(rows)};
  });setBlocked(false);
 },[admin]);
 const load=useCallback(async()=>{
  const version=++requestVersion.current;
  try { const next:HomeworkData=await api(endpoint);if(live.current&&version===requestVersion.current){apply(next);setError('')}return next; }
  catch(e){if(live.current&&version===requestVersion.current){setError((e as Error).message);setBlocked(true)}throw e}
 },[endpoint,apply]);
 useEffect(()=>{
  live.current=true;void load().catch(()=>{});
  const refresh=()=>{if(!document.hidden&&!editing.current.size)void load().catch(()=>{})};
  const timer=setInterval(refresh,20000);window.addEventListener('focus',refresh);
  const protect=(e:BeforeUnloadEvent)=>{if(editing.current.size){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',protect);
  return()=>{live.current=false;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('beforeunload',protect)};
 },[load]);
 if(!data||blocked)return <section className={'panel '+styles.panel}>{error?<><p className="callout error" role="alert">{error} 请重新读取，核对实际保存结果。</p><button className="btn secondary" onClick={()=>void load().catch(()=>{})}>重新读取</button></>:<p role="status">正在读取上交进度…</p>}</section>;
 const summary=homeworkSummary(data.rows),own=data.rows.find(r=>r.is_me);
 const matches=(r:HomeworkRow)=>r.name.includes(query.trim())&&(filter==='all'||(filter==='submitted'?r.submitted:!r.submitted));
 return <section className={'panel '+styles.panel}>
  <div className={styles.stats}><div><span>全班人数</span><strong>{summary.total}</strong></div><div><span>已交人数</span><strong>{summary.submitted}</strong></div><div><span>未交人数</span><strong>{summary.pending}</strong></div><div><span>已交总张数</span><strong>{summary.sheets}</strong></div></div>
  <div className={styles.progress}><progress aria-label="已交人数占比" value={summary.submitted} max={summary.total||1}/><span>{summary.percentage}% 已交</span></div>
  <p className={styles.status}>最后更新时间：{timeLabel(summary.updated_at)} · 每20秒自动更新</p>
  {admin?<p className={styles.status}>先填写张数，再勾选“已交老师”。修改自动保存；撤销后保留原张数，不计入已交统计。</p>:own&&<p className={styles.myRecord}><strong>我的记录 · {own.name}</strong>　{own.submitted?`已交老师 · ${own.sheet_count}张`:'尚未登记移交老师'}</p>}
  <div className={styles.tools}><input type="search" aria-label="搜索姓名" placeholder="搜索姓名" value={query} onChange={e=>setQuery(e.target.value)}/><div className={styles.filters}>{[['all','全部'],['submitted','已交'],['pending','未交']].map(([value,label])=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div><button type="button" className="btn secondary" disabled={editing.current.size>0} onClick={()=>void load().catch(()=>{})}>刷新</button></div>
  <div className={styles.head} aria-hidden="true"><span>姓名</span><span>已交老师</span><span>已交张数</span></div>
  {data.rows.map((row,index)=><div key={row.id||index} hidden={!matches(row)}><HomeworkRecord row={row} admin={admin} onSaved={apply} onReconcile={load} onEditing={value=>{const key=row.id||String(index);if(value)editing.current.add(key);else editing.current.delete(key)}}/></div>)}
  {!data.rows.some(matches)&&<p className="muted">没有符合条件的同学。</p>}
 </section>;
}
function HomeworkRecord({row,admin,onSaved,onReconcile,onEditing}:{row:HomeworkRow;admin:boolean;onSaved:(data:HomeworkData)=>void;onReconcile:()=>Promise<HomeworkData>;onEditing:(value:boolean)=>void}) {
 const [count,setCount]=useState(row.sheet_count?String(row.sheet_count):''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const input=useRef<HTMLInputElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),locked=useRef(false),current=useRef(row),editor=useRef(onEditing);current.current=row;editor.current=onEditing;
 const cancel=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null}};
 useEffect(()=>{setCount(row.sheet_count?String(row.sheet_count):'')},[row.version,row.sheet_count]);
 useEffect(()=>()=>{cancel();editor.current(false)},[]);
 function valid(value:string,submitted:boolean) {return (value===''?!submitted:/^\d+$/.test(value))&&Number.isSafeInteger(Number(value))&&Number(value)<=2147483647&&(!submitted||Number(value)>0)}
 async function save(value:string,submitted:boolean) {
  cancel();if(locked.current)return;
  if(!valid(value,submitted)){setError('请填写大于零的整数张数后再勾选。');input.current?.focus();editor.current(false);return}
  if(submitted===current.current.submitted&&Number(value)===current.current.sheet_count){editor.current(false);return}
  locked.current=true;setBusy(true);setError('');setSaved(false);editor.current(true);
  try { const next=await api('/api/admin/color-homework',{student_id:current.current.id,submitted,sheet_count:Number(value),version:current.current.version},'PATCH');onSaved(next);setSaved(true); }
  catch(e){setError((e as Error).message);setCount(current.current.sheet_count?String(current.current.sheet_count):'');try{await onReconcile()}catch{/* Parent hides unverified data until a successful read. */}}
  finally {locked.current=false;setBusy(false);editor.current(false)}
 }
 function change(value:string) {
  cancel();setCount(value);setSaved(false);setError('');editor.current(true);
  if(valid(value,row.submitted))timer.current=setTimeout(()=>void save(value,current.current.submitted),650);
  else setError('张数须为有效整数；已交老师时必须大于零。');
 }
 return <div className={styles.row+(row.is_me?' '+styles.mine:'')}>
  <div className={styles.name}><strong>{row.name}{row.is_me?'（我）':''}</strong>{row.updated_at&&<small>{timeLabel(row.updated_at)}</small>}</div>
  {admin?<><input type="checkbox" aria-label={`${row.name}已交老师`} checked={row.submitted} disabled={busy} onChange={e=>void save(count,e.target.checked)}/><input ref={input} type="number" aria-label={`${row.name}已交张数`} inputMode="numeric" min={row.submitted?1:0} max={2147483647} step={1} value={count} placeholder="张数" disabled={busy} onChange={e=>change(e.target.value)} onBlur={()=>{if(!valid(count,row.submitted)){cancel();setCount(row.sheet_count?String(row.sheet_count):'');editor.current(false)}}} onKeyDown={e=>{if(e.key==='Enter')void save(count,row.submitted)}}/></>
   : <><span>{row.submitted?'已交老师':'未交'}</span><span>{row.submitted?`${row.sheet_count} 张`:'—'}</span></>}
  {admin&&(busy||saved)&&<p className={styles.saved} role="status">{busy?'正在保存…':'已保存'}</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
 </div>;
}
