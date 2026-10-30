import { Cake,LockKeyhole } from 'lucide-react';
import { BirthdayForm } from '@/components/birthday-form';
export const metadata={title:'生日信息与集体生日意愿登记',robots:{index:false,follow:false}};
export default function BirthdaySurvey(){return <div className="birthday-page"><div className="birthday-intro"><div className="birthday-icon"><Cake size={30}/></div><p className="eyebrow">CLASS 68 · BIRTHDAY GATHERING</p><h1>艺68生日信息与<br className="mobile-break"/>集体生日意愿登记</h1><p>请填写你的生日信息及本学期集体生日活动参与意愿，方便班级统筹安排。所填信息仅用于班级生日活动安排，仅管理员可查看。</p><span className="survey-privacy"><LockKeyhole size={14}/>无需登录 · 仅管理员可查看</span></div><BirthdayForm/></div>}
