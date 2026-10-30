import { ShieldCheck } from 'lucide-react';
import { FeedbackForm } from '@/components/feedback-forms';
export const metadata={title:'意见反馈',robots:{index:false,follow:false}};
export default function Feedback(){return <div className="narrow"><div className="page-heading"><div><p className="eyebrow">WE ARE LISTENING</p><h1>意见反馈</h1></div></div><section className="panel form-panel"><span className="private-label"><ShieldCheck size={17}/>无需登录 · 内容仅管理员可见</span><h2>你的想法，我们认真对待</h2><p>署名和联系方式由你自愿填写。请勿在此填写他人的隐私信息。</p><FeedbackForm/></section></div>}
