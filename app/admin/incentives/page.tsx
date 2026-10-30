import { redirect } from 'next/navigation';
import { getAdministrator } from '@/lib/administrator';
import { AdministratorBar } from '@/components/administrator-forms';
import { IncentiveAdmin } from '@/components/incentive-admin';
export const dynamic='force-dynamic';
export const metadata={title:'活动参与管理',robots:{index:false,follow:false}};
export default async function Incentives(){if(!await getAdministrator())redirect('/admin/login');return <><div className="page-heading"><div><p className="eyebrow">PARTICIPATION ADMINISTRATION</p><h1>活动参与管理</h1><p className="muted">记录事实，核实参与，把感谢妥善送达。</p></div></div><AdministratorBar/><IncentiveAdmin/></>}
