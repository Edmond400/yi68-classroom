'use client';
import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import type {Project} from '@/lib/rehearsal/model';
import {readingFilename} from '@/lib/rehearsal/reading-document';
import {waitForPlaybackIdle} from '@/lib/rehearsal/media-priority';

export function ReadingPreview({project}:{project:Project}){
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[url,setUrl]=useState(''),[page,setPage]=useState(1),[width,setWidth]=useState(750),[message,setMessage]=useState('滚动至此区域时自动准备朗读稿预览。'),[error,setError]=useState(''),[retry,setRetry]=useState(0),[visible,setVisible]=useState(false);
 const canvas=useRef<HTMLCanvasElement>(null),container=useRef<HTMLDivElement>(null),section=useRef<HTMLElement>(null),version=project.revision+':'+project.scriptVersion+':'+project.deckVersion;
 useEffect(()=>{const el=section.current;if(!el)return;const observer=new IntersectionObserver(items=>{if(items.some(item=>item.isIntersecting)){setVisible(true);observer.disconnect()}},{rootMargin:'200px'});observer.observe(el);return()=>observer.disconnect()},[]);
 useEffect(()=>{
  if(!visible)return;
  let live=true,document:PDFDocumentProxy|undefined,blobUrl='';const controller=new AbortController();setPdf(null);setUrl('');setPage(1);setError('');setMessage('正在准备朗读稿；回放期间优先播放音频…');
  (async()=>{
   await waitForPlaybackIdle(controller.signal);
   const {renderProjectReadingPdf}=await import('@/lib/rehearsal/reading-client');const bytes=await renderProjectReadingPdf(project,false,s=>{if(live)setMessage(s)},controller.signal);if(!live)return;
   blobUrl=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
   const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker-5.4.624.min.mjs';
   document=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;
   if(!live){await document.destroy();document=undefined;URL.revokeObjectURL(blobUrl);return}setUrl(blobUrl);setPdf(document);setMessage('');
  })().catch(e=>{if(live){setMessage('');setError((e as Error).message||'PDF预览生成失败')}});
  return()=>{live=false;controller.abort();if(blobUrl)URL.revokeObjectURL(blobUrl);void document?.destroy()};
 },[version,retry,visible]);
 useEffect(()=>{const el=container.current;if(!el)return;const measure=()=>setWidth(Math.max(200,Math.min(900,el.clientWidth-24)));measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect()},[]);
 useEffect(()=>{
  if(!pdf||!canvas.current)return;let live=true,task:{cancel:()=>void}|undefined;
  (async()=>{const pg=await pdf.getPage(page);if(!live||!canvas.current)return;const base=pg.getViewport({scale:1}),ratio=Math.min(2,window.devicePixelRatio||1),viewport=pg.getViewport({scale:width/base.width*ratio}),el=canvas.current;el.width=Math.ceil(viewport.width);el.height=Math.ceil(viewport.height);el.style.width=width+'px';el.style.height=viewport.height/ratio+'px';const render=pg.render({canvas:el,viewport});task=render;await render.promise})().catch(e=>{if(live&&e.name!=='RenderingCancelledException')setError('PDF页面显示失败，请重试。')});
  return()=>{live=false;task?.cancel()};
 },[pdf,page,width]);
 return <section ref={section} className="panel rh-pad rh-reading-preview"><h2>全组朗读稿 · PDF</h2><p>A4竖向，上方PPT、下方分工讲稿；每段标注朗读人并用不同颜色区分。稿件 {project.scriptVersion.slice(0,8)} / PPT {project.deckVersion.slice(0,8)}。</p>{message&&<p role="status" aria-live="polite">{message}</p>}{url&&<div className="rh-actions"><a className="btn secondary" download={readingFilename(project)} href={url}>下载全组朗读稿 PDF</a><button disabled={page<=1} onClick={()=>setPage(n=>n-1)}>上一页文稿</button><span>第{page} / {pdf?.numPages||1}页</span><button disabled={!pdf||page>=pdf.numPages} onClick={()=>setPage(n=>n+1)}>下一页文稿</button></div>}<div ref={container} className="rh-pdf-paper" aria-label="全组朗读稿PDF预览">{pdf&&<canvas ref={canvas} aria-label={'朗读稿第'+page+'页'}/>}</div>{error&&<p className="callout error" role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>重新生成预览</button></p>}</section>;
}
