'use client';
import {rehearsalHeaders,rehearsalScope} from './session';
import {administratorHeaders} from '../administrator-session';
import type {Recording} from './model';
import {withWebmDuration} from './webm-duration';
type Entry={key:string;controller:AbortController;promise:Promise<Blob>;users:number;foreground:number;ready:boolean;bytes:number};
const entries=new Map<string,Entry>(),queue:{entry:Entry;run:()=>Promise<void>}[]=[];
let active=0;
function pump(){while(active<2&&queue.length){const task=queue.shift()!;active++;void task.run().finally(()=>{active--;pump()})}}
function trim(){let total=[...entries.values()].reduce((n,e)=>n+(e.ready?e.bytes:0),0),count=[...entries.values()].filter(e=>e.ready).length;for(const [key,e] of entries){if(count<=4&&total<=24*1024*1024)break;if(e.ready){entries.delete(key);total-=e.bytes;count--}}}
const aborted=()=>new DOMException('已取消','AbortError');
export function readAudioBlob(recording:Recording,admin=false,signal?:AbortSignal,prefetch=false):Promise<Blob>{
 if(signal?.aborted)return Promise.reject(aborted());
 const key=rehearsalScope()+':'+(admin?'admin:':'public:')+recording.id+':'+recording.hash;
 let entry=entries.get(key);
 if(!prefetch)for(const e of entries.values())if(e.key!==key&&!e.ready&&!e.foreground){e.controller.abort();entries.delete(e.key)}
 if(!entry){
  const controller=new AbortController();let resolve!:(b:Blob)=>void,reject!:(e:unknown)=>void;
  const promise=new Promise<Blob>((yes,no)=>{resolve=yes;reject=no});entry={key,controller,promise,users:0,foreground:0,ready:false,bytes:0};entries.set(key,entry);const target=entry;
  const task={entry,run:async()=>{
   let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort()},20000);
   try{
    if(controller.signal.aborted)throw aborted();
    const r=await fetch('/api/'+(admin?'admin/':'')+'rehearsal/audio/'+encodeURIComponent(recording.id),{credentials:'same-origin',headers:{...rehearsalHeaders(),...(admin?administratorHeaders():{})},signal:controller.signal});
    if(!r.ok)throw new Error(r.status===401?'管理员登录已失效':r.status===404?'这条录音已不存在':'音频读取失败（'+r.status+'）');
    const bytes=new Uint8Array(await r.arrayBuffer());if(controller.signal.aborted)throw aborted();
    if(bytes.byteLength!==recording.bytes)throw new Error('音频没有读取完整，请重新加载本段');
    const source=recording.mime==='audio/webm'?withWebmDuration(bytes,recording.durationMs):bytes;
    const blob=new Blob([new Uint8Array(source)],{type:recording.mime});target.ready=true;target.bytes=blob.size;trim();resolve(blob);
   }catch(e){if(entries.get(key)===target)entries.delete(key);reject(timedOut?new Error('音频读取超时，请重新加载本段'):e)}finally{clearTimeout(timer)}
  }};
  prefetch?queue.push(task):queue.unshift(task);pump();
 }else{entries.delete(key);entries.set(key,entry)}
 const target=entry;target.users++;if(!prefetch)target.foreground++;
 return new Promise<Blob>((resolve,reject)=>{
  let finished=false;
  const finish=()=>{if(finished)return false;finished=true;signal?.removeEventListener('abort',cancel);target.users--;if(!prefetch)target.foreground--;if(!target.users&&!target.ready){target.controller.abort();if(entries.get(key)===target)entries.delete(key)}return true};
  const cancel=()=>{if(finish())reject(aborted())};signal?.addEventListener('abort',cancel,{once:true});
  target.promise.then(blob=>{if(finish())resolve(blob)},e=>{if(finish())reject(e)});if(signal?.aborted)cancel();
 });
}
export function prefetchAudio(recordings:Recording[],admin=false){for(const r of [...new Map(recordings.map(r=>[r.id,r])).values()].slice(0,2))void readAudioBlob(r,admin,undefined,true).catch(()=>{})}
export function forgetAudio(recording:Recording,admin=false){const key=rehearsalScope()+':'+(admin?'admin:':'public:')+recording.id+':'+recording.hash;const e=entries.get(key);if(e){e.controller.abort();entries.delete(key)}}
