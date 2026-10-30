export type Kind = 'task' | 'notice';
export type Detail = { summary: string; lead: string; collaborators: string; audience: string; goal: string; department: string; duration: string; body: string; action: string; sourceUrl: string; status: string; category: string; pinned: boolean };
export type Item = { id: string; kind: Kind; title: string; data: Detail; published: number; created_at: string; updated_at: string };
export type Progress = { id: string; item_id: string; day: string; summary: string; next_step: string; cooperation: string; published: number; created_at: string; title?: string };
export type Event = { id: string; item_id: string; title: string; type: string; starts_at: string; ends_at: string; location: string; action: string; audience: string; state: string; item_title?: string };
export type Asset = { id: string; item_id: string; filename: string; mime: string; size: number };
export type PublicData = { items: Item[]; progress: Progress[]; events: Event[]; assets: Asset[] };
export const emptyDetail: Detail = { summary: '', lead: '', collaborators: '', audience: '全班同学', goal: '', department: '', duration: '', body: '', action: '', sourceUrl: '', status: '筹备中', category: '班级事务', pinned: false };
export const statuses = ['筹备中', '进行中', '待确认', '已定稿', '已完成', '已暂停'];
export function cnDate(value: string | Date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)); }
export function today() { return cnDate(new Date()); }
export function dayLabel(value: string) { const parts = value.slice(0, 10).split('-'); return Number(parts[1]) + '月' + Number(parts[2]) + '日'; }
export function timeLabel(value: string) { if (!value) return '待定'; return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
export function eventLabel(e: Event) { if (e.state === 'cancelled') return '已取消'; if (e.type === 'deadline') return Date.parse(e.starts_at) < Date.now() ? '已截止' : '截止时间'; if (e.ends_at && Date.parse(e.ends_at) < Date.now()) return '已结束'; if (!e.ends_at && Date.parse(e.starts_at) < Date.now()) return '已开始'; return '活动安排'; }
