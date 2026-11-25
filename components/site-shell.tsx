'use client';
import {useEffect,useState} from 'react';
import { usePathname } from 'next/navigation';
import { House, BookOpen, CalendarDays, Megaphone, MessageSquare, LockKeyhole, ArrowUpRight, Cake, HeartHandshake, Gift, Wallet } from 'lucide-react';
const links = [['/', '首页', House], ['/sketch-homework', '素描作业', BookOpen], ['/color-homework', '色彩作业', BookOpen], ['/albums', '班级相册', BookOpen], ['/survey/birthday', '生日登记', Cake], ['/participation', '我的参与', HeartHandshake], ['/rewards', '月度感谢', Gift], ['/rehearsal', '模拟汇报', BookOpen], ['/funds', '班费公开', Wallet], ['/feedback', '意见反馈', MessageSquare], ['/journal', '班务日志', BookOpen], ['/schedule', '日程与 DDL', CalendarDays], ['/notices', '重要事项', Megaphone]] as const;
export function SiteShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  useEffect(()=>{window.dispatchEvent(new Event('yi68-route'))},[path]);
  return <><a className="skip-link" href="#main">跳转到内容</a><header className="site-header"><div className="header-inner"><a href="/" className="brand" aria-label="艺68班级服务站首页"><img className="brand-emblem" src="/brand/class-emblem.png" width="60" height="60" alt="艺68班徽"/><span className="brand-copy"><strong>艺68<span>班级服务站</span></strong><small>清华大学美术学院 · 2026级</small></span></a><a className="admin-link" href="/admin"><LockKeyhole size={15}/>班务管理<ArrowUpRight size={14}/></a></div><nav className="main-nav" aria-label="主导航">{links.map(([href,label,Icon])=><a key={href} href={href} aria-current={path === href ? 'page' : undefined} className={path === href ? 'active' : ''}><Icon size={17}/><span>{label}</span></a>)}</nav></header><main id="main" className="page-width">{children}</main><footer className="site-footer"><span>艺68 · 班级服务站</span><span>六八六八，艺路生花</span><span>时间均为北京时间</span><StatisticsPrivacy/></footer></>;
}

function StatisticsPrivacy(){
 const [enabled,setEnabled]=useState(true);
 const current=()=>{try{return localStorage.getItem('yi68_stats_off')!=='1'&&navigator.doNotTrack!=='1'}catch{return false}};
 useEffect(()=>{const update=()=>setEnabled(current());update();window.addEventListener('yi68-stats-changed',update);return()=>window.removeEventListener('yi68-stats-changed',update)},[]);
 function change(){const off=!current();if(!window.confirm('本站使用最长30天的随机匿名浏览器标识估算访问量；不采集完整IP、设备指纹、姓名或个人浏览轨迹。关闭匿名访问统计不影响正常使用，业务结果与管理员审计仍会记录。\n\n'+(off?'是否开启匿名访问统计？':'是否关闭匿名访问统计？')))return;try{localStorage.setItem('yi68_stats_off',off?'0':'1');if(!off)localStorage.removeItem('yi68_anon_stats_v1');setEnabled(current());window.dispatchEvent(new Event('yi68-stats-changed'))}catch{}}
 return <button className="ops-privacy" type="button" onClick={change}>统计隐私 · {enabled?'关闭匿名统计':'匿名统计已关闭'}</button>;
}
