import type {IncentiveConfig,RewardPeriod} from './incentive-rules';
export const MONTHLY_RULE_VERSION='yi68-monthly-once-per-semester-v2';
export type RewardPrize={id:string;label:string;quantity:number};
export const COFFEE_COUPON:RewardPrize={id:'luckin-zero-coffee-voucher',label:'瑞幸咖啡0元兑换券',quantity:1};
export const SEMESTER_KEEPSAKE:RewardPrize={id:'class-keepsake',label:'班级文创纪念品',quantity:1};
export function prizeFor(kind:'month'|'semester',result?:{prize?:RewardPrize}|null):RewardPrize{
 // The current monthly prize also covers published draws; their stored draw snapshots stay intact.
 return kind==='month'?COFFEE_COUPON:result?.prize||SEMESTER_KEEPSAKE;
}
export type RewardSemester={id:string;label:string;starts_at:string;ends_at:string};
export function configuredSemester(c:IncentiveConfig):RewardSemester{return {id:c.semester_id,label:c.semester_label,starts_at:c.semester_start,ends_at:c.semester_end}}
export function overlapsSemester(p:Pick<RewardPeriod,'starts_at'|'ends_at'>,s:RewardSemester){return p.starts_at<s.ends_at&&p.ends_at>s.starts_at}
export function monthlyWin(studentId:string,semester:RewardSemester,past:RewardPeriod[]){
 return past.filter(p=>p.kind==='month'&&p.result_json).sort((a,b)=>a.ends_at.localeCompare(b.ends_at)||a.id.localeCompare(b.id)).find(p=>{
  const result=JSON.parse(p.result_json!);
  const scope=result.reward_semester as RewardSemester|undefined;
  return (scope?scope.id===semester.id:overlapsSemester(p,semester))&&result.winners.some((w:{student_id:string})=>w.student_id===studentId);
 })??null;
}
export function monthlyEligibility(studentId:string,period:RewardPeriod,c:IncentiveConfig,past:RewardPeriod[]){
 const semester=configuredSemester(c),inSemester=overlapsSemester(period,semester),win=inSemester?monthlyWin(studentId,semester,past):null;
 return {eligible:!win,reason:win?'本学期已获月奖，不再参与后续月奖；学期文创独立评选':'可参评',awarded_period_id:win?.id??null,semester_id:inSemester?semester.id:null};
}
