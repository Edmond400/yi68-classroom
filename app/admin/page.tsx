import { redirect } from 'next/navigation';
import { getAdministrator } from '@/lib/administrator';
import { AdministratorBar } from '@/components/administrator-forms';
import { AdminConsole } from '@/components/admin-console';
export const dynamic='force-dynamic';
export const metadata={title:'班务管理',robots:{index:false,follow:false}};
export default async function Admin(){if(!await getAdministrator())redirect('/admin/login');return <><div className="page-heading"><div><p className="eyebrow">CLASS ADMINISTRATION</p><h1>班务管理</h1></div></div><AdministratorBar/><AdminConsole/></>}
