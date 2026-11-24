'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
export function AttachmentStorageStatus(){
 const [value,setValue]=useState<any>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function load(audit=false){setBusy(true);setError('');try{setValue(await api('/api/admin/storage'+(audit?'?audit=1':'')))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);
 return <div style={{marginTop:16}}><p className="small">{value?`普通附件：D1 ${value.stats.d1} 份 · R2 ${value.stats.r2} 份 · 已迁移 ${value.stats.migrated} 份 · 总计 ${(value.stats.bytes/1024/1024).toFixed(2)} MB · 异常 ${value.anomaly_count} 份 · 孤立对象 ${value.orphans.length} 份`:'正在读取附件存储情况…'}</p><button type="button" className="text-link" disabled={busy} onClick={()=>void load(true)}>{busy?'正在核对…':'核对全部附件完整性'}</button>{value?.audit&&<p className="small">本次已读取全部附件并核对大小与校验信息。</p>}{error&&<p role="alert">{error}</p>}</div>
}
