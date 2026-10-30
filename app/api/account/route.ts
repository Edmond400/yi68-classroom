import { json } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(){return json({student:null,registration_enabled:false})}
export async function POST(){return json({error:'学生账号功能暂未启用。生日问卷无需登录即可填写。'},403)}
