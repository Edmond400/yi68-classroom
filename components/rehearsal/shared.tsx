'use client';
import {useEffect,useState} from 'react';
import {rehearsalHeaders} from '@/lib/rehearsal/session';
import {administratorHeaders} from '@/lib/administrator-session';
import {readAudioBlob} from '@/lib/rehearsal/audio-cache';
import {buildTimeline} from '@/lib/rehearsal/timeline';
import {readSlideBlob,prefetchSlides} from '@/lib/rehearsal/slide-cache';
import {slideUrl,formatTime,compatible,audioUrl,type Project,type Recording,type Estimate} from '@/lib/rehearsal/model';
export async function binaryRequest(path:string,bytes:Blob|ArrayBuffer|FormData,headers:Record<string,string>={},admin=false){
 const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{...rehearsalHeaders(),...(admin?administratorHeaders():{}),...headers},body:bytes});let data:any;try{data=await r.json()}catch{throw new Error('服务器响应未完成，请保留本次内容后重试。')}if(!r.ok)throw new Error(data.error||'上传失败');return data;
}
export function SlideImage({id,admin=false,alt='静态PPT',nearbyIds=[],onReady}:{id?:string;admin?:boolean;alt?:string;nearbyIds?:string[];onReady?:()=>void}){
 const [image,setImage]=useState({id:'',src:'',error:''}),[retry,setRetry]=useState(0);const near=nearbyIds.join('|');
 useEffect(()=>{prefetchSlides(near.split('|').filter(Boolean),admin)},[near,admin]);
 useEffect(()=>{let live=true,url='';setImage({id:id||'',src:'',error:''});if(id)readSlideBlob(id,admin).then(blob=>{if(!live)return;url=URL.createObjectURL(blob);setImage({id,src:url,error:''})}).catch(e=>{if(live)setImage({id,src:'',error:(e as Error).message})});return()=>{live=false;if(url)URL.revokeObjectURL(url)}},[id,admin,retry]);
 const current=image.id===id?image:undefined;
 return <div className="rh-slide">{current?.src?<img key={id+':'+retry} data-slide-id={id} src={current.src} alt={alt} onLoad={onReady} onError={()=>setImage(v=>v.id===id?{...v,error:'页面图片解码失败'}:v)}/>:<p>{id?'正在加载PPT…':'此处显示静态PPT页'}</p>}{current?.error&&<p role="alert">{current.error} <button onClick={()=>setRetry(n=>n+1)}>重试此页</button></p>}</div>;
}
export function EstimatePanel({estimate:e,project:p,recordings=[]}:{estimate:Estimate;project:Project;recordings?:Recording[]}){
 const timeline=buildTimeline(p,recordings),measured=timeline.parts.filter(x=>x.recording),actual=measured.reduce((s,x)=>s+x.recording!.durationMs,0)/1000;
 return <section className="panel rh-pad"><h2>发言时间测算</h2><div className={'rh-metrics '+e.risk}>
 <div><small>① 规定时长</small><strong>{formatTime(p.config.hardLimitSeconds)}</strong><small>计划目标 {formatTime(p.config.planningSeconds)}</small></div>
 <div><small>② 全组预计</small><strong>{formatTime(e.predictedSeconds)}</strong><small>含交接与公共余量</small></div>
 <div><small>③ 各轮目标合计</small><strong>{formatTime(e.targetSeconds-e.globalSeconds)}</strong><small>各人分配见下表</small></div>
 <div><small>④ 当前版本录音实测</small><strong>{measured.length?formatTime(actual):'尚未录制'}</strong><small>{timeline.complete?'全部轮次录音已齐全':measured.length?'已录 '+measured.length+' / '+e.turns.length+'轮，尚未齐全':'逐轮提交后显示'}</small></div></div>
 <p role="status">{e.risk==='empty'?'尚无可朗读内容':e.risk==='over'?'按现稿预计超时：优先删除重复论述、低优先级论据或额外动作':e.risk==='warning'?'预计可在规定时长内完成，但未达到提前完成目标':'内容可容纳，保留现场缓冲'}{e.targetRisk!=='pass'&&'；人工/建议目标仍超过规划预算'}</p>
 <div className="rh-scroll"><table className="rh-table"><thead><tr><th>轮次 / 组员</th><th>本轮目标</th><th>实测练习</th></tr></thead><tbody>{e.turns.map((t,i)=>{const r=measured.find(x=>x.turnId===t.turnId)?.recording;return <tr key={t.turnId}><td>{i+1} · {p.members.find(m=>m.id===t.memberId)?.name}</td><td>{formatTime(t.targetSeconds)}{t.manual?'（手动）':''}</td><td>{r?formatTime(r.durationMs/1000)+(r.complete?'':'（待核对完整性）'):'未录制当前版本'}</td></tr>})}</tbody></table></div>
 <details><summary>展开测算详情与核对提示</summary><p>交接 {e.handoffs}次，交接与公共余量 {e.globalSeconds.toFixed(1)}秒；目标整场合计 {formatTime(e.targetSeconds)}。已有录音净时长 {formatTime(actual)}{timeline.complete?'，含规划转场的整场时长 '+formatTime(timeline.totalMs/1000):'（部分录音不代表整场时长）'}。预测是估算，实测不代表已核实逐字完整朗读。</p>{e.reductionNeeded>0&&<p>距计划目标需减少 {e.reductionNeeded.toFixed(1)}秒；自动建议最多缩减15%，仍需人工解决 {e.unallocatedReduction.toFixed(1)}秒。</p>}
 <div className="rh-scroll"><table className="rh-table"><thead><tr>{['轮次 / 组员','等效单位','朗读','停顿','换页','额外','初始 / 校准','自动 / 生效目标','校准'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{e.turns.map((t,i)=><tr key={t.turnId}><td>{i+1} · {p.members.find(m=>m.id===t.memberId)?.name}</td><td>{t.equivalentUnits}</td><td>{t.speechSeconds.toFixed(1)}s</td><td>{t.punctuationSeconds.toFixed(1)}s</td><td>{t.slideSeconds.toFixed(1)}s</td><td>{t.explicitExtraSeconds.toFixed(1)}s</td><td>{t.initialSeconds.toFixed(1)} / {t.calibratedSeconds.toFixed(1)}s</td><td>{formatTime(t.autoTargetSeconds)} / {formatTime(t.targetSeconds)} {t.manual?'手动':'自动'}</td><td>{t.calibrationSamples}次 · {t.calibrationRatio?.toFixed(2)||'待校准'}</td></tr>)}</tbody></table></div>{e.warnings.length>0&&<ul>{e.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>}{e.turns.map((t,i)=><div key={t.turnId}><h4>第{i+1}轮</h4>{t.warnings.length?<ul>{t.warnings.map((w,j)=><li key={j}>{w}</li>)}</ul>:<p>无额外核对提示。</p>}</div>)}</details></section>;
}
function AudioControl({recording,admin}:{recording:Recording;admin:boolean}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url]);
 async function load(){setLoading(true);setError('');try{setUrl(URL.createObjectURL(await readAudioBlob(recording,admin)))}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 return <div>{url?<audio controls preload="none" src={url} onError={()=>setError('录音无法播放，请刷新重试或联系管理员')}/>:<button onClick={()=>void load()} disabled={loading}>{loading?'正在加载…':'加载试听'}</button>}{error&&<p role="alert">{error}</p>}</div>;
}
export function RecordingList({project:p,recordings,admin=false,onReview}:{project:Project;recordings:Recording[];admin?:boolean;onReview?:(r:Recording,action:'lock'|'complete'|'delete')=>void}){
 return <section className="panel rh-pad"><h2>录音核对与管理</h2><p>每个发言轮次分别保留最近3次成功提交。锁定录音保留，失败提交不会淘汰旧记录。</p>{!recordings.length&&<p>还没有提交录音。</p>}{p.members.map(m=><div key={m.id} className="rh-records"><h3>{m.name}</h3>{recordings.filter(r=>r.memberId===m.id).map(r=><article key={r.id} className="rh-record"><div><strong>{formatTime(r.durationMs/1000)}</strong> · {new Date(r.submittedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} · {r.locked?'验收锁定':'未锁定'} · {r.complete?'完整有效':'待核对'}<p>{compatible(r,p)?'当前稿件/PPT版本':'版本不一致，需重新提交'} · 原始预测 {r.predictedSeconds.toFixed(1)}秒 · 偏差 {r.predictedSeconds?((r.durationMs/1000/r.predictedSeconds-1)*100).toFixed(1):'—'}%</p><small>稿件 {r.scriptVersion.slice(0,8)} / PPT {r.deckVersion.slice(0,8)} / 算法 {r.algorithmVersion}<br/>{r.metadata.durationSource}{r.metadata.mediaDurationMs!==null&&Math.abs(r.metadata.mediaDurationMs-r.metadata.clockDurationMs)>1000&&'；媒体与JS计时存在差异，请核对'}</small></div><AudioControl recording={r} admin={admin}/>{onReview&&<div className="rh-actions"><button onClick={()=>onReview?.(r,'lock')}>{r.locked?'解锁':'锁定验收'}</button><button onClick={()=>onReview?.(r,'complete')}>{r.complete?'撤销完整确认':'确认完整有效'}</button><button onClick={()=>onReview?.(r,'delete')}>删除误提交</button></div>}</article>)}</div>)}</section>;
}
