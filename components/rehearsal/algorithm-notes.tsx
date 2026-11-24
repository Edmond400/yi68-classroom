'use client';
import {useState} from 'react';
import {algorithmBodyText} from '@/lib/rehearsal/algorithm-document';
import sections from '@/lib/rehearsal/algorithm-notes.json';
import {DEFAULT_CONFIG,type AlgoConfig} from '@/lib/rehearsal/model';
import {constrainedRound} from '@/lib/rehearsal/algorithm';
const labels:Record<keyof AlgoConfig,string>={version:'算法与配置版本',baseUnitsPerMinute:'基础等效单位/分钟',commaSeconds:'逗号/顿号秒数',endmarkSeconds:'句末秒数',colonSemiSeconds:'冒号/分号秒数',paragraphEndSeconds:'真实自然段末秒数',slideSwitchSeconds:'实际换页秒数',handoffSeconds:'成员交接秒数',operationSeconds:'公共操作余量秒数',chartExtraSeconds:'图表额外动作秒数',formulaExtraSeconds:'公式额外动作秒数',planningSeconds:'规划目标秒数',hardLimitSeconds:'硬上限秒数',personalBufferRate:'个人缓冲比例',ratioClip:'校准比率限幅'};
export function AlgorithmNotes({config=DEFAULT_CONFIG,updatedAt}:{config?:AlgoConfig;updatedAt?:string}){
 const [expanded,setExpanded]=useState(false),[input,setInput]=useState('88,148,175,238,109');
 const values=input.split(/[,，\s]+/).map(Number).filter(n=>Number.isFinite(n)&&n>=0),sum=values.reduce((a,b)=>a+b,0),global=config.handoffSeconds*Math.max(0,values.length-1)+config.operationSeconds,budget=config.planningSeconds-global;
 const alpha=sum>0?Math.min(config.personalBufferRate,Math.max(0,(budget-sum)/sum)):0;
 const result=sum<=budget&&budget>0?constrainedRound(values.map(n=>n*(1+alpha)),budget):null;
 return <section className="rh-algorithm panel rh-pad" id="algorithm"><p className="eyebrow">SPEECH TIME PLANNER · OPEN METHOD</p><h2>自动发言时间测算算法｜完整原理与计算细则</h2><details><summary>展开算法参数和完整计算原理</summary><p>当前生效版本：<code>{config.version}</code>{updatedAt&&<> · 更新于 {new Date(updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</>}</p><p>工程启发式估算，无需大模型。真实排练是验收依据；系统不能判断是否漏读，也不把经验校准等同于纯语速。</p><div className="rh-actions"><button type="button" className="btn secondary" onClick={()=>setExpanded(!expanded)}>{expanded?'收起全部':'展开全部'}</button><button className="btn secondary" type="button" onClick={()=>navigator.clipboard?.writeText(JSON.stringify(config,null,2)+'\n'+sections.map((s,i)=>s.title+'\n'+algorithmBodyText(s.body,config,i)).join('\n\n'))}>复制公式与全文</button></div>
 <table className="rh-table"><caption>实际计算使用的完整参数（当前配置）</caption><tbody>{Object.entries(config).map(([key,value])=><tr key={key}><th>{labels[key as keyof AlgoConfig]}</th><td><code>{key}</code></td><td>{Array.isArray(value)?value.join(' – '):value}</td></tr>)}</tbody></table>
 <p>原理正文中的常量名对应上表当前参数；固定示例明确使用初始参数。管理员修改会生成新配置版本，历史录音保留提交时快照。</p>
 {sections.map((s,i)=><details key={s.title+expanded} open={expanded}><summary>{s.title}</summary><div className="rh-method-text">{algorithmBodyText(s.body,config,i)}</div></details>)}
 <div className="rh-example"><h3>使用当前参数演算</h3><label>各轮次自然预计秒数（逗号分隔；示例假定相邻轮次为不同成员）<input value={input} onChange={e=>setInput(e.target.value)} maxLength={200}/></label><p>H={Math.max(0,values.length-1)}；G={global.toFixed(2)}秒；B={budget.toFixed(2)}秒；Σt={sum.toFixed(2)}秒；T={ (sum+global).toFixed(2)}秒；α={(alpha*100).toFixed(2)}%。</p><p>{result?'受预算约束的五秒目标：['+result.join(', ')+']；目标合计 '+result.reduce((a,b)=>a+b,0)+' 秒':'无法满足规划预算，请删稿或调整额外动作。'}</p></div>
 </details></section>;
}
