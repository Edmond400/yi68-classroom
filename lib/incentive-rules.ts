import { randomInt } from 'node:crypto';
export const RULE_VERSION = 'yi68-participation-v1';
export const FIRST_START = '2026-09-30T16:00:00.000Z';
export type RewardPeriod = {id:string;kind:'month'|'semester';label:string;starts_at:string;ends_at:string;quota:number;result_json:string|null;published_at:string|null;delivery_json:string};
export type IncentiveConfig = {first_month:string;semester_id:string;semester_label:string;semester_start:string;semester_end:string};
export const defaultConfig:IncentiveConfig={first_month:'2026-10',semester_id:'semester-2026-autumn',semester_label:'2026—2027学年秋季学期',semester_start:FIRST_START,semester_end:'2027-01-15T05:00:00.000Z'};
export function beijingDay(value:string|number|Date){return new Date(new Date(value).getTime()+8*3600000).toISOString().slice(0,10)}
export function monthEnd(month:string){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0,5)).toISOString()}
export function previousMonth(month:string){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-2,15)).toISOString().slice(0,7)}
export function nextMonth(month:string){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,15)).toISOString().slice(0,7)}
export function awardMonthFor(occurred:string,approved:string,first='2026-10'){
 const threshold=Math.max(Date.parse(occurred),Date.parse(approved));let month=beijingDay(threshold).slice(0,7);if(month<first)month=first;
 return threshold>=Date.parse(monthEnd(month))?nextMonth(month):month;
}
export type RankedMember={student_id:string;name:string;count:number};
export function selectReward(members:RankedMember[],quota:number,random:(n:number)=>number=n=>randomInt(n)){
 const sorted=members.filter(m=>m.count>0).sort((a,b)=>b.count-a.count||a.student_id.localeCompare(b.student_id));
 const winners:RankedMember[]=[],candidates:RankedMember[]=[],drawn:RankedMember[]=[];
 for(let i=0;i<sorted.length&&winners.length<quota;){let j=i+1;while(j<sorted.length&&sorted[j].count===sorted[i].count)j++;const group=sorted.slice(i,j),slots=quota-winners.length;
  if(group.length<=slots)winners.push(...group);else{candidates.push(...group);const pool=[...group];for(let n=0;n<slots;n++){const k=random(pool.length);if(!Number.isInteger(k)||k<0||k>=pool.length)throw new Error('Invalid random choice');const [member]=pool.splice(k,1);winners.push(member);drawn.push(member);}break;}i=j;
 }
 return {winners,candidates,drawn};
}
export function onMonthlyBreak(studentId:string,month:string,past:RewardPeriod[]){
 return [previousMonth(month),previousMonth(previousMonth(month))].every(m=>{const p=past.find(p=>p.id==='month-'+m&&p.result_json);if(!p)return false;return JSON.parse(p.result_json!).winners.some((w:{student_id:string})=>w.student_id===studentId)});
}
