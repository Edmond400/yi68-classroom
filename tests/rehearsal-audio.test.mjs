import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{build}=require(require.resolve('esbuild',{paths:[dirname(require.resolve('wrangler/package.json'))]})),dir=mkdtempSync(resolve(tmpdir(),'rehearsal-audio-')),originalFetch=globalThis.fetch;
try{
 await build({stdin:{contents:`export * from './lib/rehearsal/audio-cache';export * from './lib/rehearsal/session';export * from './lib/rehearsal/audio-media';export * from './lib/rehearsal/webm-duration';export * from './lib/rehearsal/media-priority';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:resolve(dir,'audio.mjs')});
 const a=await import(pathToFileURL(resolve(dir,'audio.mjs')).href);
 const bytes=Uint8Array.from([0x1a,0x45,0xdf,0xa3,0x80,0x18,0x53,0x80,0x67,0x01,255,255,255,255,255,255,255,0x15,0x49,0xa9,0x66,0x87,0x2a,0xd7,0xb1,0x83,0x0f,0x42,0x40,0x1f,0x43,0xb6,0x75,0x01,255,255,255,255,255,255,255]);
 const original=new Uint8Array(bytes),patched=a.withWebmDuration(bytes,12345);assert.deepEqual(bytes,original);assert.equal(patched.length,bytes.length+11);assert.equal(patched[21],0x92);assert.equal(new DataView(patched.buffer).getFloat64(32),12345);assert.equal(a.withWebmDuration(patched,9999),patched);assert.deepEqual(a.withWebmDuration(new Uint8Array([1,2]),123),new Uint8Array([1,2]));
 const indexed=new Uint8Array([...bytes.slice(0,17),0x11,0x4d,0x9b,0x74,0x80,...bytes.slice(17)]);assert.equal(a.withWebmDuration(indexed,123),indexed);
 const lateIndex=new Uint8Array([...bytes.slice(0,29),0x11,0x4d,0x9b,0x74,0x80,...bytes.slice(29)]);assert.equal(a.withWebmDuration(lateIndex,123),lateIndex);
 const requests=[];let failure=false,slow=false,active=0,maxActive=0,aborts=0;
 globalThis.fetch=(url,options)=>new Promise((resolve,reject)=>{
  requests.push({url,options});active++;maxActive=Math.max(maxActive,active);let finished=false;
  const finish=()=>{if(finished)return false;finished=true;active--;clearTimeout(timer);options.signal.removeEventListener('abort',abort);return true};
  const abort=()=>{if(finish()){aborts++;reject(new DOMException('cancelled','AbortError'))}};
  const timer=setTimeout(()=>{if(finish())resolve(new Response(failure?'failed':bytes,{status:failure?503:200,headers:{'Content-Type':'audio/webm'}}))},slow?100:1);
  options.signal.addEventListener('abort',abort,{once:true});if(options.signal.aborted)abort();
 });
 const rec=id=>({id,hash:'h',bytes:bytes.length,mime:'audio/webm',durationMs:12345});
 const [one,two]=await Promise.all([a.readAudioBlob(rec('same')),a.readAudioBlob(rec('same'))]);assert.equal(one,two);assert.equal(requests.length,1);await a.readAudioBlob(rec('same'));assert.equal(requests.length,1);await a.readAudioBlob(rec('same'),true);assert.equal(requests.length,2);assert(requests[1].url.startsWith('/api/admin/'));
 failure=true;await assert.rejects(a.readAudioBlob(rec('failed')),/503/);failure=false;await a.readAudioBlob(rec('failed'));assert.equal(requests.filter(r=>r.url.endsWith('/failed')).length,2);
 slow=true;const controller=new AbortController(),cancelled=a.readAudioBlob(rec('cancelled'),false,controller.signal);controller.abort();await assert.rejects(cancelled,{name:'AbortError'});await a.readAudioBlob(rec('cancelled'));assert.equal(requests.filter(r=>r.url.endsWith('/cancelled')).length,2);
 a.prefetchAudio([rec('background-a'),rec('background-b')]);await new Promise(r=>setTimeout(r,5));await a.readAudioBlob(rec('foreground'));assert(aborts>=3);assert(maxActive<=2);
 slow=false;for(let i=0;i<7;i++)await a.readAudioBlob(rec('lru-'+i));await a.readAudioBlob(rec('same'));assert.equal(requests.filter(r=>r.url==='/api/rehearsal/audio/same').length,2);
 a.selectRehearsal('project-a','a'.repeat(64));await a.readAudioBlob(rec('scoped'));a.selectRehearsal('project-b','b'.repeat(64));await a.readAudioBlob(rec('scoped'));assert.equal(requests.filter(r=>r.url.endsWith('/scoped')).length,2);assert.deepEqual(requests.filter(r=>r.url.endsWith('/scoped')).map(r=>r.options.headers['X-Yi68-Rehearsal-Project']),['project-a','project-b']);a.leaveRehearsal();
 const bad={...rec('truncated'),bytes:10000};await assert.rejects(a.readAudioBlob(bad),/没有读取完整/);
 class Media extends EventTarget{
  readyState=0;error=null;seeking=false;src='';time=0;loads=0;seeks=0;
  get currentTime(){return this.time}set currentTime(n){this.seeks++;this.time=n}
  getAttribute(){return this.src}
  load(){this.loads++;queueMicrotask(()=>{this.readyState=2;this.dispatchEvent(new Event('loadedmetadata'));this.dispatchEvent(new Event('loadeddata'))})}
  play(){return Promise.resolve()}
 }
 const media=new Media(),signal=new AbortController();await a.prepareAudio(media,'blob:test',0,signal.signal);assert.equal(media.seeks,0);await a.prepareAudio(media,'blob:test',5,signal.signal);assert.equal(media.loads,1);assert.equal(media.currentTime,5);
 const waiting=new Media();waiting.load=()=>{};const abort=new AbortController(),pending=a.prepareAudio(waiting,'blob:pending',0,abort.signal);abort.abort();await assert.rejects(pending,{name:'AbortError'});
 await a.playAudio(media,signal.signal);media.play=()=>Promise.reject(new DOMException('blocked','NotAllowedError'));await assert.rejects(a.playAudio(media,signal.signal),{name:'NotAllowedError'});assert(a.playbackError(new DOMException('blocked','NotAllowedError')).includes('无需等待权限弹窗'));assert(!a.playbackError(new Error('音频读取超时')).includes('浏览器阻止'));
 const originalTimer=globalThis.setTimeout;let trigger;
 globalThis.setTimeout=(fn,ms,...args)=>{if(ms===20000)trigger=fn;return originalTimer(fn,ms,...args)};
 globalThis.fetch=(_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError')),{once:true}));
 try{const timeout=a.readAudioBlob(rec('timeout'));assert(trigger);trigger();await assert.rejects(timeout,/音频读取超时/)}finally{globalThis.setTimeout=originalTimer}
 const owner=Symbol();a.setPlaybackBusy(owner,true);let idle=false;const pause=a.waitForPlaybackIdle().then(()=>{idle=true});await Promise.resolve();assert.equal(idle,false);a.setPlaybackBusy(owner,false);await pause;assert.equal(idle,true);
 console.log('PASS audio: duration repair without source mutation/index damage; shared cache, project/token and protected/public separation, cancellation/retry, foreground priority, 2-request concurrency and bounded LRU, truncated response rejection, local media preparation, cancellation, truthful timeout errors and PDF scheduling');
}finally{globalThis.fetch=originalFetch;rmSync(dir,{recursive:true,force:true})}
