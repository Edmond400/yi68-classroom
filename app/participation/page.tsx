import { getStudent } from '@/lib/accounts';
import { AccountAccess,AccountControls } from '@/components/account-forms';
import { ParticipationView } from '@/components/participation-view';
export const dynamic='force-dynamic';
export const metadata={title:'我的参与',robots:{index:false,follow:false}};
export default async function Participation(){const student=await getStudent();return <><div className="page-heading"><div><p className="eyebrow">OUR SHARED MOMENTS</p><h1>我的参与</h1><p className="muted">每一份投入，都值得被记下。这里的参与记录仅你和管理员可见。</p></div></div>{student?<><AccountControls name={student.name}/><ParticipationView/></>:<section className="panel form-panel narrow"><h2>登录自己的班级账号</h2><p className="small muted">首次使用请向班长领取激活码。生日登记和公开开奖无需登录。</p><AccountAccess destination="/participation"/></section>}</>}
