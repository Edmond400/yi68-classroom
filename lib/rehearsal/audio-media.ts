'use client';
function waitForMedia(audio:HTMLAudioElement,ready:()=>boolean,events:string[],signal:AbortSignal,message:string){
 return new Promise<void>((resolve,reject)=>{
  const clean=()=>{clearTimeout(timer);for(const event of events)audio.removeEventListener(event,check);audio.removeEventListener('error',error);signal.removeEventListener('abort',abort)};
  const check=()=>{if(ready()){clean();resolve()}};
  const error=()=>{clean();reject(new Error('浏览器无法解码这条录音，请重新加载本段'))};
  const abort=()=>{clean();reject(new DOMException('已取消','AbortError'))};
  const timer=setTimeout(()=>{clean();reject(new Error(message))},12000);
  for(const event of events)audio.addEventListener(event,check);audio.addEventListener('error',error);signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();else if(audio.error)error();else check();
 });
}
export async function prepareAudio(audio:HTMLAudioElement,url:string,offsetSeconds:number,signal:AbortSignal){
 if(signal.aborted)throw new DOMException('已取消','AbortError');
 if(audio.getAttribute('src')!==url){audio.src=url;audio.load()}
 await waitForMedia(audio,()=>audio.readyState>=1,['loadedmetadata','durationchange'],signal,'音频已读取，但浏览器准备超时，请重新加载本段');
 if(Math.abs(audio.currentTime-offsetSeconds)>.025)audio.currentTime=offsetSeconds;
 // Some browsers defer decoding even a complete Blob until play() is called.
 // Waiting for canplay here would prevent the action that starts decoding.
}
export async function playAudio(audio:HTMLAudioElement,signal:AbortSignal){
 await new Promise<void>((resolve,reject)=>{
  const clean=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort)};
  const abort=()=>{clean();reject(new DOMException('已取消','AbortError'))};
  const timer=setTimeout(()=>{clean();reject(new Error('播放器没有开始播放，请重新加载本段'))},8000);
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)return abort();
  audio.play().then(()=>{clean();resolve()},e=>{clean();reject(e)});
 });
}
export function playbackError(error:unknown){
 if(error instanceof Error&&error.name==='NotAllowedError')return '浏览器阻止了本次播放，请再次点击播放。无需等待权限弹窗。';
 if(error instanceof Error&&error.name==='NotSupportedError')return '浏览器不支持这条录音的音频格式';
 return error instanceof Error?error.message:'录音播放失败，请重新加载本段';
}
