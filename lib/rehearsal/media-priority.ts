'use client';
const owners=new Set<symbol>(),listeners=new Set<()=>void>();
export function setPlaybackBusy(owner:symbol,busy:boolean){busy?owners.add(owner):owners.delete(owner);for(const listener of listeners)listener()}
export async function waitForPlaybackIdle(signal?:AbortSignal){
 if(signal?.aborted)throw new DOMException('已取消','AbortError');
 if(!owners.size)return;
 await new Promise<void>((resolve,reject)=>{
  const cleanup=()=>{listeners.delete(check);signal?.removeEventListener('abort',abort)};
  const abort=()=>{cleanup();reject(new DOMException('已取消','AbortError'))};
  const check=()=>{if(!owners.size){cleanup();resolve()}};
  listeners.add(check);signal?.addEventListener('abort',abort,{once:true});check();
 });
}
