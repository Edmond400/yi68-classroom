import { redirect } from 'next/navigation';
import { getAdministrator } from '@/lib/administrator';
import { AdministratorBar } from '@/components/administrator-forms';
import { BirthdayResults } from '@/components/birthday-results';
export const dynamic='force-dynamic';
export const metadata={title:'生日问卷结果',robots:{index:false,follow:false}};
export default async function ResultsPage(){if(!await getAdministrator())redirect('/admin/login');return <><div className="page-heading"><div><p className="eyebrow">CLASS 68 · PRIVATE RESULTS</p><h1>生日问卷结果</h1></div><a className="text-link" href="/survey/birthday">查看填写页面</a></div><AdministratorBar/><BirthdayResults/></>}
