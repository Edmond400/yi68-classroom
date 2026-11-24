import {database} from '../data';
import {requireAdministrator,rateLimit} from '../administrator';
import {HttpError,json,readBytes,sameOrigin} from '../http';
import {type Project,type Recording,DEFAULT_CONFIG,ALGORITHM_VERSION,MAX_AUDIO_BYTES,MAX_PAGE_BYTES,turnsFor} from './model';
import {estimateProject,validateProject} from './algorithm';
import {buildTimeline,validateEvents} from './timeline';
import {projectSchema,recordingSchema,reviewSchema,uniqueIds} from './validation';
import {sha256,detectMime,fileStatements,capacityGuard,getFile,serveFile} from './storage';
import {z} from 'zod';
import {requestProject,requireRehearsal,listProjects,enterRehearsal,manageProject} from './access';
import {digest} from '../passwords';
import {inspectPptx} from './pptx';
export async function getProject(projectId='current',published=false):Promise<Project|null>{const row=await database().prepare('SELECT document_json,published_json FROM rehearsal_projects WHERE id=? AND deleted_at IS NULL').bind(projectId).first<any>();const doc=published?row?.published_json:row?.document_json;return doc?JSON.parse(doc):null}
function isVisible(p:Project){return p.status!=='draft'&&(!p.publishedAt||Date.parse(p.publishedAt)<=Date.now())}
async function publicProject(projectId:string){const p=await getProject(projectId,true);if(!p||!isVisible(p))throw new HttpError(404,'汇报尚未发布，可进入编排工作台准备材料。');return p}
export async function recordings(projectId='current'):Promise<Recording[]>{const result=await database().prepare("SELECT r.*,f.mime,f.bytes,f.hash FROM rehearsal_recordings r JOIN rehearsal_files f ON f.id=r.id WHERE r.project_id=? AND r.status='ready' ORDER BY r.submitted_at DESC,r.id DESC").bind(projectId).all<Record<string,any>>();return result.results.map(row=>({id:row.id,memberId:row.member_id,turnId:row.turn_id,scriptVersion:row.script_version,deckVersion:row.deck_version,algorithmVersion:row.algorithm_version,mime:row.mime,bytes:row.bytes,hash:row.hash,durationMs:row.duration_ms,submittedAt:row.submitted_at,locked:!!row.locked,complete:!!row.complete,predictedSeconds:row.predicted_seconds,events:JSON.parse(row.events_json),metadata:JSON.parse(row.metadata_json),slides:JSON.parse(row.snapshot_json).slides}))}
export async function turnProgress(projectId='current'){const r=await database().prepare('SELECT member_id AS memberId,turn_id AS turnId,script_version AS scriptVersion,deck_version AS deckVersion,submitted_at AS submittedAt FROM rehearsal_turn_progress WHERE project_id=? ORDER BY submitted_at DESC').bind(projectId).all();return r.results}
async function payload(request:Request){sameOrigin(request);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'请提交JSON');try{return JSON.parse(new TextDecoder().decode(await readBytes(request,450000)))}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'JSON格式无效')}}
function guard(sql:string,...values:(string|number)[]){return database().prepare('INSERT INTO rehearsal_write_guards(id,allowed) SELECT ?,CASE WHEN '+sql+' THEN 1 ELSE 0 END').bind(crypto.randomUUID(),...values)}
function accessGuard(request:Request,projectId:string){
 const token=request.headers.get('X-Yi68-Rehearsal-Token');
 return token?guard('EXISTS(SELECT 1 FROM rehearsal_access_sessions s JOIN rehearsal_projects p ON p.id=s.project_id AND p.credential_version=s.credential_version WHERE s.token_hash=? AND s.project_id=? AND s.expires_at>? AND p.deleted_at IS NULL)',digest(token),projectId,Date.now()):guard('EXISTS(SELECT 1 FROM rehearsal_projects WHERE id=? AND deleted_at IS NULL)',projectId);
}
export async function saveProject(request:Request,projectId='current'){
 const input=projectSchema.parse(await payload(request));
 if(!uniqueIds(input.members)||!uniqueIds(input.blocks)||!uniqueIds(input.slides))throw new HttpError(400,'成员、片段、PPT的ID不得重复');
 if(input.blocks.reduce((s,b)=>s+b.text.length+(b.spokenText?.length||0),0)>80000)throw new HttpError(413,'讲稿总长度超过80000字符');
 if(new Set(input.members.map(m=>m.name)).size!==input.members.length)throw new HttpError(400,'同名成员请添加区分备注');
 const old=await getProject(projectId);if(!old)throw new HttpError(404,'汇报不存在或已删除。');if((old?.revision??0)!==input.revision)throw new HttpError(409,'项目已被其他窗口修改，请刷新后重试。');
 if(input.sourceDeck&&!await database().prepare("SELECT id FROM rehearsal_files WHERE id=? AND project_id=? AND kind='pptx' AND bytes=?").bind(input.sourceDeck.id,projectId,input.sourceDeck.bytes).first())throw new HttpError(400,'原始PPTX不属于此汇报。');
 if(await database().prepare('SELECT id FROM rehearsal_members WHERE project_id!=? AND id IN (SELECT value FROM json_each(?)) LIMIT 1').bind(projectId,JSON.stringify(input.members.map(m=>m.id))).first())throw new HttpError(400,'成员标识已用于其他汇报，请重新添加成员。');
 const memberIds=new Set(input.members.map(m=>m.id));if(input.blocks.some(b=>b.memberId&&!memberIds.has(b.memberId)))throw new HttpError(400,'片段引用了无效成员');
 const availableSlides=await database().prepare("SELECT id,bytes,mime FROM rehearsal_files WHERE project_id=? AND kind='slide'").bind(projectId).all<{id:string;bytes:number;mime:string}>();
 for(const [i,s] of input.slides.entries()){const f=availableSlides.results.find(f=>f.id===s.id);if(!f||f.bytes!==s.bytes||f.mime!==s.mime||s.pageIndex!==i)throw new HttpError(400,'PPT资源或页序无效，请重新上传。')}
 if(input.config.planningSeconds>input.config.hardLimitSeconds)throw new HttpError(400,'提前结束目标不能超过规定时长。');
 if(input.sourceDeck&&(input.slides.some(s=>s.sourcePage&&!input.sourceDeck!.pages.includes(s.sourcePage))||new Set(input.slides.map(s=>s.sourcePage).filter(Boolean)).size!==input.slides.filter(s=>s.sourcePage).length))throw new HttpError(400,'原始PPT页关联无效或重复，请逐页核对。');
 const revision=input.revision+1,now=new Date().toISOString();
 const scriptChanged=!old||JSON.stringify(input.blocks)!==JSON.stringify(old.blocks);
 const deckChanged=!old||JSON.stringify(input.slides)!==JSON.stringify(old.slides)||JSON.stringify(input.sourceDeck)!==JSON.stringify(old.sourceDeck);
 const configChanged=!old||JSON.stringify({...input.config,version:''})!==JSON.stringify({...old.config,version:''});
 const algo=configChanged?ALGORITHM_VERSION+'-r'+revision+'-'+crypto.randomUUID().slice(0,8):old!.algorithmVersion;
 const p:Project={...input,id:projectId,revision,scriptVersion:scriptChanged?crypto.randomUUID():old!.scriptVersion,deckVersion:deckChanged?crypto.randomUUID():old!.deckVersion,algorithmVersion:algo,config:{...input.config,version:algo},updatedAt:now};
 const turnIds=new Set(turnsFor(p).map(t=>t.id));if(Object.keys(p.overrides).some(x=>!turnIds.has(x)))throw new HttpError(400,'时间覆盖引用了已删除轮次，请清除该目标后保存。');
 const errors=validateProject(p);if(p.status==='published'&&errors.length)throw new HttpError(400,errors.join('；'));
 let estimate;try{estimate=estimateProject(p,await recordings(projectId))}catch(error){throw new HttpError(400,(error as Error).message)}const db=database(),doc=JSON.stringify(p);
 const ended= input.status==='ended'?await getProject(projectId,true):null;if(input.status==='ended'&&!ended)throw new HttpError(409,'此汇报尚未发布，无需结束收录。');const publishedDoc=JSON.stringify(ended?{...ended,status:'ended'}:p);
 const statements:D1PreparedStatement[]=[accessGuard(request,projectId),guard('EXISTS(SELECT 1 FROM rehearsal_projects WHERE id=? AND revision=? AND deleted_at IS NULL)',projectId,old?.revision??0),guard('NOT EXISTS(SELECT 1 FROM rehearsal_members WHERE project_id<>? AND id IN (SELECT value FROM json_each(?)))',projectId,JSON.stringify(input.members.map(m=>m.id))),guard("NOT EXISTS(SELECT value FROM json_each(?) AS wanted WHERE NOT EXISTS(SELECT 1 FROM rehearsal_files f WHERE f.id=wanted.value AND f.project_id=? AND f.kind='slide'))",JSON.stringify(input.slides.map(s=>s.id)),projectId),...(input.sourceDeck?[guard("EXISTS(SELECT 1 FROM rehearsal_files WHERE id=? AND project_id=? AND kind='pptx' AND bytes=?)",input.sourceDeck.id,projectId,input.sourceDeck.bytes)]:[]),db.prepare("UPDATE rehearsal_projects SET title=?,status=CASE WHEN ?='published' THEN 'published' WHEN ?='ended' THEN 'ended' WHEN published_json IS NOT NULL THEN status ELSE 'draft' END,revision=?,script_version=?,deck_version=?,algorithm_version=?,document_json=?,published_json=CASE WHEN ? IN ('published','ended') THEN ? ELSE published_json END,updated_at=? WHERE id=?").bind(p.title,p.status,p.status,p.revision,p.scriptVersion,p.deckVersion,p.algorithmVersion,doc,p.status,publishedDoc,now,projectId)];
 statements.push(db.prepare('INSERT INTO rehearsal_versions VALUES (?,?,?,?)').bind(projectId,p.revision,doc,now),db.prepare('UPDATE rehearsal_members SET enabled=0 WHERE project_id=?').bind(projectId));
 for(const m of p.members)statements.push(db.prepare('INSERT INTO rehearsal_members(id,project_id,display_name,enabled) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,enabled=excluded.enabled WHERE rehearsal_members.project_id=excluded.project_id').bind(m.id,projectId,m.name,Number(m.enabled)));
 statements.push(db.prepare('INSERT INTO rehearsal_estimates VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),projectId,revision,algo,JSON.stringify({config:p.config,estimate}),now));
 try{await db.batch(statements)}catch{throw new HttpError(409,'保存冲突，原版本已保留。请刷新后重试。')}
 return json({project:p,recordings:await recordings(projectId),estimate});
}
export async function submitRecording(request:Request,projectId='current'){
 sameOrigin(request);await rateLimit(request,'rehearsal-upload',30,900);
 let raw:unknown,bytes:Uint8Array,mimeClaim:string;
 if(request.headers.get('content-type')?.startsWith('multipart/form-data')){
  const body=await readBytes(request,MAX_AUDIO_BYTES+200000);let form:FormData;
  try{form=await new Response(body,{headers:{'Content-Type':request.headers.get('content-type')!}}).formData()}catch{throw new HttpError(400,'录音表单不完整，请重试')}
  const audio=form.get('audio'),metadata=form.get('metadata');if(!(audio instanceof File)||typeof metadata!=='string'||metadata.length>150000)throw new HttpError(400,'录音或元数据缺失');
  if(audio.size>MAX_AUDIO_BYTES)throw new HttpError(413,'单录音不能超过10MiB');bytes=new Uint8Array(await audio.arrayBuffer());mimeClaim=audio.type;try{raw=JSON.parse(metadata)}catch{throw new HttpError(400,'录音元数据格式无效')}
 }else{
  const metadata=request.headers.get('x-rehearsal-metadata');if(!metadata||metadata.length>16000)throw new HttpError(400,'录音元数据缺失或过大');
  try{raw=JSON.parse(decodeURIComponent(metadata))}catch{throw new HttpError(400,'录音元数据格式无效')}
  bytes=await readBytes(request,MAX_AUDIO_BYTES);mimeClaim=request.headers.get('content-type')||'';
 }
 const input=recordingSchema.parse(raw),db=database();
 if(!bytes.length)throw new HttpError(400,'录音为空');
 const mime=detectMime(bytes,'audio',mimeClaim);
 const hash=await sha256(bytes);if(hash!==input.hash)throw new HttpError(400,'录音校验摘要不符，请重新提交');
 if(bytes.length>MAX_AUDIO_BYTES)throw new HttpError(413,'录音超过容量上限');
 const requestHash=await sha256(new TextEncoder().encode(JSON.stringify({...input,events:input.events,mime})));
 const existing=await db.prepare('SELECT id,request_hash FROM rehearsal_recordings WHERE id=? AND project_id=?').bind(input.id,projectId).first<{id:string;request_hash:string}>();
 if(existing){if(existing.request_hash!==requestHash)throw new HttpError(409,'重试ID对应不同的录音');return json({ok:true,id:existing.id,retried:true})}
 let p=await publicProject(projectId);if(p.status!=='published')throw new HttpError(409,'本次汇报已结束，不再接收录音');
 if(input.scriptVersion!==p.scriptVersion||input.deckVersion!==p.deckVersion||input.algorithmVersion!==p.algorithmVersion){const snapshot=await db.prepare("SELECT document_json FROM rehearsal_versions WHERE project_id=? AND json_extract(document_json,'$.status')='published' AND json_extract(document_json,'$.scriptVersion')=? AND json_extract(document_json,'$.deckVersion')=? AND json_extract(document_json,'$.algorithmVersion')=? ORDER BY revision DESC LIMIT 1").bind(projectId,input.scriptVersion,input.deckVersion,input.algorithmVersion).first<any>();if(!snapshot)throw new HttpError(409,'稿件版本已更新，请刷新后练习。本地录音仍可下载保存。');p=JSON.parse(snapshot.document_json)}
 const turn=turnsFor(p).find(t=>t.id===input.turnId&&t.memberId===input.memberId);
 if(!turn||!p.members.some(m=>m.id===input.memberId&&m.enabled))throw new HttpError(400,'请选择当前有效成员及发言轮次');
 let duration=input.mediaDurationMs??input.clockDurationMs;
 if(input.durationMs!==Math.round(duration))throw new HttpError(400,'录音时长与媒体/计时信息不一致');
 duration=Math.round(duration);
 let events;try{events=validateEvents(input.events,duration,p.slides.length)}catch(error){throw new HttpError(400,(error as Error).message)}
 const locked=await db.prepare("SELECT count(*) AS n FROM rehearsal_recordings WHERE project_id=? AND member_id=? AND turn_id=? AND locked=1").bind(projectId,input.memberId,input.turnId).first<{n:number}>();if(locked!.n>=3)throw new HttpError(409,'最近3次录音均已被验收锁定，请联系管理员解锁后再提交。');
 const estimate=estimateProject(p,await recordings(projectId)),predicted=estimate.turns.find(t=>t.turnId===turn.id)!.initialSeconds,ts=new Date().toISOString();
 const statements=[accessGuard(request,projectId),guard('EXISTS(SELECT 1 FROM rehearsal_members WHERE id=? AND project_id=?)',input.memberId,projectId),guard("EXISTS(SELECT 1 FROM rehearsal_projects WHERE id=? AND status='published' AND deleted_at IS NULL)",projectId),capacityGuard(bytes.length),...fileStatements({id:input.id,project_id:projectId,kind:'audio',mime,bytes:bytes.length,hash},bytes),db.prepare('INSERT INTO rehearsal_recordings(id,project_id,member_id,turn_id,script_version,deck_version,algorithm_version,duration_ms,submitted_at,predicted_seconds,snapshot_json,events_json,metadata_json,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(input.id,projectId,input.memberId,turn.id,p.scriptVersion,p.deckVersion,p.algorithmVersion,duration,ts,predicted,JSON.stringify({config:p.config,blocks:p.blocks.filter(b=>turn.blockIds.includes(b.id)),slides:p.slides,estimate:estimate.turns.find(t=>t.turnId===turn.id)}),JSON.stringify(events),JSON.stringify({clockDurationMs:input.clockDurationMs,mediaDurationMs:input.mediaDurationMs,durationSource:input.mediaDurationMs===null?'浏览器有效计时（媒体未提供有限时长，待人工核对）':'浏览器媒体有效时长'}),requestHash)];
 try{await db.batch(statements)}catch{
  const retry=await db.prepare('SELECT request_hash FROM rehearsal_recordings WHERE id=? AND project_id=?').bind(input.id,projectId).first<{request_hash:string}>();if(retry?.request_hash===requestHash)return json({ok:true,id:input.id,retried:true});
  throw new HttpError(409,'保存未完成：可能已达容量/锁定上限或项目已更新。原录音记录已保留，本次可重试。');
 }
 return json({ok:true,id:input.id});
}
async function uploadSlide(request:Request,projectId:string){
 const p=await getProject(projectId);if(!p)throw new HttpError(409,'请先保存汇报基本信息，再上传PPT');
 const bytes=await readBytes(request,MAX_PAGE_BYTES);if(!bytes.length)throw new HttpError(400,'页面图片为空');const mime=detectMime(bytes,'slide',request.headers.get('content-type')||'');
 const file={id:crypto.randomUUID(),project_id:projectId,kind:'slide' as const,mime,bytes:bytes.length,hash:await sha256(bytes)};
 await database().batch([accessGuard(request,projectId),capacityGuard(bytes.length),...fileStatements(file,bytes)]);return json({id:file.id,mime,bytes:bytes.length});
}
async function reviewRecording(request:Request,projectId:string){const i=reviewSchema.parse(await payload(request));const db=database();if(!await db.prepare("SELECT id FROM rehearsal_recordings WHERE id=? AND project_id=?").bind(i.id,projectId).first())throw new HttpError(404,'录音不存在');const statement=i.action==='delete'?db.prepare('DELETE FROM rehearsal_recordings WHERE id=? AND project_id=?').bind(i.id,projectId):db.prepare('UPDATE rehearsal_recordings SET locked=COALESCE(?,locked),complete=COALESCE(?,complete) WHERE id=? AND project_id=?').bind(i.locked===undefined?null:Number(i.locked),i.complete===undefined?null:Number(i.complete),i.id,projectId);await db.batch([accessGuard(request,projectId),statement]);return json({ok:true})}
async function cleanup(request:Request,projectId:string){
 const p=await getProject(projectId);if(!p)return json({ok:true});
 const keep=new Set<string>();const remember=(doc:Project)=>{for(const s of doc.slides??[])keep.add(s.id);if(doc.sourceDeck)keep.add(doc.sourceDeck.id)};remember(p);const live=await getProject(projectId,true);if(live)remember(live);
 const versions=await database().prepare('SELECT document_json FROM rehearsal_versions WHERE project_id=?').bind(projectId).all<{document_json:string}>();for(const row of versions.results)remember(JSON.parse(row.document_json));
 const rows=await database().prepare('SELECT snapshot_json FROM rehearsal_recordings WHERE project_id=?').bind(projectId).all<{snapshot_json:string}>();for(const row of rows.results)remember(JSON.parse(row.snapshot_json));
 const files=await database().prepare("SELECT id FROM rehearsal_files WHERE kind IN ('slide','pptx') AND project_id=?").bind(projectId).all<{id:string}>();const remove=files.results.filter(f=>!keep.has(f.id));if(remove.length)await database().batch([accessGuard(request,projectId),guard('EXISTS(SELECT 1 FROM rehearsal_projects WHERE id=? AND revision=?)',projectId,p.revision),...remove.map(f=>database().prepare('DELETE FROM rehearsal_files WHERE id=? AND project_id=?').bind(f.id,projectId))]);return json({ok:true,removed:remove.length});
}
async function uploadDeck(request:Request,projectId:string){const bytes=await readBytes(request,20*1024*1024);let pages:string[];try{pages=inspectPptx(bytes)}catch(e){throw new HttpError(400,(e as Error).message)}const file={id:crypto.randomUUID(),project_id:projectId,kind:'pptx' as const,mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',bytes:bytes.length,hash:await sha256(bytes)};await database().batch([accessGuard(request,projectId),capacityGuard(bytes.length),...fileStatements(file,bytes)]);return json({id:file.id,pages,bytes:file.bytes})}
export async function handleRehearsal(request:Request,path:string[],admin=false):Promise<Response>{
 try{
  if(admin)await requireAdministrator(request);
  if(path.join('/')==='projects'){if(request.method==='GET')return json({projects:await listProjects(admin)});if(admin&&request.method==='POST')return await manageProject(request);throw new HttpError(405,'不支持此操作')}
  if(!admin&&request.method==='POST'&&path.join('/')==='access')return await enterRehearsal(request);
  const projectId=admin?(request.headers.get('X-Yi68-Rehearsal-Project')?requestProject(request):'current'):await requireRehearsal(request);
  const editing=admin||path[0]==='edit';if(!admin&&editing)path=path.slice(1);
  if(editing){
   if(request.method==='GET'&&['slides','audio','pptx'].includes(path[0])&&path.length===2){const f=await getFile(path[1],path[0]==='audio'?'audio':path[0]==='pptx'?'pptx':'slide',projectId);if(!f)throw new HttpError(404,'资源不存在');return await serveFile(request,f)}
   if(request.method==='GET'&&!path.length){const project=await getProject(projectId),rs=await recordings(projectId),usage=await database().prepare('SELECT COALESCE(sum(bytes),0) AS bytes FROM rehearsal_files WHERE project_id=?').bind(projectId).first();if(!project)throw new HttpError(404,'汇报不存在或已删除。');return json({project,recordings:rs,progress:await turnProgress(projectId),estimate:estimateProject(project,rs),usage})}
   if(request.method!=='POST')throw new HttpError(405,'不支持此操作');sameOrigin(request);
   switch(path.join('/')){case '':return await saveProject(request,projectId);case 'slides':return await uploadSlide(request,projectId);case 'pptx':return await uploadDeck(request,projectId);case 'recordings':return await reviewRecording(request,projectId);case 'cleanup':return await cleanup(request,projectId);default:throw new HttpError(404,'接口不存在')}
  }
  if(request.method==='POST'&&path.join('/')==='recordings')return await submitRecording(request,projectId);
  if(!['GET','HEAD'].includes(request.method))throw new HttpError(405,'不支持此操作');
  if(['audio','slides','pptx'].includes(path[0])&&path.length===2){const f=await getFile(path[1],path[0]==='audio'?'audio':path[0]==='pptx'?'pptx':'slide',projectId);if(!f)throw new HttpError(404,'资源不存在');return await serveFile(request,f)}
  const p=await getProject(projectId,true);
  if(!path.length){const visible=p&&isVisible(p)?p:null,rs=visible?await recordings(projectId):[];return json({project:visible,recordings:rs,progress:visible?await turnProgress(projectId):[],estimate:visible?estimateProject(visible,rs):null})}
  if(!p||!isVisible(p))throw new HttpError(404,'汇报尚未发布。');
  const rs=await recordings(projectId),estimate=estimateProject(p,rs);
  if(path[0]==='algorithm')return json({version:p.algorithmVersion,config:p.config});
  if(path[0]==='recordings')return json({recordings:rs});
  if(path[0]==='playback')return json(buildTimeline(p,rs));
  if(path[0]==='members'&&path.length===2){const member=p.members.find(m=>m.id===path[1]&&m.enabled);if(!member)throw new HttpError(404,'成员不存在');return json({member,blocks:p.blocks.filter(b=>b.memberId===member.id),turns:turnsFor(p).filter(t=>t.memberId===member.id),estimate:estimate.turns.filter(t=>t.memberId===member.id),recordings:rs.filter(r=>r.memberId===member.id)})}
  throw new HttpError(404,'接口不存在');
 }catch(error){if(error instanceof z.ZodError)return json({error:'提交字段无效：'+error.issues.map(i=>i.path.join('.')+': '+i.message).join('；')},400);if(error instanceof HttpError)return json({error:error.message},error.status);console.error('rehearsal-request-failed');return json({error:'排练服务暂不可用，内容已保留，请重试。'},500)}
}
