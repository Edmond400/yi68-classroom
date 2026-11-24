'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {buildTimeline,locateTimeline,slideAt,type TimelinePart} from '@/lib/rehearsal/timeline';
import {formatTime,type Project,type Recording} from '@/lib/rehearsal/model';
import {readAudioBlob,prefetchAudio,forgetAudio} from '@/lib/rehearsal/audio-cache';
import {prepareAudio,playAudio,playbackError} from '@/lib/rehearsal/audio-media';
import {setPlaybackBusy} from '@/lib/rehearsal/media-priority';
import {SlideImage} from './shared';
type PlaybackStatus='idle'|'loading'|'playing'|'buffering'|'paused'|'gap'|'error';
export function GroupPlayback({project,recordings,admin=false,single}:{project:Project;recordings:Recording[];admin?:boolean;single?:Recording}){
 const timeline=useMemo(()=>single?{parts:[{kind:'audio',startMs:0,endMs:single.durationMs,turnId:single.turnId,memberId:single.memberId,recording:single,label:project.members.find(m=>m.id===single.memberId)?.name||'组员'}] as TimelinePart[],missing:[],totalMs:single.durationMs,complete:true}:buildTimeline(project,recordings),[project,recordings,single]);
 const audio=useRef<HTMLAudioElement>(null),position=useRef(0),active=useRef(-1),running=useRef(false),lastTick=useRef(0),generation=useRef(0),request=useRef<AbortController|null>(null),localUrls=useRef(new Map<string,string>()),owner=useRef(Symbol('playback')),statusRef=useRef<PlaybackStatus>('idle'),stallTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const [pos,setPos]=useState(0),[playing,setPlaying]=useState(false),[status,setStatus]=useState<PlaybackStatus>('idle'),[error,setError]=useState('');
 const idx=locateTimeline(timeline.parts,Math.min(pos,Math.max(0,timeline.totalMs-1))),part=timeline.parts[idx];
 const slides=part?.recording?.slides||project.slides,page=part?.recording?slideAt(part.recording.events,pos-part.startMs):0;
 function state(value:PlaybackStatus){statusRef.current=value;setStatus(value)}
 function clearStall(){clearTimeout(stallTimer.current);stallTimer.current=undefined}
 function stop(){generation.current++;request.current?.abort();request.current=null;running.current=false;setPlaying(false);clearStall();audio.current?.pause();state(position.current?'paused':'idle');setPlaybackBusy(owner.current,false)}
 function fail(message:string){stop();state('error');setError(message)}
 function prefetchNext(index:number){prefetchAudio(timeline.parts.slice(index+1).filter(p=>p.recording).slice(0,1).map(p=>p.recording!),admin)}
 async function seek(ms:number,resume=running.current){
  const a=audio.current;if(!a)return;
  const token=++generation.current;request.current?.abort();const controller=new AbortController();request.current=controller;clearStall();
  ms=Math.max(0,Math.min(ms,timeline.totalMs));position.current=ms;setPos(ms);lastTick.current=performance.now();
  if(ms>=timeline.totalMs){stop();active.current=-1;return}
  const index=locateTimeline(timeline.parts,ms),p=timeline.parts[index];active.current=index;state(p?.kind==='gap'?'gap':'loading');a.pause();
  running.current=resume;setPlaying(resume);setPlaybackBusy(owner.current,resume);setError('');
  if(!p||p.kind==='gap'){prefetchNext(index);if(!resume)state('paused');return}
  try{
   const r=p.recording!,key=r.id+':'+r.hash;let url=localUrls.current.get(key);
   if(!url){const blob=await readAudioBlob(r,admin,controller.signal);if(token!==generation.current)return;url=URL.createObjectURL(blob);localUrls.current.set(key,url);while(localUrls.current.size>4){const old=localUrls.current.keys().next().value!;if(old===key)break;URL.revokeObjectURL(localUrls.current.get(old)!);localUrls.current.delete(old)}}
   await prepareAudio(a,url,Math.max(0,(ms-p.startMs)/1000),controller.signal);if(token!==generation.current)return;
   prefetchNext(index);
   if(resume){await playAudio(a,controller.signal);if(token===generation.current)state('playing')}else state('paused');
  }catch(e){if(token===generation.current&&!(e instanceof Error&&e.name==='AbortError'))fail(playbackError(e))}
 }
 function waiting(){if(!running.current||!['playing','buffering'].includes(statusRef.current))return;state('buffering');if(!stallTimer.current)stallTimer.current=setTimeout(()=>fail('音频缓冲超时，请重新加载本段'),15000)}
 function started(){if(running.current&&statusRef.current!=='loading'){clearStall();state('playing')}}
 function retry(){const p=timeline.parts[active.current];if(p?.recording){forgetAudio(p.recording,admin);const key=p.recording.id+':'+p.recording.hash,url=localUrls.current.get(key);if(url){URL.revokeObjectURL(url);localUrls.current.delete(key)}}void seek(position.current,true)}
 useEffect(()=>{
  prefetchAudio(timeline.parts.filter(p=>p.recording).slice(0,2).map(p=>p.recording!),admin);
  let frame=0;const tick=(now:number)=>{
   if(running.current){const p=timeline.parts[active.current],a=audio.current;
    if(p?.kind==='gap')position.current=Math.min(p.endMs,position.current+Math.max(0,now-lastTick.current));
    else if(p&&a&&!a.paused&&!a.seeking&&statusRef.current==='playing')position.current=Math.min(p.endMs,p.startMs+a.currentTime*1000);
    if(p&&position.current>=p.endMs)void seek(p.endMs,true);else setPos(position.current);
   }lastTick.current=now;frame=requestAnimationFrame(tick);
  };frame=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame);generation.current++;request.current?.abort();clearStall();audio.current?.pause();running.current=false;setPlaybackBusy(owner.current,false);for(const url of localUrls.current.values())URL.revokeObjectURL(url);localUrls.current.clear()};
 },[timeline,admin]);
 useEffect(()=>{position.current=0;active.current=-1;setPos(0);setPlaying(false);setStatus('idle');statusRef.current='idle';setError('')},[timeline]);
 const message=status==='loading'?'正在读取并准备'+(part?.label||'本段')+'的录音…':status==='buffering'?'正在缓冲'+(part?.label||'本段')+'的录音，计时等待声音恢复…':status==='gap'&&playing?(part?.label||'交接')+'，'+Math.max(0,Math.ceil(((part?.endMs||0)-pos)/1000))+'秒后继续':'';
 return <section className="panel rh-pad"><h2>{single?'本次录音同步回放':'全组模拟回放'}</h2>{!timeline.complete&&!single&&<p className="callout">本次为不完整回放。缺少：{timeline.missing.map(m=>(project.members.find(x=>x.id===m.memberId)?.name||'组员')+(m.outdated?'（版本过期）':'（未录制）')).join('、')}。总时长只统计已有录音与实际转场。</p>}<div className="rh-play-grid"><SlideImage id={slides[page]?.id} admin={admin} nearbyIds={[slides[page+1]?.id,slides[page-1]?.id].filter((x):x is string=>!!x)}/><div><p className="eyebrow">{part?.label||'等待播放'}</p><h3>{part?.recording?'PPT 第'+(page+1)+'页 / '+slides.length+'页':'公共余量 / 成员交接'}</h3><p>本段 {formatTime(Math.max(0,pos-(part?.startMs||0))/1000)} · 全组 {formatTime(pos/1000)} / {formatTime(timeline.totalMs/1000)}</p><p>距规定时长 {formatTime(project.config.hardLimitSeconds)} {pos>project.config.hardLimitSeconds*1000?'已超时 '+formatTime(pos/1000-project.config.hardLimitSeconds):'剩余 '+formatTime(project.config.hardLimitSeconds-pos/1000)}</p>{message&&<p role="status" aria-live="polite">{message}</p>}<div className="rh-actions"><button className="btn" disabled={!timeline.parts.some(p=>p.kind==='audio')} onClick={()=>playing?stop():void seek(position.current>=timeline.totalMs?0:position.current,true)}>{playing?(status==='loading'?'取消加载':'暂停'):'播放'+(single?'本次':'整场')}</button><button className="btn secondary" onClick={()=>void seek(0,false)}>回到开头</button></div><label className="rh-slider">总进度<input aria-label="回放总进度" type="range" min={0} max={timeline.totalMs||1} step={100} value={Math.min(pos,timeline.totalMs)} onChange={e=>void seek(Number(e.target.value))}/></label>{error&&<div className="callout error" role="alert">{error}<button onClick={retry}>重新加载本段</button></div>}</div></div><div className="rh-actions">{timeline.parts.filter(x=>x.kind==='audio').map((p,i)=><button key={p.turnId} onClick={()=>void seek(p.startMs,true)}>{i+1} · {p.label} {formatTime(p.startMs/1000)}</button>)}</div><audio ref={audio} preload="auto" onWaiting={waiting} onStalled={waiting} onPlaying={started} onCanPlay={()=>{if(statusRef.current==='buffering'&&running.current&&audio.current&&!audio.current.paused)started()}} onEnded={()=>{const p=timeline.parts[active.current];if(p&&running.current&&statusRef.current==='playing')void seek(p.endMs,true)}} onError={()=>{if(running.current&&['playing','buffering'].includes(statusRef.current))fail('浏览器无法继续解码这条录音，请重新加载本段')}}/></section>;
}
