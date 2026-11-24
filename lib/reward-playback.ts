import { animateWheel,type FrameRequest,type SpinStage } from './wheel-motion';
export const DRAW_SPIN_MS=6800;
export const DRAW_PAUSE_MS=1800;
export type WheelMember={display_name:string;selected:boolean;draw_order:number|null};
export type RewardPresentation={wheel:WheelMember[];draws:{index:number;name:string}[];rankedReveal:boolean};
export type PlaybackState={phase:'countdown'|'waiting'|'spinning'|'revealing'|'complete';countdown:number|null;round:number;revealed:number;rotation:number;run:number;motion:SpinStage|'stopped'};
export function rewardPresentation(result:any):RewardPresentation|null{
 if(!result)return null;
 const rankedReveal=!result.wheel?.length;
 const wheel:WheelMember[]=rankedReveal?result.winners.map((w:any,i:number)=>({display_name:w.display_name||w.nickname||w.name,selected:true,draw_order:i+1})):result.wheel;
 const draws=wheel.map((w,i)=>({...w,index:i})).filter(w=>w.selected).sort((a,b)=>(a.draw_order??0)-(b.draw_order??0)).map(w=>({index:w.index,name:w.display_name}));
 return {wheel,draws,rankedReveal};
}
export function createRewardPlayback({onChange,onRotate=()=>{},schedule=(callback,ms)=>setTimeout(callback,ms),cancel=handle=>clearTimeout(handle),spinMs=DRAW_SPIN_MS,turns=7,requestFrame,cancelFrame,now}:{onChange:(state:PlaybackState)=>void;onRotate?:(angle:number)=>void;schedule?:(callback:()=>void,ms:number)=>any;cancel?:(handle:any)=>void;spinMs?:number;turns?:number;requestFrame?:FrameRequest;cancelFrame?:(handle:any)=>void;now?:()=>number}){
 let state:PlaybackState={phase:'countdown',countdown:3,round:0,revealed:0,rotation:0,run:0,motion:'stopped'},presentation:RewardPresentation|null=null,disposed=false,generation=0,stopMotion:(()=>void)|null=null;
 const timers=new Set<any>();
 function clear(){generation++;stopMotion?.();stopMotion=null;for(const handle of timers)cancel(handle);timers.clear()}
 function emit(next:Partial<PlaybackState>){if(disposed)return;state={...state,...next};onChange({...state})}
 function later(callback:()=>void,ms:number){const current=generation;const handle=schedule(()=>{timers.delete(handle);if(!disposed&&current===generation)callback()},ms);timers.add(handle)}
 function spin(index:number){
  if(!presentation)return;
  const target=presentation.draws[index];
  if(!target){emit({phase:'complete',countdown:null});return}
  const angle=Math.ceil(state.rotation/360)*360+turns*360+360-(target.index+.5)*360/presentation.wheel.length;
  const current=generation;emit({phase:'spinning',round:index+1,countdown:null,motion:'accelerating'});
  stopMotion=animateWheel({from:state.rotation,to:angle,duration:spinMs,requestFrame,cancelFrame,now,
   onFrame:rotation=>{if(disposed||current!==generation)return;state.rotation=rotation;onRotate(rotation)},
   onStage:motion=>{if(!disposed&&current===generation&&state.motion!==motion)emit({motion})},
   onFinish:()=>{if(disposed||current!==generation)return;stopMotion=null;emit({phase:'revealing',revealed:index+1,motion:'stopped'});later(()=>{if(index+1<presentation!.draws.length)spin(index+1);else emit({phase:'complete'})},DRAW_PAUSE_MS)},
  });
 }
 function begin(){if(!presentation){emit({phase:'waiting',countdown:null});return}spin(0)}
 return {
  start(value:RewardPresentation|null){if(disposed)return;clear();presentation=value;emit({phase:'countdown',countdown:3,round:0,revealed:0,run:state.run+1,motion:'stopped'});later(()=>{emit({countdown:2});later(()=>{emit({countdown:1});later(begin,1000)},1000)},1000)},
  update(value:RewardPresentation|null){if(disposed)return;presentation=value;if(state.phase==='waiting'&&value)begin()},
  dispose(){clear();disposed=true},
 };
}
