'use client';
import {rehearsalHeaders,rehearsalScope} from './session';
import {administratorHeaders} from '../administrator-session';
const cache=new Map<string,Promise<Blob>>();
export function readSlideBlob(id:string,admin=false):Promise<Blob>{
 const key=rehearsalScope()+':'+(admin?'admin:':'public:')+id,hit=cache.get(key);if(hit){cache.delete(key);cache.set(key,hit);return hit}
 const promise=fetch('/api/'+(admin?'admin/':'')+'rehearsal/slides/'+encodeURIComponent(id),{credentials:'same-origin',headers:{...rehearsalHeaders(),...(admin?administratorHeaders():{})},signal:AbortSignal.timeout(25000)}).then(async r=>{if(!r.ok)throw new Error(r.status===401?'管理员登录已失效':'PPT页加载失败');const blob=await r.blob();if(!blob.type.startsWith('image/'))throw new Error('页面图片格式有误');return blob});
 cache.set(key,promise);while(cache.size>10)cache.delete(cache.keys().next().value!);
 promise.catch(()=>{if(cache.get(key)===promise)cache.delete(key)});return promise;
}
export function prefetchSlides(ids:string[],admin=false){for(const id of [...new Set(ids)].slice(0,2))void readSlideBlob(id,admin).catch(()=>{})}
