import { digest } from './passwords';
export function frozenName(member:{name:string;nickname?:string|null}){
 const nickname=member.nickname||null;return {name:member.name,nickname,display_name:nickname||member.name};
}
export function displayedReward(result:any){
 const modern=result.display_version==='names-v1';
 const winners:{name:string;nickname:string|null;display_name:string}[]=result.winners.map((w:any)=>frozenName({name:w.name,nickname:modern?w.nickname:null}));
 const historicalNames=new Map((result.snapshot??[]).map((m:any)=>[m.student_id,m.name]));
 const legacyNames=new Map((result.candidate_codes??[]).map((m:any)=>[m.code,historicalNames.get(m.student_id)]));
 for(const w of result.winners)if(w.code)legacyNames.set(w.code,w.name);
 const wheel:{display_name:string;selected:boolean;draw_order:number|null}[]=(result.wheel??[]).map((w:any)=>{const order=modern?(result.drawn_student_ids??[]).indexOf(w.student_id):(result.drawn_codes??[]).indexOf(w.code);return {display_name:String(modern?(w.nickname||w.name):(legacyNames.get(w.code)||'往期参与者')),selected:order>=0,draw_order:order>=0?order+1:null}});
 // Keep the original receipt for old draws, even though their labels now show names.
 const receipt=modern?digest(JSON.stringify({winners,wheel,executed_at:result.executed_at})):digest(JSON.stringify({winners:result.winners.map((w:any)=>({name:w.name,code:w.code})),wheel:result.wheel,drawn_codes:result.drawn_codes,executed_at:result.executed_at}));
 // Already-open older pages accept these name-valued aliases until refreshed.
 // No anonymous identifier or student ID is returned.
 return {rule_version:result.rule_version,scheduled_at:result.scheduled_at,executed_at:result.executed_at,...(result.prize?{prize:result.prize}:{}),winners:winners.map(w=>({...w,code:w.display_name})),wheel:wheel.map(w=>({...w,code:w.display_name})),drawn_codes:wheel.filter(w=>w.selected).map(w=>w.display_name),receipt};
}
