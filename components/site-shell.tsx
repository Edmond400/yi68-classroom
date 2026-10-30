'use client';
import { usePathname } from 'next/navigation';
import { House, BookOpen, CalendarDays, Megaphone, MessageSquare, LockKeyhole, ArrowUpRight, Cake, HeartHandshake, Gift } from 'lucide-react';
const links = [['/', '首页', House], ['/survey/birthday', '生日登记', Cake], ['/participation', '我的参与', HeartHandshake], ['/rewards', '月度感谢', Gift], ['/feedback', '意见反馈', MessageSquare], ['/journal', '班务日志', BookOpen], ['/schedule', '日程与 DDL', CalendarDays], ['/notices', '重要事项', Megaphone]] as const;
export function SiteShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return <><a className="skip-link" href="#main">跳转到内容</a><header className="site-header"><div className="header-inner"><a href="/" className="brand" aria-label="艺68班级服务站首页"><img className="brand-emblem" src="/brand/class-emblem.png" width="60" height="60" alt="艺68班徽"/><span className="brand-copy"><strong>艺68<span>班级服务站</span></strong><small>清华大学美术学院 · 2026级</small></span></a><a className="admin-link" href="/admin"><LockKeyhole size={15}/>班务管理<ArrowUpRight size={14}/></a></div><nav className="main-nav" aria-label="主导航">{links.map(([href,label,Icon])=><a key={href} href={href} aria-current={path === href ? 'page' : undefined} className={path === href ? 'active' : ''}><Icon size={17}/><span>{label}</span></a>)}</nav></header><main id="main" className="page-width">{children}</main><footer className="site-footer"><span>艺68 · 班级服务站</span><span>六八六八，艺路生花</span><span>时间均为北京时间</span></footer></>;
}
