import { RewardsView } from '@/components/rewards-view';
export const dynamic='force-dynamic';
export const metadata={title:'月度感谢与学期纪念'};
export default function Rewards(){return <><div className="page-heading"><div><p className="eyebrow">A LITTLE THANK YOU</p><h1>把感谢，送给一起参与的你</h1><p className="muted">每月三份小心意，学期十份纪念。共同完成的事，都留在班级的记忆里。</p></div></div><RewardsView/></>}
