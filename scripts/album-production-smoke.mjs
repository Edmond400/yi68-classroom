// Run once on the Cloudflare build host with its existing D1/R2 permissions.
// The short-lived session is removed in finally; no user password is read.
import assert from 'node:assert/strict';
import { randomBytes,createHash,randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const origin='https://class.example.invalid',token=randomBytes(32).toString('hex'),digest=createHash('sha256').update(token).digest('hex');
function sql(command){const r=spawnSync('pnpm',['exec','wrangler','d1','execute','DB','--remote','--json','--command',command],{encoding:'utf8',maxBuffer:2*1024*1024});if(r.status!==0)throw new Error('Production album smoke D1 command failed');const parsed=JSON.parse(r.stdout.slice(r.stdout.indexOf('[')));return parsed[0].results}
async function request(path,{body,admin=false,expected=200,...options}={}){
 const headers={...(admin?{Authorization:'Bearer '+token}:{}),...(body?{Origin:origin}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})};
 const r=await fetch(origin+path,{...options,method:body?'POST':'GET',headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
 assert.equal(r.status,expected,`Unexpected status ${r.status} at ${path}`);return r;
}
const command=body=>request('/api/admin/albums',{body,admin:true}).then(r=>r.json());
if(sql("SELECT value FROM settings WHERE key='class_albums_v1_verified'").length){console.log('Album production smoke already passed; skipped.');process.exit(0)}
let album;
const proof={version:'class-albums-v1',time:new Date().toISOString(),checks:[]};
try{
 sql(`INSERT INTO administrator_sessions(token_hash,admin_id,credential_version,expires_at) SELECT '${digest}',id,credential_version,${Date.now()+600000} FROM administrator WHERE id='primary'`);
 await request('/api/admin/albums',{expected:401});
 await request('/api/admin/albums',{body:{action:'create'},expected:401});
 album=(await command({action:'create',info:{title:'相册功能验收（自动测试）',activity_date:'1970-01-01',description:'系统合成验收图片，测试后自动移除。'}})).id;
 const photos=[randomUUID(),randomUUID()],bytes=readFileSync('tests/fixtures/albums/smoke.jpg');
 for(const id of photos){const form=new FormData();form.set('id',id);form.set('file',new File([bytes],'album-smoke.jpg',{type:'image/jpeg'}));form.set('preview',new File([bytes],'preview.jpg',{type:'image/jpeg'}));form.set('width','960');form.set('height','640');await request(`/api/admin/albums/${album}/photos`,{body:form,admin:true})}
 await request(`/api/albums/${album}`,{expected:404});await request(`/api/albums/photos/${photos[0]}`,{expected:404});
 const rows=sql(`SELECT id,size,checksum,object_key,thumbnail_key FROM class_album_photos WHERE album_id='${album}'`);assert.equal(rows.length,2);
 assert(rows.every(r=>r.object_key.startsWith(`albums/${album}/`)&&r.thumbnail_key.startsWith(`albums/${album}/`)));
 const raw=await request(`/api/admin/albums/photos/${photos[0]}`,{admin:true});assert.equal(createHash('sha256').update(Buffer.from(await raw.arrayBuffer())).digest('hex'),rows.find(r=>r.id===photos[0]).checksum);
 proof.checks.push('admin-create-batch-upload','D1-index-and-R2-object-readback','anonymous-draft-and-admin-denied');
 await command({action:'cover',id:album,photo_id:photos[1]});await command({action:'reorder',id:album,photo_ids:[...photos].reverse()});
 await command({action:'publish',id:album,confirmed:true});
 assert((await (await request('/api/albums')).json()).albums.some(a=>a.id===album));
 const detail=await (await request(`/api/albums/${album}`)).json();assert.equal(detail.photos.length,2);assert.equal(detail.photos[0].id,photos[1]);assert.equal(detail.album.cover_photo_id,photos[1]);
 for(const suffix of ['?preview=1','?download=1']){const r=await request(`/api/albums/photos/${photos[0]}${suffix}`);assert.match(r.headers.get('content-type'),/image\/jpeg/);assert((await r.arrayBuffer()).byteLength>0);if(suffix.includes('download'))assert.match(r.headers.get('content-disposition'),/attachment/)}
 for(const ua of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148','Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile MicroMessenger/8.0']){const r=await fetch(origin+'/albums/'+album,{headers:{'User-Agent':ua},signal:AbortSignal.timeout(45000)});assert.equal(r.status,200);assert((await r.text()).includes('album-photo-grid'))}
 assert((await (await request('/')).text()).includes('班级相册'));await request('/api/health');await request('/survey/favorite-character');await request('/survey/birthday');await request('/funds');
 proof.checks.push('public-list-detail-preview-download','cover-and-order','mobile-and-wechat-user-agent-pages','home-entry-and-existing-pages');
 await command({action:'unpublish',id:album});await request(`/api/albums/photos/${photos[0]}`,{expected:404});await request(`/api/albums/${album}`,{expected:404});
 proof.checks.push('withdrawal-hides-photos-immediately');
}finally{
 try{if(album){await command({action:'delete_album',id:album});assert.equal(sql(`SELECT COUNT(*) AS n FROM class_album_photos WHERE album_id='${album}'`)[0].n,0);proof.checks.push('synthetic-album-cleanup')}}finally{sql(`DELETE FROM administrator_sessions WHERE token_hash='${digest}'`)}
}
sql("INSERT INTO settings(key,value) VALUES ('class_albums_v1_verified','passed') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
console.log('ALBUM_PRODUCTION_SMOKE '+JSON.stringify({...proof,result:'PASS'}));
