import {turnsFor,recordingFor,compatible,type Project,type Recording,type SlideEvent} from './model';
export type TimelinePart={kind:'audio'|'gap';startMs:number;endMs:number;turnId:string|null;memberId:string|null;recording?:Recording;label:string};
export function buildTimeline(p:Project,recordings:Recording[]){
 const parts:TimelinePart[]=[],missing:{turnId:string;memberId:string;outdated:boolean}[]=[];let offset=0,previous:string|null=null;
 const gap=(s:number,label:string)=>{if(s>0){parts.push({kind:'gap',startMs:offset,endMs:offset+s*1000,turnId:null,memberId:null,label});offset+=s*1000}};
 gap(p.config.operationSeconds,'公共开场 / 收尾余量');
 for(const turn of turnsFor(p)){
  const r=recordingFor(turn,p,recordings);
  if(!r){missing.push({turnId:turn.id,memberId:turn.memberId,outdated:recordings.some(x=>x.turnId===turn.id&&!compatible(x,p))});continue}
  if(previous!==null&&previous!==turn.memberId)gap(p.config.handoffSeconds,'成员交接');
  parts.push({kind:'audio',startMs:offset,endMs:offset+r.durationMs,turnId:turn.id,memberId:turn.memberId,recording:r,label:p.members.find(m=>m.id===turn.memberId)?.name||'组员'});offset+=r.durationMs;previous=turn.memberId;
 }
 return {parts,missing,totalMs:offset,complete:missing.length===0&&parts.some(x=>x.kind==='audio')};
}
export function locateTimeline(parts:TimelinePart[],ms:number){return parts.findIndex((p,i)=>ms>=p.startMs&&(ms<p.endMs||(i===parts.length-1&&ms===p.endMs)))}
export function slideAt(events:SlideEvent[],ms:number){let slide=events[0]?.slide_index??0;for(const e of events){if(e.t_ms>ms)break;slide=e.slide_index}return slide}
export function validateEvents(events:unknown,durationMs:number,slideCount:number):SlideEvent[]{
 if(!Array.isArray(events)||events.length<1||events.length>2000)throw new Error('翻页事件缺失或过多');
 let previous=-1,lastSlide=-1;
 return events.map((v,i)=>{if(!v||!Number.isSafeInteger(v.t_ms)||v.t_ms<0||v.t_ms>durationMs||v.t_ms<=previous||!Number.isInteger(v.slide_index)||v.slide_index<0||v.slide_index>=slideCount||!['start','manual','preset'].includes(v.source)||(i===0&&(v.t_ms!==0||v.source!=='start'))||(i>0&&v.source==='start')||v.slide_index===lastSlide)throw new Error('翻页事件时间轴或页码无效');previous=v.t_ms;lastSlide=v.slide_index;return {t_ms:v.t_ms,slide_index:v.slide_index,source:v.source}});
}
export class EffectiveClock {
 private elapsed=0;private start:number|null=null;
 resume(now:number){if(this.start===null)this.start=now}
 pause(now:number){if(this.start!==null){this.elapsed+=Math.max(0,now-this.start);this.start=null}}
 value(now:number){return this.elapsed+(this.start===null?0:Math.max(0,now-this.start))}
 reset(){this.elapsed=0;this.start=null}
}
