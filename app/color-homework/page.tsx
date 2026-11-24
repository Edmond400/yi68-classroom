import { ColorHomeworkView } from '@/components/color-homework';
export const dynamic = 'force-dynamic';
export const metadata = { title: '色彩作业上交进度', robots: { index: false, follow: false } };
export default async function HomeworkPage() {
 return <><div className="page-heading"><div><p className="eyebrow">CLASS 68 / COLOR STUDIES</p><h1>色彩作业上交进度</h1><p className="muted">无需登录，即可查看全班进度。这里记录已移交给老师的作业，搜索姓名可找到自己的记录。</p></div></div><ColorHomeworkView/></>;
}
