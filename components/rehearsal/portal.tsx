'use client';
import {useCallback,useEffect,useState} from 'react';
import {api} from '@/lib/client';
import {type Project,type Recording,type Estimate,type TurnProgress,formatTime} from '@/lib/rehearsal/model';
import {selectRehearsal,leaveRehearsal} from '@/lib/rehearsal/session';
import {AlgorithmNotes} from './algorithm-notes';
import {Practice} from './practice';
import {EstimatePanel} from './shared';
import {GroupPlayback} from './playback';
import {ReadingPreview} from './reading-preview';
import {PresentationDownload} from './presentation-download';
import {RehearsalAdmin} from './admin';
type Catalog={id:string;title:string;status:string;updatedAt:string};
type Data={project:Project|null;recordings:Recording[];progress:TurnProgress[];estimate:Estimate|null};
export function RehearsalPortal(){
 const [projects,setProjects]=useState<Catalog[]>([]),[chosen,setChosen]=useState<Catalog|null>(null),[code,setCode]=useState(''),[data,setData]=useState<Data|null>(null),[member,setMember]=useState(''),[practicing,setPracticing]=useState(false),[editing,setEditing]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 const catalog=useCallback(async()=>{try{setProjects((await api('/api/rehearsal/projects')).projects);setError('')}catch(e){setError((e as Error).message)}finally{setReady(true)}},[]);
 const load=useCallback(async()=>{const r:Data=await api('/api/rehearsal');setData(r);return r},[]);
 useEffect(()=>{leaveRehearsal();void catalog()},[catalog]);
 async function enter(){if(!chosen)return;setBusy(true);setError('');try{selectRehearsal(chosen.id);const r=await api('/api/rehearsal/access',{project_id:chosen.id,code});selectRehearsal(chosen.id,r.session_token);await load();setCode('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 function back(){if(practicing&&!confirm('离开汇报将结束未提交的练习，确定离开？'))return;leaveRehearsal();setChosen(null);setData(null);setEditing(false);setPracticing(false);setMember('');setCode('');setError('');void catalog()}
 const p=data?.project;
 return <div className="rh-root"><div className="page-heading"><div><p className="eyebrow">CLASS 68 / REHEARSAL STUDIO</p><h1>模拟汇报平台</h1></div><a className="text-link" href="/admin/rehearsal">汇报管理 ↗</a></div>
 <p className="rh-privacy">选择汇报并输入小组四位密码，即可练习、查看材料或共同编排。密码由小组共享，录音仅供持有本汇报密码的成员访问。</p>{error&&<p className="callout error" role="alert">{error}</p>}
 {!data&&<section className="panel rh-pad"><h2>{chosen?'进入「'+chosen.title+'」':'选择汇报'}</h2>{!ready&&<p>正在读取汇报列表…</p>}{!chosen?<><div className="rh-name-grid">{projects.map(r=><button key={r.id} onClick={()=>{setChosen(r);setError('')}}>{r.title}<small>{r.status==='draft'?'准备中':r.status==='ended'?'已结束':'可练习'}</small></button>)}</div>{ready&&!projects.length&&<p>暂时没有可进入的汇报，请联系管理员新建或设置小组密码。</p>}</>:<form onSubmit={e=>{e.preventDefault();void enter()}}><label>小组四位密码<input type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} required/></label><div className="rh-actions"><button className="btn" disabled={busy||code.length!==4}>{busy?'正在验证…':'进入汇报'}</button><button type="button" onClick={back}>重新选择</button></div></form>}</section>}
 {data&&<div className="rh-actions"><button onClick={back}>← 切换汇报</button><button className="btn secondary" onClick={()=>{if(practicing&&!confirm('进入编排将离开当前练习，请先提交录音。确定继续？'))return;setPracticing(false);setEditing(true)}}>编排本汇报</button></div>}
 {data&&editing?<RehearsalAdmin configured group onBack={()=>{setEditing(false);void load().catch(e=>setError((e as Error).message))}}/>:data&&<>{!p?<section className="panel rh-pad"><h2>{chosen?.title}</h2><p>尚未发布练习材料，请进入“编排本汇报”添加材料并发布。</p></section>:<><section className="rh-hero panel rh-pad"><p className="eyebrow">{p.status==='ended'?'汇报已结束 · 可回放':'选择姓名开始练习'}</p><h2>{p.title}</h2><p>{p.theme}</p><p>规定时长 {formatTime(p.config.hardLimitSeconds)}{p.config.planningSeconds!==p.config.hardLimitSeconds&&' · 提前完成目标 '+formatTime(p.config.planningSeconds)}</p><div className="rh-name-grid">{p.members.filter(m=>m.enabled).map(m=><button aria-pressed={member===m.id} key={m.id} onClick={()=>{if(practicing&&member===m.id)return;if(practicing&&!confirm('切换姓名将离开未提交的练习。确定继续？'))return;setMember(m.id);setPracticing(false)}}><span>{m.name.slice(0,1)}</span>{m.name}</button>)}</div><button className="btn" disabled={!member||p.status!=='published'} onClick={()=>setPracticing(true)}>开始我的模拟汇报</button></section>
 {practicing&&data.estimate&&<Practice key={member+p.scriptVersion+p.deckVersion} project={p} memberId={member} estimate={data.estimate} recordings={data.recordings} progress={data.progress} onSubmitted={async()=>{await load()}}/>}
 <GroupPlayback project={p} recordings={data.recordings}/>{data.estimate&&<EstimatePanel project={p} estimate={data.estimate} recordings={data.recordings}/>}
 <ReadingPreview project={p}/><PresentationDownload project={p}/><AlgorithmNotes config={p.config} updatedAt={p.updatedAt}/></>}</>}
 </div>;
}
