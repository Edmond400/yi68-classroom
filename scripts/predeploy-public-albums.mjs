// One-time backup gate for additive album migration 0017. Existing controlled build credentials stay in environment.
// Raw private backups are never printed, committed, or served through the website.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
function wrangler(args) {
  const r=spawnSync('pnpm',['exec','wrangler',...args],{encoding:'utf8',maxBuffer:8*1024*1024});
  if(r.status!==0) {
    const detail=(r.stderr+r.stdout).replace(/Bearer\s+\S+/gi,'Bearer [redacted]');
    throw new Error('Predeploy backup gate failed: '+args[0]+' '+args[1]+'\n'+detail.slice(-5000));
  }
  return r.stdout;
}
function query(sql) {
  const text=wrangler(['d1','execute','DB','--remote','--json','--command',sql]);
  return JSON.parse(text.slice(text.indexOf('[')))[0].results;
}
const schema=query("SELECT name FROM sqlite_master WHERE type='table' AND name='album_classes'");
if(schema.length){console.log('Public album migration already applied; backup gate skipped.');} else {
  const dir=mkdtempSync(join(tmpdir(),'yi68-storage-backup-'));
  let restored;
  try {
    const sqlPath=join(dir,'production.sql');
    wrangler(['d1','export','DB','--remote','--output',sqlPath,'--skip-confirmation']);
    chmodSync(sqlPath,0o600);
    const bytes=readFileSync(sqlPath);
    const sha256=createHash('sha256').update(bytes).digest('hex');
    restored=new DatabaseSync(join(dir,'restored.sqlite'));
    // D1 dumps may insert child tables before the referenced parent is created.
    // Only the NEW isolated restore database defers FK enforcement during import.
    restored.exec('PRAGMA foreign_keys=OFF');
    restored.exec(bytes.toString('utf8'));
    restored.exec('PRAGMA foreign_keys=ON');
    if(restored.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Backup restore foreign key check failed');
    if(restored.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup restore integrity check failed');
    const names=restored.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all().map(x=>x.name);
    if(!names.includes('assets')||!names.includes('items')||!names.includes('class_album_comments')||!names.includes('class_album_photos'))throw new Error('Full D1 export is missing tables');
    const counts=[];
    for(let offset=0;offset<names.length;offset+=10) {
      const group=names.slice(offset,offset+10);
      const sql='SELECT '+group.map(name=>{if(!/^[a-zA-Z0-9_]+$/.test(name))throw new Error('Unexpected table name');return `(SELECT COUNT(*) FROM "${name}") AS "${name}"`;}).join(',');
      const row=query(sql)[0];
      counts.push(...group.map(name=>({name,n:row[name]})));
    }
    for(const row of counts)if(restored.prepare(`SELECT COUNT(*) AS n FROM "${row.name}"`).get().n!==row.n)throw new Error('Backup row count changed: '+row.name);
    const prefix='ops-backups/public-albums-0022/'+new Date().toISOString().replace(/[:.]/g,'-');
    const object='yi68-character-survey-media/'+prefix+'/production.sql';
    wrangler(['r2','object','put',object,'--remote','--file',sqlPath]);
    const reread=join(dir,'reread.sql');
    wrangler(['r2','object','get',object,'--remote','--file',reread]);
    if(createHash('sha256').update(readFileSync(reread)).digest('hex')!==sha256)throw new Error('R2 backup roundtrip checksum mismatch');
    const report={format:'yi68-d1-restore-proof-v1',created_at:new Date().toISOString(),sql_key:prefix+'/production.sql',bytes:bytes.length,sha256,integrity_check:'ok',tables:counts,restored_tables:names.length};
    const reportPath=join(dir,'restore-proof.json');writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600});
    wrangler(['r2','object','put','yi68-character-survey-media/'+prefix+'/restore-proof.json','--remote','--file',reportPath]);
    const legacyQueries=[['class_albums','SELECT id,title,activity_date,semester,description,published,cover_photo_id,created_at,updated_at FROM class_albums ORDER BY id'],['class_album_photos','SELECT id,album_id,filename,mime,size,checksum,object_key,thumbnail_key,thumbnail_size,width,height,position,created_at,uploaded_by,uploaded_by_name FROM class_album_photos ORDER BY id'],['class_album_comments','SELECT id,photo_id,account_id,author_name,content,created_at FROM class_album_comments ORDER BY id']];
    const baseline={tables:legacyQueries.map(([name,queryText])=>({name,query:queryText,sha256:createHash('sha256').update(JSON.stringify(query(queryText))).digest('hex')}))};
    query("INSERT INTO settings(key,value) VALUES ('public_albums_0022_baseline','"+JSON.stringify(baseline).replace(/'/g,"''")+"') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    console.log(JSON.stringify({backup_key:report.sql_key,backup_bytes:report.bytes,sha256:report.sha256,restored_tables:report.restored_tables,integrity_check:'ok',counts_match:true}));
  } finally { restored?.close();rmSync(dir,{recursive:true,force:true}); }
}

