'use client';
import { administratorHeaders } from './administrator-session';
export type PendingAlbumPhoto={id:string;file:File;progress:number;status:string;error?:string;previewUrl?:string;submissionKey?:string;authorName?:string};
export async function prepareAlbumPreview(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('仅支持 JPG、PNG、WebP 图片。');
 if(file.size>30*1024*1024)throw new Error('每张照片最大 30 MiB。');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('无法读取图片，请重新导出后上传。'));image.src=url});
  const width=image.naturalWidth,height=image.naturalHeight,scale=Math.min(1,960/Math.max(width,height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法生成预览图，请换用系统浏览器。');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const preview=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('预览图生成失败。')),'image/jpeg',.78));
  return {preview,width,height};
 }finally{URL.revokeObjectURL(url)}
}
export async function uploadAlbumClient(albumId:string,entry:PendingAlbumPhoto,onProgress:(progress:number)=>void,anonymous=false){
 const {preview,width,height}=await prepareAlbumPreview(entry.file),form=new FormData();
 form.append('author_name',entry.authorName||'');form.append('submission_key',entry.submissionKey||'');form.append('id',entry.id);form.append('file',entry.file);form.append('preview',preview,'preview.jpg');form.append('width',String(width));form.append('height',String(height));
 return new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST',`/api/${anonymous?'':'admin/'}albums/${albumId}/photos`,true);xhr.withCredentials=true;xhr.timeout=180000;const headers=anonymous?{}:administratorHeaders();for(const [name,value]of Object.entries(headers))xhr.setRequestHeader(name,value);
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*95))};
  xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText)}catch{reject(new Error('响应未完成，请核对照片列表后重试。'));return}if(xhr.status>=200&&xhr.status<300){onProgress(100);resolve()}else reject(new Error(data.error||'上传失败，请重试。'))};
  xhr.onerror=()=>reject(new Error('连接中断，请核对列表或点击重试。'));xhr.ontimeout=()=>reject(new Error('上传超时，请核对列表或点击重试。'));xhr.send(form);
 });
}

