import { redirect } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { administratorConfigured,getAdministrator } from '@/lib/administrator';
import { AdministratorAccess } from '@/components/administrator-forms';
export const dynamic='force-dynamic';
export const metadata={title:'管理员登录',robots:{index:false,follow:false}};
export default async function AdminLogin(){if(await getAdministrator())redirect('/admin/surveys/birthday');const configured=await administratorConfigured();return <div className="narrow"><div className="page-heading"><div><p className="eyebrow">CLASS ADMINISTRATION</p><h1>{configured?'管理员登录':'设置管理员账号'}</h1></div><LockKeyhole size={26}/></div><section className="panel form-panel"><h2>{configured?'班级信息，妥善管理':'仅班长可初始化'}</h2><p>问卷填写无需登录。此入口仅供管理员查看结果和维护班务。</p><AdministratorAccess configured={configured}/></section></div>}
