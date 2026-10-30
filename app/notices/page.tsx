import { getPublicData } from '@/lib/data';
import { Blank, NoticeCard, Unavailable } from '@/components/public-ui';
export const dynamic='force-dynamic';
export const metadata={title:'重要事项'};
export default async function Notices(){let data;try{data=await getPublicData()}catch{return <Unavailable/>}const notices=data.items.filter(i=>i.kind==='notice').sort((a,b)=>Number(b.data.pinned)-Number(a.data.pinned));return <><div className="page-heading"><div><p className="eyebrow">NOTICES & OPPORTUNITIES</p><h1>重要事项</h1></div><span className="small muted">与同学有关的通知与机会</span></div><div className="notice-list">{notices.length?notices.map(i=><NoticeCard key={i.id} item={i} events={data.events}/>):<section className="panel no-results"><Blank title="暂无已发布的重要事项" description="因材施教计划、校园活动等通知，将在班长整理并发布后显示。"/></section>}</div></>}
