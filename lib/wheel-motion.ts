export type SpinStage='accelerating'|'cruising'|'decelerating';
export type FrameRequest=(callback:(timestamp:number)=>void)=>any;
export const motionNow=()=>typeof performance!=='undefined'?performance.now():Date.now();
export const requestMotionFrame:FrameRequest=callback=>typeof requestAnimationFrame==='function'?requestAnimationFrame(callback):setTimeout(()=>callback(motionNow()),16);
export const cancelMotionFrame=(handle:any)=>{if(typeof cancelAnimationFrame==='function')cancelAnimationFrame(handle);else clearTimeout(handle)};
// Integral of a smooth velocity ramp: zero speed at both ends, with a constant-speed middle.
export function wheelProgress(time:number){
 const t=Math.max(0,Math.min(1,time)),acceleration=.22,cruise=.28,deceleration=.5,area=acceleration/2+cruise+deceleration/2;
 const integral=(u:number)=>u*u*u-u*u*u*u/2;
 if(t<acceleration)return acceleration*integral(t/acceleration)/area;
 if(t<acceleration+cruise)return (acceleration/2+t-acceleration)/area;
 const u=(t-acceleration-cruise)/deceleration;return (acceleration/2+cruise+deceleration*(u-integral(u)))/area;
}
export function animateWheel({from,to,duration,onFrame,onStage,onFinish,requestFrame=requestMotionFrame,cancelFrame=cancelMotionFrame,now=motionNow}:{from:number;to:number;duration:number;onFrame:(angle:number)=>void;onStage:(stage:SpinStage)=>void;onFinish:()=>void;requestFrame?:FrameRequest;cancelFrame?:(handle:any)=>void;now?:()=>number}){
 let stopped=false,handle:any=null,elapsed=0,last=now(),stage:SpinStage='accelerating';
 onFrame(from);onStage(stage);
 function frame(timestamp:number){
  if(stopped)return;
  const current=Number.isFinite(timestamp)?timestamp:now();
  // A background tab or stalled frame resumes visibly instead of teleporting to the winner.
  elapsed+=Math.max(0,Math.min(250,current-last));last=current;
  const progress=Math.min(1,elapsed/duration),next:SpinStage=progress<.22?'accelerating':progress<.5?'cruising':'decelerating';
  onFrame(progress===1?to:from+(to-from)*wheelProgress(progress));
  if(next!==stage){stage=next;onStage(stage)}
  if(progress===1){stopped=true;handle=null;onFinish()}else handle=requestFrame(frame);
 }
 handle=requestFrame(frame);
 return ()=>{stopped=true;if(handle!==null)cancelFrame(handle)};
}
