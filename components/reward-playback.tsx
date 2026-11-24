'use client';
import {prizeFor} from '@/lib/monthly-reward-policy';
import { useEffect,useMemo,useRef,useState } from 'react';
import { createRewardPlayback,rewardPresentation,type PlaybackState } from '@/lib/reward-playback';
import { nicknameCharacters,nicknameLength } from '@/lib/nickname-rules';
const initial:PlaybackState={phase:'countdown',countdown:3,round:0,revealed:0,rotation:0,run:0,motion:'stopped'};
export function RewardResult({period,simulation=false}:{period:any;simulation?:boolean}){
 const result=period.result,presentation=useMemo(()=>rewardPresentation(result),[result?.receipt]);
 const [state,setState]=useState(initial),driver=useRef<ReturnType<typeof createRewardPlayback>|null>(null),stage=useRef<HTMLDivElement|null>(null),wheelNode=useRef<HTMLDivElement|null>(null),centerNode=useRef<HTMLDivElement|null>(null);
 function showStage(){try{stage.current?.scrollIntoView({block:'start',behavior:'smooth'})}catch{stage.current?.scrollIntoView()}}
 useEffect(()=>{
  const playback=createRewardPlayback({onChange:setState,onRotate:angle=>{if(wheelNode.current)wheelNode.current.style.transform=`rotate(${angle}deg)`;if(centerNode.current)centerNode.current.style.transform=`rotate(${-angle}deg)`}});driver.current=playback;showStage();playback.start(presentation);
  return()=>{playback.dispose();driver.current=null};
 },[period.id]);
 useEffect(()=>{driver.current?.update(presentation)},[presentation]);
 const wheel=presentation?.wheel??[],draws=presentation?.draws??[],busy=state.phase!=='complete';
 const colors=['#efe4f6','#d9c1e7','#c49ad9','#a470bd','#e7d9be','#dcc6a5'];
 function shortName(name:string){const chars=nicknameCharacters(name);return chars.length>6?chars.slice(0,5).join('')+'…':name}
 const motionLabel={accelerating:'加速转动',cruising:'持续旋转',decelerating:'减速停靠',stopped:'已停稳'}[state.motion];
 const status=state.phase==='countdown'?`开奖倒计时 ${state.countdown}`:state.phase==='waiting'?'正在确认本期结果，请稍候…':state.phase==='spinning'?`第 ${state.round} / ${draws.length} 轮 · ${motionLabel}` :state.phase==='revealing'?`已停稳，${presentation?.rankedReveal?'揭晓':'抽中'}：${draws[state.revealed-1]?.name}`:'本次开奖动画已播放完毕';
 return <div className="reward-playback" ref={stage} data-phase={state.phase} data-motion={state.motion}>
  <div className="reward-wheel-section"><div className="reward-wheel-wrap">
   <span className="wheel-pointer" aria-hidden="true">▼</span>
   <div className="reward-wheel" ref={wheelNode} role="img" aria-label={'欢乐大转盘'+(wheel.length?'：'+wheel.map(w=>w.display_name).join('、'):'，等待本期名单')} style={{transition:'none',background:wheel.length?`conic-gradient(${wheel.map((_,i)=>`${colors[i%colors.length]} ${i*360/wheel.length}deg ${(i+1)*360/wheel.length}deg`).join(',')})`:'conic-gradient(#efe4f6,#d9c1e7,#a470bd,#efe4f6)'}}>
    <svg className="wheel-name-labels" viewBox="0 0 280 280" aria-hidden="true">{wheel.map((w,i)=><text key={i} x="251" y="144" textAnchor="end" transform={`rotate(${(i+.5)*360/wheel.length-90} 140 140)`} fontSize={wheel.length>16||nicknameLength(w.display_name)>5?10:12}><title>{w.display_name}</title>{shortName(w.display_name)}</text>)}</svg>
    <div className="wheel-center" ref={centerNode} style={{transition:'none'}}><img className="wheel-emblem" src="/brand/class-emblem.png" width="58" height="58" alt="艺六八班徽" draggable={false}/></div>
   </div>
   {state.phase==='countdown'&&<div className="draw-countdown" role="timer" aria-label="三秒开奖倒计时"><span key={state.run+'-'+state.countdown}>{state.countdown}</span><small>即将开奖</small></div>}
  </div><div className="reward-playback-info"><h3>{presentation?.rankedReveal?'欢乐大转盘 · 名单揭晓':'欢乐大转盘 · 公开抽取'}</h3>
   <p className="draw-status" role="status" aria-live="polite">{status}</p>
   {wheel.length>0&&<><p className="small muted">{presentation?.rankedReveal?'本期无需并列抽签，动画按已确定的获奖顺序依次揭晓，不改变名单。':'同次数候选组参加并列抽取，其他名额按有效参与次数直接确定。'}</p><ul className="wheel-names">{wheel.map((w,i)=><li key={i} className={w.selected&&(w.draw_order??Infinity)<=state.revealed?'selected-name':''}>{w.display_name}{w.selected&&(w.draw_order??Infinity)<=state.revealed&&<span className="sr-only">，已揭晓</span>}</li>)}</ul></>}
   <button className="btn secondary" onClick={()=>{showStage();driver.current?.start(presentation)}} disabled={busy}>{busy?'开奖动画播放中…':'回放开奖动画'}</button>
   <p className="small muted">{simulation?'回放保留本次模拟的同一结果；“重新模拟”才会按最新统计重新抽取。':'回放会再次播放三秒倒计时和转盘动画，始终重现本期存档结果，不会重新开奖。'}</p>
   {state.revealed>0&&<p className="small">已{presentation?.rankedReveal?'揭晓':'抽中'}：{draws.slice(0,state.revealed).map(w=>w.name).join('、')}</p>}
  </div></div>
  {state.phase==='complete'&&result?<><div className="reward-winners" aria-live="polite">{result.winners.length?result.winners.map((w:any,i:number)=><article key={i}><span>{simulation?'模拟入选':'谢谢你的参与'}</span><h3>{w.name}{w.nickname&&<small className="winner-nickname">（{w.nickname}）</small>}</h3><p>{prizeFor(period.kind,result).label}</p><p className="small">{simulation?'演示结果，不作为领奖依据':'请等候微信通知'}</p></article>):<p className="callout">本期没有符合奖励条件的参与记录，暂无获奖者。</p>}</div><p className="reward-receipt">{simulation?'模拟结果校验：':'结果存档校验：'}{result.receipt.slice(0,20)} · {result.rule_version}</p></>:<p className="small muted">{state.phase==='waiting'?'正在读取服务端已确定的本期名单。':'倒计时与转盘播放结束后，将显示本次完整获奖名单。'}</p>}
 </div>;
}
