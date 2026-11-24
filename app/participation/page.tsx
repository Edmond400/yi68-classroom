import { getStudent } from '@/lib/accounts';
import { StudentParticipation } from '@/components/student-participation';
import { accountAccessErrors } from '@/lib/account-access';
export const dynamic='force-dynamic';
export const metadata={title:'我的参与',robots:{index:false,follow:false}};
export default async function Participation({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const [student,query]=await Promise.all([getStudent(),searchParams]);
 const error=typeof query.account_error==='string' && Object.hasOwn(accountAccessErrors,query.account_error)
  ? accountAccessErrors[query.account_error]
  : query.account_check==='1'&&!student?accountAccessErrors.cookies:'';
 return <><div className="page-heading"><div><p className="eyebrow">OUR SHARED MOMENTS</p><h1>我的参与</h1><p className="muted">每一份投入，都值得被记下。这里的参与记录仅你和管理员可见。</p></div></div><StudentParticipation initialStudent={student} initialError={error||''}/></>;
}
