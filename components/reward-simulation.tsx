'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { bjTime } from './incentive-shared';
import { RewardResult } from './reward-playback';
export function RewardSimulation({delegated=false}:{delegated?:boolean}){
 const [kind,setKind]=useState('month'),[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[round,setRound]=useState(0);
 async function simulate(){if(busy)return;setBusy(true);setError('');try{setData(await api(delegated?'/api/activity-management/simulate':'/api/admin/incentives/simulate',{kind}));setRound(n=>n+1)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <><section className="panel incentive-form"><h2>模拟大转盘</h2><p className="callout">管理员预演：依据当前已核实记录模拟，不保存为正式开奖结果。每次模拟可能产生不同结果，不影响真实奖励。</p><label>模拟范围<select value={kind} disabled={busy} onChange={e=>{setKind(e.target.value);setData(null)}}><option value="month">最近一期月度感谢</option><option value="semester">学期纪念奖</option></select></label><button className="btn" disabled={busy} onClick={()=>{void simulate()}}>{busy?'正在生成模拟…':data?'按最新统计重新模拟':'开始模拟'}</button>{error&&<p className="callout error" role="alert">{error}</p>}</section>
 {data&&<><section className="panel incentive-form"><h2>1. 截至目前的有效参与</h2><p className="small muted">{data.period.label} · 统计截至 {bjTime(data.as_of)}（北京时间）。仅采用已核实、实际计次的记录。</p><div className="survey-table-wrap"><table className="survey-table"><thead><tr><th>姓名 / 昵称</th><th>有效次数</th><th>参评状态</th></tr></thead><tbody>{data.stats.map((m:any,i:number)=><tr key={i}><td>{m.name}{m.nickname?'（'+m.nickname+'）':''}</td><td>{m.count}</td><td>{m.reason}</td></tr>)}</tbody></table></div></section>
 <section className="panel incentive-form"><h2>2. 按规则确定名额</h2><p>本期最多 {data.period.quota} 人。{data.direct_winners.length?'直接入选：'+data.direct_winners.map((m:any)=>m.display_name).join('、')+'。':'当前没有直接入选者。'}</p><p>{data.period.result.wheel.length?`${data.period.result.wheel.length}位同次数候选人争取剩余${data.draw_slots}个名额，以下转盘回放本次模拟抽取。`:'当前无需处理并列抽签，按有效参与次数确定模拟名单。'}</p></section>
 <section className="panel reward-hero"><p className="eyebrow">SIMULATION ONLY</p><h2>3. 模拟过程与结果</h2><RewardResult key={round} period={data.period} simulation/></section></>}
 </>;
}
