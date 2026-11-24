import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {resolve,dirname} from 'node:path';import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{build}=require(require.resolve('esbuild',{paths:[dirname(require.resolve('wrangler/package.json'))]})),dir=mkdtempSync(resolve(tmpdir(),'rehearsal-cache-')),originalFetch=globalThis.fetch;
try{
 await build({stdin:{contents:`export * from './lib/rehearsal/slide-cache';export * from './lib/rehearsal/session';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:resolve(dir,'cache.mjs')});
 const a=await import(pathToFileURL(resolve(dir,'cache.mjs')).href),requests=[];let fail=true;
 globalThis.fetch=async(url,options)=>{requests.push({url,options});if(url.endsWith('/bad')&&fail)return new Response('failed',{status:503});return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/png'}})};
 const x=a.readSlideBlob('same');assert.equal(a.readSlideBlob('same'),x);await x;assert.equal(requests.length,1);
 await a.readSlideBlob('same',true);assert.equal(requests.length,2);assert(requests[0].url.startsWith('/api/rehearsal/'));assert(requests[1].url.startsWith('/api/admin/rehearsal/'));
 await assert.rejects(a.readSlideBlob('bad'));fail=false;await a.readSlideBlob('bad');assert.equal(requests.filter(r=>r.url.endsWith('/bad')).length,2,'failed page can be retried');
 a.prefetchSlides(['near','near','other','ignored']);await a.readSlideBlob('near');assert.equal(requests.filter(r=>r.url.endsWith('/near')).length,1);assert(!requests.some(r=>r.url.endsWith('/ignored')));
 for(let i=0;i<15;i++)await a.readSlideBlob('page-'+i);await a.readSlideBlob('same');assert.equal(requests.filter(r=>r.url==='/api/rehearsal/slides/same').length,2,'LRU cache is bounded');
 a.selectRehearsal('project-a','a'.repeat(64));await a.readSlideBlob('scoped');a.selectRehearsal('project-b','b'.repeat(64));await a.readSlideBlob('scoped');a.selectRehearsal('project-a','c'.repeat(64));await a.readSlideBlob('scoped');const scoped=requests.filter(r=>r.url.endsWith('/scoped'));assert.equal(scoped.length,3);assert.deepEqual(scoped.map(r=>r.options.headers['X-Yi68-Rehearsal-Project']),['project-a','project-b','project-a']);assert.notEqual(scoped[0].options.headers['X-Yi68-Rehearsal-Token'],scoped[2].options.headers['X-Yi68-Rehearsal-Token']);a.leaveRehearsal();
 console.log('PASS slide cache: in-flight deduplication, project/token and public/admin separation, prefetch limits, failure retry and bounded LRU');
}finally{globalThis.fetch=originalFetch;rmSync(dir,{recursive:true,force:true})}
