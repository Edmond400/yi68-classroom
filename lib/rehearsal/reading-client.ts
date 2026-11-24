'use client';
import type {Project} from './model';
import {readSlideBlob} from './slide-cache';
import {waitForPlaybackIdle} from './media-priority';
let fontRequest:Promise<Uint8Array>|undefined;
function loadFont(){
 if(!fontRequest)fontRequest=fetch('/fonts/NotoSansSC-Reading.ttf.gz',{cache:'force-cache',signal:AbortSignal.timeout(45000)}).then(async r=>{if(!r.ok)throw new Error('中文字体读取失败，请检查网络后重试。');const bytes=new Uint8Array(await r.arrayBuffer());if(bytes[0]!==31||bytes[1]!==139)return bytes;const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));return new Uint8Array(await new Response(stream).arrayBuffer())}).catch(e=>{fontRequest=undefined;throw e});
 return fontRequest;
}
export async function renderProjectReadingPdf(project:Project,admin:boolean,onProgress:(s:string)=>void,signal?:AbortSignal){
 const yieldControl=async()=>{await waitForPlaybackIdle(signal);await new Promise(resolve=>setTimeout(resolve,0));await waitForPlaybackIdle(signal)};
 await yieldControl();
 const [{createReadingPdf},fontBytes]=await Promise.all([import('./reading-pdf'),loadFont()]);
 return createReadingPdf(project,{fontBytes,onProgress,yieldControl,loadSlide:async(id,index)=>{
  await yieldControl();
  let blob:Blob;try{blob=await readSlideBlob(id,admin)}catch(e){throw new Error('PPT第'+(index+1)+'页：'+(e as Error).message)}
  if(blob.type==='image/jpeg'||blob.type==='image/png')return {bytes:new Uint8Array(await blob.arrayBuffer()),mime:blob.type as 'image/jpeg'|'image/png'};
  if(blob.type!=='image/webp')throw new Error('PPT第'+(index+1)+'页图片格式不受支持。');
  const bitmap=await createImageBitmap(blob);
  try{
   const canvas=document.createElement('canvas'),scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器无法转换PPT页面');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const jpg=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PPT图片转换失败')),'image/jpeg',.9));canvas.width=canvas.height=0;return {bytes:new Uint8Array(await jpg.arrayBuffer()),mime:'image/jpeg'};
  }finally{bitmap.close()}
 }});
}
