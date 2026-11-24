'use client';
import {useState} from 'react';
import {api} from '@/lib/client';
import type {Project} from '@/lib/rehearsal/model';
import {readingFilename} from '@/lib/rehearsal/reading-document';

export function ReadingExport({project,dirty,busy,onBusy,group=false}:{project:Project;dirty:boolean;busy:boolean;onBusy:(value:boolean)=>void;group?:boolean}){
 const [progress,setProgress]=useState(''),[error,setError]=useState('');
 async function download(){
  onBusy(true);setError('');setProgress('正在读取当前已保存的编排…');
  try{
   // Fetch a fresh, authenticated snapshot rather than serializing editor state.
   const fresh=await api(group?'/api/rehearsal/edit':'/api/admin/rehearsal'),snapshot=fresh.project as Project|null;
   if(!snapshot)throw new Error('请先保存汇报内容。');
   if(snapshot.revision!==project.revision)throw new Error('编排已在其他窗口更新，请刷新后重新导出。');
   setProgress('正在准备中文字体与PDF排版…');
   const {renderProjectReadingPdf}=await import('@/lib/rehearsal/reading-client');
   const output=await renderProjectReadingPdf(snapshot,!group,setProgress);
   const url=URL.createObjectURL(new Blob([new Uint8Array(output)],{type:'application/pdf'})),link=document.createElement('a');link.href=url;link.download=readingFilename(snapshot);document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   setProgress('PDF已生成并开始下载：A4竖向，全组完整稿。');
  }catch(e){setProgress('');setError((e as Error).message||'导出失败，请重试。')}finally{onBusy(false)}
 }
 return <div className="rh-reading-export"><button className="btn secondary" disabled={busy||dirty||!project.revision} onClick={()=>void download()}>导出朗读稿 PDF</button><small>{dirty?'有未保存修改，请先保存后导出。':'A4竖向 · 上方PPT / 下方彩色分工讲稿 · 当前已保存编排（支持草稿）'}</small>{progress&&<p role="status" aria-live="polite">{progress}</p>}{error&&<p className="callout error" role="alert">{error} 可修正后重新点击导出。</p>}</div>;
}
