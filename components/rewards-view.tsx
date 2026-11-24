'use client';
import { useEffect,useState } from 'react';
import { api } from '@/lib/client';
import { currentRewardPeriod,rewardRefreshDelay } from '@/lib/reward-timing';
import {prizeFor} from '@/lib/monthly-reward-policy';
import { bjTime,IncentiveRules } from './incentive-shared';
import { RewardResult } from './reward-playback';
export { RewardResult } from './reward-playback';
export function RewardsView(){
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[selected,setSelected]=useState(''),[clock,setClock]=useState(Date.now()),[offset,setOffset]=useState(0);
 useEffect(()=>{let live=true,inflight=false,last:any=null,serverOffset=0,poll:ReturnType<typeof setTimeout>|undefined;
  async function load(){if(inflight||!live)return;inflight=true;if(poll)clearTimeout(poll);setClock(Date.now());try{const result=await api('/api/rewards');if(live){last=result;serverOffset=Date.parse(result.server_time)-Date.now();setData(result);setOffset(serverOffset);setClock(Date.now());setError('')}}catch(e){if(live)setError((e as Error).message)}finally{inflight=false;if(live)poll=setTimeout(()=>{void load()},last?rewardRefreshDelay(last.periods,Date.now()+serverOffset):3000)}}
  void load();const timer=setInterval(()=>setClock(Date.now()),1000),visible=()=>{if(document.visibilityState==='visible')void load()};document.addEventListener('visibilitychange',visible);
  return()=>{live=false;if(poll)clearTimeout(poll);clearInterval(timer);document.removeEventListener('visibilitychange',visible)};
 },[]);
 if(!data)return <p className="callout" role="status">{error||'正在准备感谢页面…'}</p>;
 const now=clock+offset,ordered=[...data.periods].sort((a:any,b:any)=>Date.parse(a.ends_at)-Date.parse(b.ends_at)),period=currentRewardPeriod<any>(ordered,selected,now);
 if(!period)return <p className="callout">暂未配置感谢期次。</p>;
 const prize=prizeFor(period.kind,period.result);
 const remaining=Math.max(0,Date.parse(period.ends_at)-now),days=Math.floor(remaining/86400000),hours=Math.floor(remaining/3600000)%24,minutes=Math.floor(remaining/60000)%60,seconds=Math.floor(remaining/1000)%60;
 return <>{error&&<p className="callout error" role="alert">{error}</p>}<section className="panel reward-hero"><p className="eyebrow">{period.kind==='semester'?'SEMESTER KEEPSAKES':'MONTHLY THANKS'}</p><h2>{period.label}</h2><p className="muted">统计：{bjTime(period.starts_at)} — {bjTime(period.ends_at)}（北京时间）</p><p>{period.kind==='semester'?'前十名获得班级文创纪念品':'最多三位同学，每人'+(prize.id==='luckin-zero-coffee-voucher'?'一张':'')+prize.label}</p>
  {!period.result&&remaining>0?<><div className="reward-countdown" aria-label="距离公开结算">{days}<small>天</small>{String(hours).padStart(2,'0')}<small>时</small>{String(minutes).padStart(2,'0')}<small>分</small>{String(seconds).padStart(2,'0')}<small>秒</small></div><p className="small muted">北京时间13:00先播放三秒倒计时，再播放本期转盘动画。错过直播也可回放同一结果。</p></>:<>{period.result&&<p className="incentive-tag">已于 {bjTime(period.published_at)} 公开产生</p>}<RewardResult key={period.id} period={period}/></>}
 </section><div className="incentive-section-head"><h2>各期感谢与回看</h2><a className="text-link" href="/participation">查看我的参与记录 →</a></div><div className="reward-periods">{ordered.map((p:any)=><button className={'panel '+(p.id===period.id?'chosen':'')} key={p.id} onClick={()=>setSelected(p.id)}><strong>{p.label}</strong><span>{bjTime(p.ends_at)}</span><small>{p.result?'查看结果与回放':'等待公开结算'}</small></button>)}</div><IncentiveRules/></>;
}
