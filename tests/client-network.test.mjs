import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [dirname(require.resolve('wrangler/package.json'))] }));
const outfile = resolve(root, '.sites-runtime/client-test.mjs');
mkdirSync(dirname(outfile), { recursive: true });
await build({ stdin:{contents:'export * from '+JSON.stringify(resolve(root,'lib/client.ts'))+'; export * from '+JSON.stringify(resolve(root,'lib/student-session.ts'))+'; export * from '+JSON.stringify(resolve(root,'lib/administrator-session.ts'))+';',resolveDir:root,loader:'ts'}, bundle: true, format: 'esm', platform: 'node', outfile });
const { api,saveStudentSession,studentSession,clearStudentSession,administratorSession,saveAdministratorSession,clearAdministratorSession } = await import(pathToFileURL(outfile).href);
const original = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, AbortController: globalThis.AbortController, XMLHttpRequest:globalThis.XMLHttpRequest,sessionStorage:globalThis.sessionStorage };
let callback, cleared, options;
globalThis.setTimeout = (fn, ms) => { assert.equal(ms, 20000); callback = fn; return 123; };
globalThis.clearTimeout = id => { assert.equal(id, 123); cleared = true; };
try {
  globalThis.fetch = async (_, init) => { options = init; return Response.json({ ok: true }); };
  assert.deepEqual(await api('/api/account', { action: 'logout' }), { ok: true });
  assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store'); assert.equal(options.method, 'POST'); assert(cleared);
  globalThis.fetch = async () => Response.json({ error: '账号错误' }, { status: 401 });
  await assert.rejects(api('/api/account'), /账号错误/);
  globalThis.fetch = async () => new Response('<html>gateway</html>', { status: 502 });
  await assert.rejects(api('/api/participation'), /服务器响应异常/);
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(api('/api/participation'), /网络连接未完成/);
  for (const supportsAbort of [true, false]) {
    globalThis.AbortController = supportsAbort ? original.AbortController : undefined;
    globalThis.fetch = () => new Promise(() => {});
    const pending = api('/api/participation'); callback();
    await assert.rejects(pending, /请求超时/);
    globalThis.fetch = async () => ({ ok: true, json: () => new Promise(() => {}) });
    const bodyPending = api('/api/participation'); await Promise.resolve(); callback();
    await assert.rejects(bodyPending, /请求超时/);
  }
  console.log('PASS JSON errors, HTML gateways, offline connections, stalled fetch and stalled response bodies, with and without AbortController');
  globalThis.AbortController=original.AbortController;
  globalThis.sessionStorage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')},removeItem(){throw new Error('blocked')}};
  saveStudentSession('c'.repeat(64));assert.equal(studentSession(),'c'.repeat(64));
  let lastXhr, xhrReply=()=>({status:200,body:JSON.stringify({student:{name:'虚构同学'}})});
  globalThis.XMLHttpRequest=class{
    constructor(){lastXhr=this;this.headers={};}
    open(method,path){this.method=method;this.path=path;}
    setRequestHeader(name,value){this.headers[name]=value;}
    send(body){this.body=body;const response=xhrReply();this.status=response.status;this.responseText=response.body;if(response.network)this.onerror();else this.onload();this.onloadend();}
    abort(){this.onabort();}
  };
  assert.deepEqual(await api('/api/account'),{student:{name:'虚构同学'}});assert.equal(lastXhr.headers.Authorization,'Bearer '+'c'.repeat(64));assert.equal(lastXhr.path,'/api/account');assert.equal(lastXhr.timeout,20000);
  await api('/api/account',{action:'login',name:'虚构同学',password:'fictional'});assert.equal(lastXhr.method,'POST');assert.equal(lastXhr.headers['X-Yi68-Session-Transport'],'bearer');assert(!lastXhr.path.includes('fictional'));assert.equal(lastXhr.withCredentials,true);
  await api('/api/participation',{id:'fictional'});assert.equal(lastXhr.headers.Authorization,'Bearer '+'c'.repeat(64));
  await api('/api/activity-management');assert.equal(lastXhr.headers.Authorization,'Bearer '+'c'.repeat(64));assert.equal(lastXhr.path,'/api/activity-management');
  xhrReply=()=>({status:401,body:JSON.stringify({error:'请重新登录'})});await assert.rejects(api('/api/account'),/请重新登录/);
  xhrReply=()=>({status:502,body:'gateway'});await assert.rejects(api('/api/account'),/服务器响应异常/);
  xhrReply=()=>({network:true});await assert.rejects(api('/api/account'),/网络连接未完成/);
  xhrReply=()=>({status:200,body:'{"ok":true}'});
  await api('/api/admin');assert(!lastXhr.headers.Authorization);
  await api('/api/nickname',{nickname:'小树'});assert.equal(lastXhr.headers.Authorization,'Bearer '+'c'.repeat(64));
  await api('/api/activity-management/simulate',{kind:'month'});assert.equal(lastXhr.headers.Authorization,'Bearer '+'c'.repeat(64));
  saveAdministratorSession('d'.repeat(64));assert.equal(administratorSession(),'d'.repeat(64));
  await api('/api/admin/auth',{action:'login',username:'admin',password:'fictional'});assert.equal(lastXhr.headers.Authorization,'Bearer '+'d'.repeat(64));assert.equal(lastXhr.headers['X-Yi68-Admin-Transport'],'bearer');
  await api('/api/admin/color-homework',{student_id:'synthetic',submitted:true,sheet_count:30,version:0},'PATCH');assert.equal(lastXhr.headers.Authorization,'Bearer '+'d'.repeat(64));assert.equal(lastXhr.method,'PATCH');
  await api('/api/admin/incentives/simulate',{kind:'month'});assert.equal(lastXhr.headers.Authorization,'Bearer '+'d'.repeat(64));
  await api('/api/nickname');assert.equal(lastXhr.headers.Authorization,'Bearer '+'c'.repeat(64));
  globalThis.fetch=async(_,init)=>{options=init;return Response.json({ok:true})};await api('https://other.test/api/admin');assert(!options.headers.Authorization);
  await api('/api/color-homework');assert(!options.headers.Authorization);assert.equal(options.method,'GET');
  clearAdministratorSession();assert.equal(administratorSession(),null);await api('/api/admin/auth');assert(!lastXhr.headers.Authorization);

  clearStudentSession();assert.equal(studentSession(),null);
  console.log('PASS cookie-free XHR account/participation transport, blocked sessionStorage memory fallback, JSON/HTML/network errors, explicit logout cleanup and isolated student/administrator transports');
} finally { Object.assign(globalThis, original); }
