import type {AlgoConfig} from './model';
export function algorithmBodyText(body:string,c:AlgoConfig,index:number){
 if(index===9)return '本节为固定初始参数的可复现算例，下面另提供使用当前参数的演算。\n\n'+body;
 const named:[string,string][]=[['RESERVE_S = 60',`RESERVE_S = ${c.hardLimitSeconds-c.planningSeconds}`],['HANDOFF_S = 6',`HANDOFF_S = ${c.handoffSeconds}`],['GLOBAL_OPERATION_S = 10',`GLOBAL_OPERATION_S = ${c.operationSeconds}`],['CHART_EXTRA_S = 4',`CHART_EXTRA_S = ${c.chartExtraSeconds}`],['FORMULA_EXTRA_S = 3',`FORMULA_EXTRA_S = ${c.formulaExtraSeconds}`],['speech-time-planner-v1.0',c.version]];const pairs:[string,string][]=[...named,
 ['900',String(c.hardLimitSeconds)],['210',String(c.baseUnitsPerMinute)],['840',String(c.planningSeconds)],
 ['0.15',String(c.commaSeconds)],['0.35',String(c.endmarkSeconds)],['0.25',String(c.colonSemiSeconds)],['0.45',String(c.paragraphEndSeconds)],
 ['1.50',String(c.ratioClip[1])],['1.5',String(c.slideSwitchSeconds)],['0.05',String(c.personalBufferRate)],['0.70',String(c.ratioClip[0])],
 ['5%',(c.personalBufferRate*100)+'%'],['6H+10',`${c.handoffSeconds}H+${c.operationSeconds}`],
 ['4N_{\\mathrm{chart},j}+3N_{\\mathrm{formula},j}',`${c.chartExtraSeconds}N_{\\mathrm{chart},j}+${c.formulaExtraSeconds}N_{\\mathrm{formula},j}`]];
 const plan=(c.planningSeconds/60).toFixed(2).replace(/\.?0+$/,''),hard=(c.hardLimitSeconds/60).toFixed(2).replace(/\.?0+$/,'');body=body.replace(/14分钟/g,plan+'分钟').replace(/15分钟/g,hard+'分钟').replace(/14\/15分钟/g,plan+'/'+hard+'分钟');
 const values=new Map(pairs);
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=pairs.map(([key])=>({key,pattern:/^[\d.]+$/.test(key)?'(?<![\\d.])'+escape(key)+'(?![\\d.])':escape(key)})).sort((a,b)=>b.key.length-a.key.length).map(x=>x.pattern).join('|');
 body=body.replace(new RegExp(pattern,'g'),key=>values.get(key)??key);

 return body;
}
