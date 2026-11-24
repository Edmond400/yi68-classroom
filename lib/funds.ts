import {z} from 'zod';
import {database} from './data';
import {HttpError} from './http';
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v},'日期无效');
const version=z.number().int().min(0).optional();
export function cents(value:string){if(!/^-?\d{1,8}(?:\.\d{1,2})?$/.test(value))throw new HttpError(400,'金额请填写最多两位小数的数字。');const negative=value.startsWith('-'),[a,b='']=value.replace('-','').split('.');return (Number(a)*100+Number(b.padEnd(2,'0')))*(negative?-1:1)}
const amount=z.string().trim().max(20).transform(cents);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('settings'),opening:amount,opening_day:day,expected_version:version}).strict(),
 z.object({action:z.literal('entry'),id:z.string().uuid(),day,direction:z.enum(['income','expense']),amount:amount.refine(n=>n>0,'金额须大于0'),title:z.string().trim().min(1).max(150),note:z.string().trim().max(2000),expected_version:version}).strict(),
 z.object({action:z.literal('void'),id:z.string().uuid(),expected_version:version}).strict()
]);
export async function readFunds(admin=false){const db=database(),settings=await db.prepare("SELECT * FROM fund_settings WHERE id='class'").first<any>(),entries=(await db.prepare("SELECT * FROM fund_entries "+(admin?'':"WHERE state='active' ")+"ORDER BY day DESC,created_at DESC,id").all<any>()).results;const totals=entries.filter(e=>e.state==='active').reduce((a,e)=>{a[e.direction==='income'?'income':'expense']+=e.amount_cents;return a},{income:0,expense:0});return {configured:!!settings,settings,balance_cents:settings?settings.opening_cents+totals.income-totals.expense:null,...totals,entries,updated_at:[settings?.updated_at,...entries.map(e=>e.updated_at)].filter(Boolean).sort().at(-1)??null,...(admin?{audit:(await db.prepare('SELECT * FROM fund_audit ORDER BY created_at DESC LIMIT 100').all()).results}:{})}}
export async function writeFunds(value:unknown,actor:string){const v=schema.parse(value),db=database(),now=new Date().toISOString(),settings=await db.prepare("SELECT * FROM fund_settings WHERE id='class'").first<any>();let old:any,after:any,ops:D1PreparedStatement[]=[];
 if(v.action==='settings'){
  old=settings;if((old?.version??undefined)!==v.expected_version)throw new HttpError(409,'余额设置已更新，请刷新后重试。');
  if(await db.prepare('SELECT id FROM fund_entries WHERE day<? LIMIT 1').bind(v.opening_day).first())throw new HttpError(400,'已有流水早于此日期，请保留原统计起点以免重复计算。');
  after={opening_cents:v.opening,opening_day:v.opening_day,version:(old?.version??-1)+1};
  ops.push(db.prepare("INSERT INTO fund_write_guards VALUES (?,CASE WHEN COALESCE((SELECT version FROM fund_settings WHERE id='class'),-1)=? THEN 1 ELSE 0 END)").bind(crypto.randomUUID(),old?.version??-1),db.prepare("INSERT INTO fund_settings VALUES ('class',?,?,?,?) ON CONFLICT(id) DO UPDATE SET opening_cents=excluded.opening_cents,opening_day=excluded.opening_day,version=excluded.version,updated_at=excluded.updated_at").bind(v.opening,v.opening_day,after.version,now));
 }else{
  if(!settings)throw new HttpError(409,'请先设置期初余额和统计起点。');old=await db.prepare('SELECT * FROM fund_entries WHERE id=?').bind(v.id).first<any>();
  if((old?.version??undefined)!==v.expected_version)throw new HttpError(409,'这笔账目已更新，请刷新后重试。');
  ops.push(db.prepare('INSERT INTO fund_write_guards VALUES (?,CASE WHEN COALESCE((SELECT version FROM fund_entries WHERE id=?),-1)=? AND (SELECT version FROM fund_settings WHERE id=\'class\')=? THEN 1 ELSE 0 END)').bind(crypto.randomUUID(),v.id,old?.version??-1,settings.version));
  if(v.action==='void'){if(!old)throw new HttpError(404,'账目不存在。');after={...old,state:'void',version:old.version+1};ops.push(db.prepare("UPDATE fund_entries SET state='void',version=version+1,updated_at=? WHERE id=?").bind(now,v.id));}
  else{if(v.day<settings.opening_day)throw new HttpError(400,'流水日期不能早于期初日期；期初余额应为该日期之前的余额。');after={...v,amount_cents:v.amount,version:(old?.version??-1)+1,state:'active'};ops.push(db.prepare("INSERT INTO fund_entries VALUES (?,?,?,?,?,?,'active',?,?,?) ON CONFLICT(id) DO UPDATE SET day=excluded.day,direction=excluded.direction,amount_cents=excluded.amount_cents,title=excluded.title,note=excluded.note,state='active',version=excluded.version,updated_at=excluded.updated_at").bind(v.id,v.day,v.direction,v.amount,v.title,v.note,after.version,old?.created_at??now,now));}
 }
 ops.push(db.prepare('INSERT INTO fund_audit VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,v.action,v.action==='settings'?'class':v.id,JSON.stringify(old??null),JSON.stringify(after),now));
 try{await db.batch(ops)}catch{throw new HttpError(409,'保存发生冲突，请刷新核对后重试。原账目已保留。')}
 return readFunds(true);
}
