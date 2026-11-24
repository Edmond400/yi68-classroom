import { DEFAULT_CONFIG, turnsFor, type Project,type Recording,type AlgoConfig,type Breakdown,type Estimate } from './model';
const digits='零一二三四五六七八九';
export function chineseInteger(value:string):string {
 const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>=1e12)return [...value].map(x=>digits[Number(x)]??x).join('');
 if(n===0)return '零';
 function group(x:number){let out='',zero=false;for(let p=3;p>=0;p--){const div=10**p,d=Math.floor(x/div)%10;if(d){if(zero)out+='零';out+=digits[d]+['','十','百','千'][p];zero=false}else if(out)zero=true}return out}
 const gs=[Math.floor(n/1e8),Math.floor(n/1e4)%1e4,n%1e4];let out='';
 gs.forEach((x,i)=>{if(x){if(out&&(x<1000||gs[i-1]===0))out+='零';out+=group(x)+['亿','万',''][i]}});
 return out.replace(/^一十/,'十');
}
const decimal=(s:string)=>{const [a,b]=s.split('.');return chineseInteger(a)+(b?'点'+[...b].map(x=>digits[+x]).join(''):'')};
export function normalizeSpeech(text:string,warnings:string[]=[]){
 let s=text.normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g,'');
 s=s.replace(/\b(\d{1,3}(?:,\d{3})+)(?=\D|$)/g,n=>n.replace(/,/g,''));
 s=s.replace(/\b(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)\b/g,(_,y,m,d)=>{if(+m<1||+m>12||+d<1||+d>31)warnings.push('日期需核对');return [...y].map(x=>digits[+x]).join('')+'年'+chineseInteger(m)+'月'+chineseInteger(d)+'日'});
 s=s.replace(/\b(\d{4})年/g,(_,y)=>[...y].map(x=>digits[+x]).join('')+'年');
 s=s.replace(/(\d+(?:\.\d+)?)\s*%/g,(_,n)=>'百分之'+decimal(n));
 s=s.replace(/(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)/g,(_,a,b)=>{warnings.push('比率或时间需核对，可填写实际朗读文本');return decimal(a)+'比'+decimal(b)});
 s=s.replace(/(\d+(?:\.\d+)?)\s*[-~～—]\s*(\d+(?:\.\d+)?)/g,(_,a,b)=>{warnings.push('数字范围读法需核对');return decimal(a)+'至'+decimal(b)});
 s=s.replace(/([¥￥$])\s*(\d+(?:\.\d+)?)/g,(_,symbol,n)=>decimal(n)+(symbol==='$'?'美元':'元'));
 s=s.replace(/\d+(?:\.\d+)?/g,n=>{if(n.replace('.','').length>11)warnings.push('长数字或编号需指定实际读法');return decimal(n)});
 if(/[=+×÷∑∫√^<>≤≥]/.test(s))warnings.push('公式/符号需确认：填写实际朗读文本或独立估时秒数');
 return s;
}
export function countText(block:Project['blocks'][number],config:AlgoConfig=DEFAULT_CONFIG){
 const warnings:string[]=[];
 if(block.manualSpeechSeconds!==undefined&&!block.nonspoken)return {units:0,pause:0,warnings:['此片段使用人工独立估时 '+block.manualSpeechSeconds+' 秒'],normalized:''};
 if(block.nonspoken)return {units:0,pause:0,warnings,normalized:''};
 const s=normalizeSpeech(block.spokenText??block.text,warnings);
 const cjk=(s.match(/\p{Script=Han}/gu)||[]).length;
 const words=s.match(/[A-Za-z]+(?:[-'’][A-Za-z]+)*/g)||[];
 const spell=new Set((block.spellOut||[]).map(x=>x.toLowerCase()));
 let units=cjk;
 for(const word of words){units+=spell.has(word.toLowerCase())?word.replace(/[^a-z]/gi,'').length:1.5;if(/^[A-Z]{2,}$/.test(word)&&!spell.has(word.toLowerCase()))warnings.push(word+'按普通词估算，请核对缩写念法')}
 // One semantic punctuation group -> one pause, even with closing quotes/brackets.
 const groups=s.match(/[，,、。.!！?？:：;；…—][，,、。.!！?？:：;；…—\s”’"'）)】\]]*/g)||[];
 const pause=groups.reduce((sum,g)=>sum+(/[。.!！?？…]/.test(g)?config.endmarkSeconds:/[:：;；—]/.test(g)?config.colonSemiSeconds:config.commaSeconds),0)+((block.paragraphEnd?1:0)+(s.match(/\n+/g)||[]).length)*config.paragraphEndSeconds+(block.longPause||0);
 return {units,pause,warnings:[...new Set(warnings)],normalized:s};
}
export function constrainedRound(values:number[],budget:number,step=5){
 if(!values.length)return [];
 const base=values.map(x=>Math.floor(Math.max(0,x)/step)*step);
 const desired=Math.min(Math.floor(budget/step),Math.round(values.reduce((a,b)=>a+b,0)/step));
 let slots=Math.max(0,desired-base.reduce((a,b)=>a+b,0)/step);
 const order=values.map((v,i)=>({i,r:v/step-Math.floor(v/step)})).sort((a,b)=>b.r-a.r||a.i-b.i);
 for(const {i} of order)if(slots-->0)base[i]+=step;
 return base;
}
export function calibration(memberId:string,p:Project,recordings:Recording[]){
 const samples=recordings.filter(r=>r.memberId===memberId&&r.complete&&r.algorithmVersion===p.algorithmVersion&&r.scriptVersion===p.scriptVersion&&r.deckVersion===p.deckVersion&&r.predictedSeconds>0&&Number.isFinite(r.durationMs)&&r.durationMs>0).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)||b.id.localeCompare(a.id)).slice(0,3);
 const ratios=samples.map(r=>r.durationMs/1000/r.predictedSeconds).sort((a,b)=>a-b);
 if(!ratios.length)return {ratio:null,count:0,warnings:['尚无编排者确认完整的当前版本录音，估算置信程度有限']};
 const med=ratios.length%2?ratios[Math.floor(ratios.length/2)]:(ratios[ratios.length/2-1]+ratios[ratios.length/2])/2;
 const ratio=Math.min(p.config.ratioClip[1],Math.max(p.config.ratioClip[0],med));
 const warnings:string[]=[];
 if(samples.length<3)warnings.push('校准样本不足3次，估算置信程度有限');
 if(ratio!==med)warnings.push('校准比率已限幅');
 if(ratios[ratios.length-1]-ratios[0]>.3)warnings.push('练习总时长波动较大');
 return {ratio,count:samples.length,warnings};
}
export function validateProject(p:Project){
 const errors:string[]=[];const members=new Set(p.members.filter(m=>m.enabled).map(m=>m.id));
 if(!p.title.trim())errors.push('请填写汇报标题');
 if(!members.size)errors.push('请添加组员');
 if(!p.slides.length)errors.push('请上传静态PPT页');
 if(!p.blocks.some(b=>!b.nonspoken&&b.text.trim()))errors.push('尚无可朗读内容');
 p.blocks.forEach((b,i)=>{if(b.nonspoken||!b.text.trim())return;if(!b.memberId||!members.has(b.memberId))errors.push('第'+(i+1)+'片段未分配有效组员');if(b.slideIndex===null||b.slideIndex<0||b.slideIndex>=p.slides.length)errors.push('第'+(i+1)+'片段缺少有效PPT映射')});
 return errors;
}
export function estimateProject(p:Project,recordings:Recording[]=[]):Estimate{
 const c=p.config,ordered=turnsFor(p),warnings=validateProject(p);
 const turns:Breakdown[]=ordered.map(turn=>{
  let units=0,pause=0,switches=0,extra=0,last:number|null=null;const w:string[]=[],actions=new Set<string>();
  const groups:Project['blocks']=[];
  for(const id of turn.blockIds){const b=p.blocks.find(x=>x.id===id)!;const prev=groups[groups.length-1];if(prev&&prev.paragraphId===b.paragraphId&&prev.manualSpeechSeconds===undefined&&b.manualSpeechSeconds===undefined){prev.text+=b.text;prev.spokenText=(prev.spokenText??prev.text.slice(0,prev.text.length-b.text.length))+(b.spokenText??b.text);prev.paragraphEnd=b.paragraphEnd;prev.longPause=(prev.longPause||0)+(b.longPause||0);prev.spellOut=[...new Set([...(prev.spellOut||[]),...(b.spellOut||[])])]}else groups.push({...b});}
  for(const group of groups){const count=countText(group,c);units+=count.units;pause+=count.pause;w.push(...count.warnings)}
  for(const id of turn.blockIds){const b=p.blocks.find(x=>x.id===id)!;if(b.slideIndex!==null){if(last!==null&&last!==b.slideIndex)switches++;last=b.slideIndex}
   extra+=b.manualSpeechSeconds||0;const action=b.actionId||b.id;if(!actions.has(action)){actions.add(action);extra+=(b.chartAction?c.chartExtraSeconds:0)+(b.formulaAction?c.formulaExtraSeconds:0)+(b.extraSeconds||0)}
  }
  const speech=60*units/c.baseUnitsPerMinute,slide=switches*c.slideSwitchSeconds,initial=speech+pause+slide+extra,cal=calibration(turn.memberId,p,recordings);
  return {turnId:turn.id,memberId:turn.memberId,equivalentUnits:units,speechSeconds:speech,punctuationSeconds:pause,slideSeconds:slide,explicitExtraSeconds:extra,initialSeconds:initial,calibratedSeconds:initial*(cal.ratio??1),calibrationRatio:cal.ratio,calibrationSamples:cal.count,targetSeconds:0,autoTargetSeconds:0,reductionSeconds:0,manual:false,warnings:[...new Set([...w,...cal.warnings])]};
 });
 const handoffs=ordered.slice(1).filter((t,i)=>t.memberId!==ordered[i].memberId).length,global=c.handoffSeconds*handoffs+c.operationSeconds,budget=c.planningSeconds-global;
 if(budget<=0)throw new Error('交接及公共操作余量必须小于计划总时长');
 const sum=turns.reduce((s,t)=>s+t.calibratedSeconds,0),predicted=sum+global;
 const risk=!sum?'empty':predicted>c.hardLimitSeconds?'over':predicted>c.planningSeconds?'warning':'pass';
 const need=Math.max(0,sum-budget);let remaining=need;
 let goals=turns.map(t=>t.calibratedSeconds);
 if(sum>0&&sum<=budget){const alpha=Math.min(c.personalBufferRate,Math.max(0,(budget-sum)/sum));goals=constrainedRound(goals.map(x=>x*(1+alpha)),budget)}
 else if(sum>budget){goals=goals.map((t,i)=>{const reduction=Math.min(t*.15,need*t/sum);turns[i].reductionSeconds=reduction;remaining-=reduction;return t-reduction});warnings.push('目标需通过删稿或减少额外动作实现；照读原稿不能保证达到建议目标')}
 turns.forEach((t,i)=>{t.autoTargetSeconds=goals[i];const override=p.overrides[t.turnId];t.targetSeconds=override?.seconds??goals[i];t.manual=!!override});
 const target=turns.reduce((s,t)=>s+t.targetSeconds,0)+global;
 return {algorithmVersion:p.algorithmVersion,turns,handoffs,globalSeconds:global,initialSeconds:turns.reduce((s,t)=>s+t.initialSeconds,0)+global,predictedSeconds:predicted,targetSeconds:target,budgetSeconds:budget,risk,targetRisk:target>c.hardLimitSeconds?'over':target>c.planningSeconds?'warning':'pass',warnings,reductionNeeded:need,unallocatedReduction:sum>budget?Math.max(0,remaining):0};
}
