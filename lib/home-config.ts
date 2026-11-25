import { z } from 'zod';
import { database } from './data';
import { defaultHomeConfig, homeBlockIds, moduleIds, type HomeConfig } from './site-modules';
import { HttpError } from './http';
const key='site_home_config_v1';
export const homeSchema=z.object({version:z.number().int().min(0).max(2147483646),entries:z.array(z.object({id:z.enum(moduleIds as [string,...string[]]),visible:z.boolean(),style:z.enum(['feature','card']),title:z.string().trim().min(1).max(60),description:z.string().max(200),button:z.string().trim().min(1).max(40),expires_at:z.string().datetime().nullable()}).strict()).max(moduleIds.length),blocks:z.object(Object.fromEntries(homeBlockIds.map(id=>[id,z.boolean()])) as Record<typeof homeBlockIds[number],z.ZodBoolean>).strict()}).strict().superRefine((v,c)=>{const ids=defaultHomeConfig().entries.map(e=>e.id);if(v.entries.length!==ids.length||new Set(v.entries.map(e=>e.id)).size!==ids.length||v.entries.some(e=>!ids.includes(e.id as any)))c.addIssue({code:'custom',message:'入口清单已变化，请刷新后重试。'});});
export async function readHomeConfig():Promise<HomeConfig>{const row=await database().prepare('SELECT value FROM settings WHERE key=?').bind(key).first<{value:string}>();return row?homeSchema.parse(JSON.parse(row.value)) as HomeConfig:defaultHomeConfig();}
export async function publicHomeConfig(){try{return await readHomeConfig()}catch{console.error('home-config-read-failed');return defaultHomeConfig()}}
export async function saveHomeConfig(input:unknown){const parsed=homeSchema.safeParse(input);if(!parsed.success)throw new HttpError(400,'请检查入口标题、文案、截止时间和配置完整性。');const next=parsed.data as HomeConfig;const version=next.version;next.version++;
 const value=JSON.stringify(next),db=database();
 const result=version===0?await db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').bind(key,value).run():await db.prepare("UPDATE settings SET value=? WHERE key=? AND json_extract(value,'$.version')=?").bind(value,key,version).run();
 if(!result.meta.changes)throw new HttpError(409,'配置已被其他管理员修改，请重新载入并核对。你的更改尚未保存。');return next;
}
