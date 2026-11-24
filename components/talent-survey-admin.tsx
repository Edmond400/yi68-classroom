'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { administratorHeaders } from '@/lib/administrator-session';
type Row = { name:string; program:string; submitted_at:string };
const endpoint = '/api/admin/surveys/talent';
export function TalentSurveyAdmin() {
  const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function load(){setBusy(true);setError('');try{const data=await api(endpoint);setRows(data.rows)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  useEffect(()=>{void load()},[]);
  async function remove(row:Row){if(!window.confirm(`确定删除“${row.name}”的报名吗？`))return;setBusy(true);setError('');try{await api(endpoint,{name:row.name},'DELETE');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function download(){setBusy(true);setError('');try{const response=await fetch(endpoint+'?export=csv',{headers:administratorHeaders(),credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('导出失败，请刷新后重试。');const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download='艺68-才艺表演报名.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <section className="panel form-panel"><div className="panel-head"><h2>才艺表演报名 · {rows.length} 人</h2><div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button type="button" className="btn" disabled={busy} onClick={load}>刷新</button><button type="button" className="btn" disabled={busy} onClick={download}>下载 CSV</button></div></div>{error&&<p className="callout error" role="alert">{error}</p>}{rows.length===0?<p role="status">{busy?'正在读取报名…':'暂无报名。'}</p>:<div style={{overflowX:'auto'}}><table style={{width:'100%',minWidth:480,textAlign:'left'}}><thead><tr><th>姓名</th><th>节目名称</th><th>提交时间（北京时间）</th><th>操作</th></tr></thead><tbody>{rows.map(row=><tr key={row.name}><td>{row.name}</td><td style={{overflowWrap:'anywhere',maxWidth:320}}>{row.program}</td><td>{new Date(row.submitted_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</td><td><button type="button" disabled={busy} onClick={()=>remove(row)}>删除</button></td></tr>)}</tbody></table></div>}</section>;
}
