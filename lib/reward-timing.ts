type Period={id:string;ends_at:string;result:unknown};
export function currentRewardPeriod<T extends Period>(periods:T[],selected:string,now:number):T|undefined{
 const ordered=[...periods].sort((a,b)=>Date.parse(a.ends_at)-Date.parse(b.ends_at));
 return ordered.find(p=>p.id===selected)||ordered.find(p=>!p.result&&Date.parse(p.ends_at)<=now)||[...ordered].reverse().find(p=>p.result&&Date.parse(p.ends_at)<=now&&now-Date.parse(p.ends_at)<86400000)||ordered.find(p=>!p.result&&Date.parse(p.ends_at)>now)||ordered.at(-1);
}
export function rewardRefreshDelay(periods:Period[],now:number){
 const pending=periods.filter(p=>!p.result).map(p=>Date.parse(p.ends_at)).filter(Number.isFinite);
 if(pending.some(time=>time<=now))return 1000;
 return pending.length?Math.min(15000,Math.max(25,Math.min(...pending)-now)):15000;
}
