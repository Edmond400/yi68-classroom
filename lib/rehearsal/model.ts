export const ALGORITHM_VERSION = 'speech-time-planner-v1.0';
export const CHUNK_BYTES = 512 * 1024;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 180 * 1024 * 1024;
export type AlgoConfig = {
 version:string; baseUnitsPerMinute:number; commaSeconds:number; endmarkSeconds:number;
 colonSemiSeconds:number; paragraphEndSeconds:number; slideSwitchSeconds:number;
 handoffSeconds:number; operationSeconds:number; chartExtraSeconds:number; formulaExtraSeconds:number;
 planningSeconds:number; hardLimitSeconds:number; personalBufferRate:number; ratioClip:[number,number];
};
export const DEFAULT_CONFIG:AlgoConfig = {
 version:ALGORITHM_VERSION, baseUnitsPerMinute:210, commaSeconds:.15, endmarkSeconds:.35,
 colonSemiSeconds:.25, paragraphEndSeconds:.45, slideSwitchSeconds:1.5, handoffSeconds:6,
 operationSeconds:10, chartExtraSeconds:4, formulaExtraSeconds:3, planningSeconds:840,
 hardLimitSeconds:900, personalBufferRate:.05, ratioClip:[.7,1.5],
};
export type Member = {id:string;name:string;enabled:boolean};
export type Block = {
 id:string; paragraphId:string; sourceStart?:number;sourceEnd?:number;text:string; memberId:string|null; nonspoken:boolean;
 slideIndex:number|null; paragraphEnd:boolean; spokenText?:string; spellOut?:string[];
 manualSpeechSeconds?:number; longPause?:number; chartAction?:boolean; formulaAction?:boolean; extraSeconds?:number; actionId?:string;
};
export type Slide = {sourcePage?:string;id:string;mime:string;pageIndex:number;bytes:number};
export type TargetOverride = {seconds:number;reason:string};
export type Project = {
 id:string; title:string;theme:string;status:'draft'|'published'|'ended';publishedAt:string|null;
 revision:number;scriptVersion:string;deckVersion:string;algorithmVersion:string;
 members:Member[];blocks:Block[];slides:Slide[];sourceDeck?:{id:string;pages:string[];bytes:number};config:AlgoConfig;
 overrides:Record<string,TargetOverride>;updatedAt:string;
};
export type Turn = {id:string;memberId:string;blockIds:string[]};
export type SlideEvent = {t_ms:number;slide_index:number;source:'start'|'manual'|'preset'};
export type Recording = {
 id:string;memberId:string;turnId:string;scriptVersion:string;deckVersion:string;algorithmVersion:string;
 mime:string;bytes:number;durationMs:number;hash:string;submittedAt:string;locked:boolean;complete:boolean;
 predictedSeconds:number;events:SlideEvent[];slides?:Slide[];metadata:{clockDurationMs:number;mediaDurationMs:number|null;durationSource:string};
};
export type Breakdown = {
 turnId:string;memberId:string;equivalentUnits:number;speechSeconds:number;punctuationSeconds:number;
 slideSeconds:number;explicitExtraSeconds:number;initialSeconds:number;calibratedSeconds:number;
 calibrationRatio:number|null;calibrationSamples:number;targetSeconds:number;autoTargetSeconds:number;
 reductionSeconds:number;manual:boolean;warnings:string[];
};
export type Estimate = {algorithmVersion:string;turns:Breakdown[];handoffs:number;globalSeconds:number;
 initialSeconds:number;predictedSeconds:number;targetSeconds:number;budgetSeconds:number;
 risk:'empty'|'pass'|'warning'|'over';targetRisk:'pass'|'warning'|'over';warnings:string[];
 reductionNeeded:number;unallocatedReduction:number;};
export function turnsFor(project:Pick<Project,'blocks'>):Turn[]{
 const turns:Turn[]=[];
 for(const b of project.blocks){
  if(b.nonspoken||!b.text.trim()||!b.memberId)continue;
  const last=turns[turns.length-1];
  if(last?.memberId===b.memberId)last.blockIds.push(b.id);
  else turns.push({id:'turn-'+b.id,memberId:b.memberId,blockIds:[b.id]});
 }
 return turns;
}
export function compatible(r:Recording,p:Project){return r.scriptVersion===p.scriptVersion&&r.deckVersion===p.deckVersion&&turnsFor(p).some(t=>t.id===r.turnId&&t.memberId===r.memberId)}
export function recordingFor(turn:Turn,p:Project,recordings:Recording[]){
 return recordings.filter(r=>r.turnId===turn.id&&r.memberId===turn.memberId&&compatible(r,p)).sort((a,b)=>Number(b.locked)-Number(a.locked)||b.submittedAt.localeCompare(a.submittedAt)||b.id.localeCompare(a.id))[0];
}
export const audioUrl=(id:string)=>'/api/rehearsal/audio/'+encodeURIComponent(id);
export const slideUrl=(id:string)=>'/api/rehearsal/slides/'+encodeURIComponent(id);
export function formatTime(s:number){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}

export type TurnProgress={memberId:string;turnId:string;scriptVersion:string;deckVersion:string;submittedAt:string};
// getRandomValues is also available in HTTP-only local previews.
export function newRehearsalId():string{
 if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
 const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
