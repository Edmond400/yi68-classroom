'use client';
import {useEffect,useRef,useState} from 'react';
import {EffectiveClock} from '@/lib/rehearsal/timeline';
import {type Project,type Estimate,type Recording,type TurnProgress,type SlideEvent,turnsFor,formatTime,MAX_AUDIO_BYTES} from '@/lib/rehearsal/model';
import {binaryRequest,SlideImage} from './shared';
const mimeChoice=()=>['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(m=>MediaRecorder.isTypeSupported(m));
async function mediaDuration(blob:Blob):Promise<number|null>{
 const a=document.createElement('audio'),url=URL.createObjectURL(blob);a.preload='metadata';
 try{return await new Promise(resolve=>{const done=(value:number|null)=>{clearTimeout(timer);resolve(value)};const timer=setTimeout(()=>done(null),3000);a.onloadedmetadata=()=>done(Number.isFinite(a.duration)&&a.duration>0?Math.round(a.duration*1000):null);a.onerror=()=>done(null);a.src=url})}finally{a.removeAttribute('src');a.load();URL.revokeObjectURL(url)}
}
export function Practice({project:p,memberId,estimate,recordings=[],progress=[],onSubmitted}:{project:Project;memberId:string;estimate:Estimate;recordings?:Recording[];progress?:TurnProgress[];onSubmitted:()=>Promise<void>}){
 const turns=turnsFor(p).filter(t=>t.memberId===memberId),[turnId,setTurnId]=useState(turns[0]?.id||''),[page,setPage]=useState(0),[font,setFont]=useState(20),[state,setState]=useState<'idle'|'recording'|'paused'|'finished'>('idle'),[elapsed,setElapsed]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[blob,setBlob]=useState<Blob|null>(null),[localUrl,setLocalUrl]=useState(''),[listen,setListen]=useState(false),[success,setSuccess]=useState('');
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),clock=useRef(new EffectiveClock()),events=useRef<SlideEvent[]>([]),chunks=useRef<Blob[]>([]),uploadId=useRef(''),duration=useRef(0),byteCount=useRef(0),recordingVersion=useRef({script:p.scriptVersion,deck:p.deckVersion,algorithm:p.algorithmVersion}),alive=useRef(true);
 const [readyPage,setReadyPage]=useState<number|null>(null);const requested=useRef(0),pageSource=useRef<'manual'|'preset'>('preset');
 const turn=turns.find(t=>t.id===turnId)||turns[0],blocks=turn?p.blocks.filter(b=>turn.blockIds.includes(b.id)):[];
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;const r=recorder.current;if(r&&r.state!=='inactive')r.stop();stream.current?.getTracks().forEach(t=>t.stop())}},[]);
 useEffect(()=>{if(!blob){setLocalUrl('');return}const url=URL.createObjectURL(blob);setLocalUrl(url);return()=>URL.revokeObjectURL(url)},[blob]);
 useEffect(()=>{if(state!=='recording')return;const timer=setInterval(()=>{const ms=clock.current.value(performance.now());setElapsed(ms);if(ms>=10799000){setError('已达到单次录音安全上限3小时，录音已结束，请保存或提交。');finish()}},100);return()=>clearInterval(timer)},[state]);
 useEffect(()=>{if(state==='idle'){const first=blocks[0]?.slideIndex??0,previous=requested.current;requested.current=first;setPage(first);setReadyPage(old=>first===previous?old:null)}},[turnId]);
 function changePage(next:number,source:'manual'|'preset'='manual'){
  next=Math.max(0,Math.min(p.slides.length-1,next));requested.current=next;pageSource.current=source;setPage(next);if(next!==page)setReadyPage(null);
 }
 function slideShown(index:number){
  if(index!==requested.current)return;setReadyPage(index);
  if(state!=='recording'&&state!=='paused')return;
  const last=events.current[events.current.length-1];if(last?.slide_index===index)return;
  const ms=Math.floor(clock.current.value(performance.now()));
  if(last&&ms<=last.t_ms){last.slide_index=index;if(events.current.length>1&&events.current.at(-2)?.slide_index===index)events.current.pop();return}
  events.current.push({t_ms:ms,slide_index:index,source:pageSource.current});
 }
 function reset(){setBlob(null);setState('idle');setElapsed(0);setListen(false);setError('');setSuccess('');uploadId.current='';clock.current.reset()}
 async function start(){
  if(!turn)return;setError('');setSuccess('');
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('当前浏览器不支持录音；仍可浏览讲稿和PPT。请使用支持MediaRecorder的HTTPS浏览器。');return}
  setBusy(true);
  try{const s=await navigator.mediaDevices.getUserMedia({audio:true});if(!alive.current){s.getTracks().forEach(t=>t.stop());return}stream.current=s;const mime=mimeChoice(),r=new MediaRecorder(s,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:48000});recorder.current=r;chunks.current=[];byteCount.current=0;events.current=[{t_ms:0,slide_index:page,source:'start'}];clock.current.reset();clock.current.resume(performance.now());recordingVersion.current={script:p.scriptVersion,deck:p.deckVersion,algorithm:p.algorithmVersion};uploadId.current=crypto.randomUUID();
   r.ondataavailable=e=>{if(e.data.size){chunks.current.push(e.data);byteCount.current+=e.data.size;if(byteCount.current>=MAX_AUDIO_BYTES-128*1024&&r.state!=='inactive'){setError('录音即将达到10MiB，已自动结束。请先保存或提交。');finish()}}};
   r.onstop=()=>{s.getTracks().forEach(t=>t.stop());if(alive.current){setBlob(new Blob(chunks.current,{type:r.mimeType||chunks.current[0]?.type||'audio/webm'}));setState('finished');setListen(false)}};
   r.onerror=()=>{setError('录音被浏览器中断，已尝试保留已录部分；确认完整后再提交。');if(r.state!=='inactive')finish()};r.start(1000);setState('recording');setBlob(null);
  }catch(e){stream.current?.getTracks().forEach(t=>t.stop());setError('无法启用麦克风：'+((e as Error).name==='NotAllowedError'?'权限被拒绝，请在浏览器设置中允许后重试。仍可浏览讲稿和PPT。':(e as Error).message))}finally{setBusy(false)}
 }
 function finish(){const r=recorder.current;if(!r||r.state==='inactive')return;clock.current.pause(performance.now());duration.current=Math.floor(clock.current.value(performance.now()));setElapsed(duration.current);r.stop()}
 function pause(){const r=recorder.current;if(!r)return;if(r.state==='recording'){r.pause();clock.current.pause(performance.now());setState('paused')}else if(r.state==='paused'){r.resume();clock.current.resume(performance.now());setState('recording')}}
 async function submit(){if(!blob||!turn)return;setBusy(true);setError('');try{
  if(blob.size>MAX_AUDIO_BYTES)throw new Error('录音超过10MiB，请下载保存后重新练习；本次不能上传。');
  const media=await mediaDuration(blob),d=media??duration.current,bytes=await blob.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  // Align event time to the actual media duration only when browser reports it.
  const factor=duration.current>0?d/duration.current:1;let previous=-1;
  const adjusted=events.current.map(e=>({...e,t_ms:Math.max(previous+1,Math.round(e.t_ms*factor))})).filter(e=>{if(e.t_ms>d||e.t_ms<=previous)return false;previous=e.t_ms;return true});
  const metadata={id:uploadId.current,memberId,turnId:turn.id,scriptVersion:recordingVersion.current.script,deckVersion:recordingVersion.current.deck,algorithmVersion:recordingVersion.current.algorithm,hash,durationMs:Math.round(d),clockDurationMs:duration.current,mediaDurationMs:media,events:adjusted};
  const form=new FormData();form.append('audio',blob,'recording');form.append('metadata',JSON.stringify(metadata));await binaryRequest('/api/rehearsal/recordings',form);
  setSuccess('服务端已完整保存本次录音。已更新本轮进度，可在全组模拟回放中试听。');setState('idle');setBlob(null);setElapsed(0);await onSubmitted();
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const active=state==='recording'||state==='paused';
 return <section className="panel rh-pad"><div className="rh-actions"><h2>个人模拟汇报 · {p.members.find(m=>m.id===memberId)?.name}</h2><label>发言轮次<select value={turn?.id||''} disabled={active||!!blob} onChange={e=>setTurnId(e.target.value)}>{turns.map((t,i)=><option key={t.id} value={t.id}>第{i+1}次发言（全组第{turnsFor(p).findIndex(x=>x.id===t.id)+1}轮）</option>)}</select></label></div>{!blocks.length?<p>暂未分配汇报内容。</p>:<><p>本轮目标 {formatTime(estimate.turns.find(t=>t.turnId===turn?.id)?.targetSeconds||0)} · 全组模型预计 {formatTime(estimate.predictedSeconds)} / {formatTime(p.config.hardLimitSeconds)}</p><p>按当前轮次录音。同一成员多轮发言时逐轮提交；段落建议页只用于定位，不自动识别朗读位置。</p><div className="rh-practice-grid"><div><SlideImage id={p.slides[page]?.id} nearbyIds={[p.slides[page+1]?.id,p.slides[page-1]?.id].filter((x):x is string=>!!x)} onReady={()=>slideShown(page)}/><div className="rh-actions"><button disabled={page<=0} onClick={()=>changePage(page-1)}>上一页</button><span>PPT {page+1} / {p.slides.length}</span><button disabled={page>=p.slides.length-1} onClick={()=>changePage(page+1)}>下一页</button></div></div><div className="rh-script"><label>讲稿字号<input aria-label="讲稿字号" type="range" min={16} max={36} value={font} onChange={e=>setFont(+e.target.value)}/></label>{blocks.map(b=><article key={b.id} style={{fontSize:font}} className={b.slideIndex===page?'current':''}><button className="rh-anchor" onClick={()=>b.slideIndex!==null&&changePage(b.slideIndex,'preset')}>定位第{b.slideIndex===null?'?':b.slideIndex+1}页</button><p>{b.text}</p></article>)}</div></div><div className="rh-recorder"><strong aria-live="off">{formatTime(elapsed/1000)}</strong><span>{elapsed/1000>(estimate.turns.find(t=>t.turnId===turn?.id)?.targetSeconds||0)?'已超过本轮建议目标':'本轮建议剩余 '+formatTime((estimate.turns.find(t=>t.turnId===turn?.id)?.targetSeconds||0)-elapsed/1000)}</span><span>{state==='recording'?'录音中':state==='paused'?'已暂停，有效计时停止':'准备就绪'} · 单次录音安全上限3小时 / 10MiB</span><div className="rh-actions">{!active&&state!=='finished'&&<button className="btn" disabled={busy||p.status!=='published'||readyPage!==page} onClick={()=>void start()}>开始录音</button>}{active&&<><button className="btn secondary" onClick={pause}>{state==='paused'?'继续':'暂停'}</button><button className="btn" onClick={finish}>结束录音</button></>}</div></div><nav className="rh-turn-progress" aria-label="我的发言轮次"><h3>我的发言轮次</h3>{turns.map((t,i)=>{const done=progress.some(r=>r.memberId===memberId&&r.turnId===t.id&&r.scriptVersion===p.scriptVersion&&r.deckVersion===p.deckVersion),retained=recordings.some(r=>r.turnId===t.id&&r.scriptVersion===p.scriptVersion&&r.deckVersion===p.deckVersion),old=progress.some(r=>r.memberId===memberId&&r.turnId===t.id);return <button key={t.id} type="button" aria-current={turn?.id===t.id?'step':undefined} disabled={active||!!blob||busy} onClick={()=>{setTurnId(t.id);setError('');setSuccess('')}}><span className={'rh-status-dot '+(done?'done':'pending')} aria-hidden="true"/><strong>第{i+1}次发言 · 全组第{turnsFor(p).findIndex(x=>x.id===t.id)+1}轮</strong><span>{done?retained?'已提交':'已提交，录音已不再保留':old?'当前版本需重录':'未提交'}</span>{turn?.id===t.id&&<small>当前轮次</small>}</button>})}</nav></>}{success&&<p className="callout" role="status">{success}</p>}{error&&<p className="callout error" role="alert">{error}</p>}
 {blob&&<div className="rh-dialog-backdrop"><div role="dialog" aria-modal="true" aria-labelledby="rh-submit-title" className="panel rh-dialog"><h2 id="rh-submit-title">是否需要先回放本次录音？</h2><p>{formatTime(duration.current/1000)} · {(blob.size/1024/1024).toFixed(2)}MiB</p>{listen&&<audio controls autoPlay src={localUrl}/>}<div className="rh-actions"><button className="btn secondary" disabled={busy} onClick={()=>setListen(true)}>先试听</button><button className="btn" disabled={busy} onClick={()=>void submit()}>{busy?'正在校验并保存…':listen?'提交本次录音':'直接提交'}</button><button disabled={busy} onClick={reset}>取消 / 重录</button><a download={'rehearsal-'+uploadId.current+(blob.type.includes('mp4')?'.m4a':blob.type.includes('ogg')?'.ogg':'.webm')} href={localUrl}>下载本次录音备份</a></div>{error&&<p role="alert" className="callout error">{error}</p>}</div></div>}
 </section>;
}
