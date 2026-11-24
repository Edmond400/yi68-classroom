import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{build}=require(require.resolve('esbuild',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const dir=mkdtempSync(resolve(tmpdir(),'rehearsal-algo-'));
try{
 await build({stdin:{contents:`export * from './lib/rehearsal/algorithm';export * from './lib/rehearsal/model';export * from './lib/rehearsal/timeline';export * from './lib/rehearsal/algorithm-document';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',outfile:resolve(dir,'algo.mjs')});
 const a=await import(pathToFileURL(resolve(dir,'algo.mjs')).href),c={...a.DEFAULT_CONFIG};
 const block=(id,text,memberId='a',slideIndex=0,rest={})=>({id,paragraphId:id,text,memberId,slideIndex,nonspoken:false,paragraphEnd:true,...rest});
 const p={id:'current',revision:1,title:'测试',theme:'',status:'published',publishedAt:null,updatedAt:'fixture',scriptVersion:'s1',deckVersion:'d1',algorithmVersion:c.version,config:c,members:[{id:'a',name:'甲',enabled:true},{id:'b',name:'乙',enabled:true}],blocks:[block('b1','2026年，研究开始。')],slides:[{id:'s1',pageIndex:0},{id:'s2',pageIndex:1}],overrides:{}};
 assert.equal(a.countText(p.blocks[0]).units,9);assert.equal(a.countText(block('x',"research-based don't IAD",'a',0,{spellOut:['IAD']})).units,6);
 assert.equal(a.countText(block('x','正文不读','a',0,{nonspoken:true})).units,0);
 assert.equal(a.normalizeSpeech('2026-10-31，12.5%，10-20，￥100，3:2'), '二零二六年十月三十一日,百分之十二点五,十至二十,一百元,三比二');
 for(const [n,w] of [['10','十'],['101','一百零一'],['10001','一万零一'],['100010001','一亿零一万零一']])assert.equal(a.chineseInteger(n),w);
 assert(a.countText(block('x','x=√y')).warnings.length);
 const all=block('p','甲乙，丙丁。'),split=[block('x','甲乙，','a',0,{paragraphId:'p',paragraphEnd:false}),block('y','丙丁。','a',0,{paragraphId:'p'})];
 assert(Math.abs(a.countText(all).pause-split.reduce((s,b)=>s+a.countText(b).pause,0))<1e-9);
 assert.equal(a.countText(block('x','甲……。”）')).pause,c.endmarkSeconds+c.paragraphEndSeconds);
 let e=a.estimateProject({...p,blocks:split});assert.equal(e.turns[0].slideSeconds,0);
 e=a.estimateProject({...p,blocks:[block('1','甲','a'),block('2','乙','b'),block('3','丙','a')]});assert.equal(e.handoffs,2);assert.equal(e.globalSeconds,22);
 assert.equal(a.estimateProject({...p,blocks:[block('1','甲','a'),block('2','乙','a')]}).handoffs,0);
 assert.equal(a.estimateProject({...p,blocks:[]}).risk,'empty');
 for(const [seconds,risk] of [[830,'pass'],[831,'warning'],[890,'warning'],[891,'over']]){
  const config={...c,baseUnitsPerMinute:60,endmarkSeconds:0,paragraphEndSeconds:0,personalBufferRate:0};
  const x=a.estimateProject({...p,config,blocks:[block('x','甲'.repeat(seconds))]});assert.equal(x.risk,risk);assert.equal(x.predictedSeconds,seconds+10);
 }
 assert.deepEqual(a.constrainedRound([92.4,155.4,183.75,249.9,114.45],806),[90,155,185,250,115]);
 for(let budget=5;budget<=900;budget+=7){const vs=[budget*.1,budget*.2,budget*.3,budget*.39];const r=a.constrainedRound(vs,budget);assert(r.every(n=>n%5===0));assert(r.reduce((a,b)=>a+b,0)<=budget)}
 e=a.estimateProject({...p,blocks:[block('1','甲','a',0,{chartAction:true,actionId:'shared'}),block('2','乙','a',1,{chartAction:true,actionId:'shared'})]});assert.equal(e.turns[0].explicitExtraSeconds,4);assert.equal(e.turns[0].slideSeconds,1.5);
 const sample=(id,ratio,change={})=>({id,memberId:'a',turnId:'turn-b1',complete:true,algorithmVersion:p.algorithmVersion,scriptVersion:'s1',deckVersion:'d1',predictedSeconds:100,durationMs:ratio*100000,submittedAt:'2026-10-31T00:00:0'+id+'Z',...change});
 let cal=a.calibration('a',p,[sample('1',1),sample('2',1.08),sample('3',1.2),sample('9',8,{complete:false}),sample('8',8,{scriptVersion:'old'}),sample('7',1,{predictedSeconds:0})]);assert.equal(cal.ratio,1.08);assert.equal(cal.count,3);
 assert.equal(a.calibration('a',p,[sample('1',3,{algorithmVersion:'old-config'})]).count,0);assert.equal(a.calibration('a',p,[sample('1',3)]).ratio,1.5);assert.equal(a.calibration('a',p,[sample('1',.1)]).ratio,.7);
 assert.deepEqual(a.estimateProject(p),a.estimateProject(p));
 const clock=new a.EffectiveClock();clock.resume(10);assert.equal(clock.value(1010),1000);clock.pause(1010);assert.equal(clock.value(9000),1000);clock.resume(10000);assert.equal(clock.value(11000),2000);clock.reset();assert.equal(clock.value(999999),0);
 assert.throws(()=>a.validateEvents([{t_ms:0,slide_index:0,source:'start'},{t_ms:0,slide_index:1,source:'manual'}],1000,2));
 assert.throws(()=>a.validateEvents([{t_ms:1,slide_index:0,source:'start'}],1000,2));
 const events=[{t_ms:0,slide_index:0,source:'start'},{t_ms:500,slide_index:1,source:'manual'}];assert.equal(a.slideAt(events,499),0);assert.equal(a.slideAt(events,500),1);
 const r={...sample('1',1),locked:false,events,slides:p.slides},r2={...r,id:'2',turnId:'turn-b2',memberId:'b',durationMs:2000};r.durationMs=1000;
 const timeline=a.buildTimeline({...p,blocks:[block('b1','甲','a'),block('b2','乙','b'),block('b3','丙','a')]},[r,r2]);assert.equal(timeline.missing.length,1);assert.equal(timeline.totalMs,19000);assert.equal(a.locateTimeline(timeline.parts,17000),3);
 const notes=JSON.parse(readFileSync('lib/rehearsal/algorithm-notes.json','utf8'));assert.equal(notes.length,10);for(const term of ['U_j','T_{\\mathrm{speech}','0.70','中位数','758','人工'])assert(JSON.stringify(notes).includes(term.replace(/\\/g,'\\\\'))||JSON.stringify(notes).includes(term));
 const wordProject={...p,blocks:[block('x','resea','a',0,{paragraphId:'word',paragraphEnd:false}),block('y','rch.','a',0,{paragraphId:'word'})]};assert.equal(a.estimateProject(wordProject).turns[0].equivalentUnits,1.5);
 const manual=a.estimateProject({...p,blocks:[block('x','x=√y','a',0,{manualSpeechSeconds:12,actionId:'manual'}),block('y','y=√x','a',0,{manualSpeechSeconds:7,actionId:'manual'})]}).turns[0];assert.equal(manual.speechSeconds,0);assert.equal(manual.punctuationSeconds,0);assert.equal(manual.explicitExtraSeconds,19);
 assert.equal(a.normalizeSpeech('1,000元'),'一千元');
 const custom={...c,version:'custom',baseUnitsPerMinute:240,handoffSeconds:3,operationSeconds:8,slideSwitchSeconds:2,ratioClip:[.8,1.2]};
 const rendered=a.algorithmBodyText(notes[0].body,custom,0);assert(rendered.includes('HANDOFF_S = 3'));assert(rendered.includes('GLOBAL_OPERATION_S = 8'));assert(rendered.includes('240'));assert(rendered.includes('SLIDE_SWITCH_S = 2'));assert(rendered.includes('CALIBRATION_MAX = 1.2'));assert(!rendered.includes('CALIBRATION_MAX = 20'));
 console.log('PASS rehearsal algorithm: mixed tokens, numbers, punctuation, split identity, handoffs, boundary budgets, rounding, explicit cost dedup, calibration, clock, timeline and complete notes');
}finally{rmSync(dir,{recursive:true,force:true})}
