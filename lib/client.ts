'use client';
import {rehearsalHeaders} from './rehearsal/session';
import { studentSession } from './student-session';
import { administratorHeaders } from './administrator-session';
function studentRequest(path: string) { return /^\/api\/(account|participation|nickname)(\?|$)/.test(path)||/^\/api\/(activity-management|albums)(\/|\?|$)/.test(path); }
function administratorRequest(path:string){return /^\/api\/admin(\/|\?|$)/.test(path)}
function xhrJson(path: string, method: string, headers: Record<string,string>, body?: string, signal?: AbortSignal) {
  return new Promise<any>((resolve,reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method,path,true); xhr.withCredentials=true; xhr.timeout=20000;
    for(const [name,value] of Object.entries(headers)) xhr.setRequestHeader(name,value);
    xhr.onload=()=>{
      let data:any;try{data=JSON.parse(xhr.responseText)}catch{reject(new Error('服务器响应异常，请刷新页面后重试。'));return}
      if(xhr.status<200||xhr.status>=300){reject(new Error(data?.error||'操作未完成，请重试。'));return}
      resolve(data);
    };
    xhr.onerror=()=>reject(new Error('网络连接未完成，请检查网络后重试。'));
    xhr.ontimeout=()=>reject(new Error('请求超时，请稍后重试。'));
    xhr.onabort=()=>reject(new Error('请求已中断，请重试。'));
    const abort=()=>xhr.abort();signal?.addEventListener('abort',abort,{once:true});
    xhr.onloadend=()=>signal?.removeEventListener('abort',abort);
    xhr.send(body);
  });
}
export async function api(path: string, body?: unknown, method = 'POST') {
  const controller = typeof AbortController === 'undefined' ? undefined : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = async () => {
      const headers:Record<string,string>=body===undefined?{}:{'Content-Type':'application/json'};
      if(/\/api\/(?:admin\/)?rehearsal(?:\/|$)/.test(path))Object.assign(headers,rehearsalHeaders());
      if(administratorRequest(path)){
        Object.assign(headers,administratorHeaders());
        if(path==='/api/admin/auth'&&body!==undefined)headers['X-Yi68-Admin-Transport']='bearer';
        if(typeof XMLHttpRequest!=='undefined')return xhrJson(path,body===undefined?'GET':method,headers,body===undefined?undefined:JSON.stringify(body),controller?.signal);
      }
      if(studentRequest(path)){
        const token=studentSession();if(token)headers.Authorization='Bearer '+token;else if(path.startsWith('/api/albums/'))Object.assign(headers,administratorHeaders());
        if(path==='/api/account'&&body!==undefined)headers['X-Yi68-Session-Transport']='bearer';
        if(typeof XMLHttpRequest!=='undefined')return xhrJson(path,body===undefined?'GET':method,headers,body===undefined?undefined:JSON.stringify(body),controller?.signal);
      }
      let response: Response;
      try {
        response = await fetch(path, {
          method: body === undefined ? 'GET' : method, credentials: 'same-origin', cache: 'no-store',
          headers,
          body: body === undefined ? undefined : JSON.stringify(body), signal: controller?.signal,
        });
      } catch { throw new Error('网络连接未完成，请检查网络后重试。'); }
      let data: any;
      try { data = await response.json(); }
      catch { throw new Error('服务器响应异常，请刷新页面后重试。'); }
      if (!response.ok) throw new Error(data?.error || '操作未完成，请重试。');
      return data;
    };
    // Race the complete operation, including reading its body. Some embedded
    // browsers do not reliably reject a pending fetch when it is aborted.
    return await Promise.race([request(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('请求超时，请刷新页面后重试。若刚完成账号激活，可直接尝试登录。'));
        controller?.abort();
      }, 20000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
export function registerTool(tool: any) {const ctx=(document as any).modelContext;if(!ctx?.registerTool)return ()=>{};const life=new AbortController();try{Promise.resolve(ctx.registerTool(tool,{signal:life.signal})).catch(()=>{})}catch{}return ()=>life.abort()}
