'use client';
import { administratorHeaders } from './administrator-session';
export async function uploadAdministratorAttachment(file:File,itemId:string){
 const form=new FormData();form.append('file',file);form.append('item_id',itemId);
 return new Promise<{ok:boolean;id:string}>((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('POST','/api/upload',true);xhr.withCredentials=true;xhr.timeout=60000;
  for(const [key,value]of Object.entries(administratorHeaders()))xhr.setRequestHeader(key,value);
  xhr.onload=()=>{let value;try{value=JSON.parse(xhr.responseText)}catch{reject(new Error('服务器响应异常，请刷新页面后核对附件列表。'));return}
   if(xhr.status>=200&&xhr.status<300)resolve(value);else reject(new Error(value?.error||'上传失败。'))};
  xhr.onerror=()=>reject(new Error('上传连接未完成，请刷新页面后核对附件列表。'));
  xhr.ontimeout=()=>reject(new Error('上传超时，请刷新页面后核对附件列表。'));
  xhr.send(form);
 });
}
export async function downloadAdministratorFile(path:string,filename:string){
 if(!/^\/api\/(admin(?:\/|\?|$)|assets\/)/.test(path))throw new Error('下载地址无效。');
 const blob=await new Promise<Blob>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('GET',path,true);xhr.withCredentials=true;xhr.responseType='blob';xhr.timeout=30000;for(const [key,value]of Object.entries(administratorHeaders()))xhr.setRequestHeader(key,value);xhr.onload=async()=>{if(xhr.status>=200&&xhr.status<300){resolve(xhr.response);return}try{const data=JSON.parse(await xhr.response.text());reject(new Error(data.error||'下载未完成，请重试。'))}catch{reject(new Error('下载未完成，请重试。'))}};xhr.onerror=()=>reject(new Error('下载连接未完成，请重试。'));xhr.ontimeout=()=>reject(new Error('下载超时，请重试。'));xhr.send()});
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}

