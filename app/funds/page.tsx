import {FundsView} from '@/components/funds';
export const metadata={title:'班费公开'};
export default function Page(){return <><div className="page-heading"><div><p className="eyebrow">OUR CLASS FUNDS</p><h1>班费公开</h1><p>每一笔收支，都清楚可查。</p></div></div><FundsView/></>}
