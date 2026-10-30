"use client";
import { useRef,useState } from 'react';
import { CheckCircle2,Send } from 'lucide-react';
import { daysInBirthdayMonth,participationLabels,type Participation } from '@/lib/birthday-model';
import { api } from '@/lib/client';
function requestId(){
 if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function BirthdayForm(){
 const [name,setName]=useState(''),[month,setMonth]=useState(''),[day,setDay]=useState(''),[participation,setParticipation]=useState<Participation|''>('');
 const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
 const sending=useRef(false),key=useRef<string|null>(null),submitted=useRef<string|null>(null);
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(sending.current)return;setError('');
  if(!name.trim()||!month||!day||!participation){setError('请完整填写姓名、生日和参与意愿。');return}
  if(Number(day)>daysInBirthdayMonth(Number(month))){setError('请填写有效的公历生日。');return}
  const signature=JSON.stringify([name.trim(),month,day,participation]);
  try{if(submitted.current!==signature){key.current=requestId();submitted.current=signature}}catch{setError('当前浏览器无法生成提交标识，请使用更新的浏览器。');return}
  sending.current=true;setBusy(true);
  try{await api('/api/survey/birthday',{name:name.trim(),month:Number(month),day:Number(day),participation,request_key:key.current});setDone(true)}catch(e){setError((e as Error).message)}finally{sending.current=false;setBusy(false)}
 }
 if(done)return <section className="panel birthday-success" aria-live="polite"><CheckCircle2 size={44}/><h2>提交成功，感谢填写！</h2><p>你的登记信息已保存。</p><a className="btn secondary" href="/">返回班级服务站</a></section>;
 return <form className="panel birthday-form" onSubmit={submit} aria-busy={busy}>
  <fieldset disabled={busy}>
   <label className="survey-field" htmlFor="birthday-name"><span>姓名 <small>必填</small></span><input id="birthday-name" autoComplete="name" placeholder="请输入真实姓名" required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label>
   <div className="survey-field"><span id="birthday-date-label">生日 <small>必填</small></span><p className="field-hint">请填写公历生日，只需月、日。</p><div className="birthday-date" role="group" aria-labelledby="birthday-date-label"><select aria-label="生日月份" required value={month} onChange={e=>{setMonth(e.target.value);if(Number(day)>daysInBirthdayMonth(Number(e.target.value)))setDay('')}}><option value="">选择月份</option>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}月</option>)}</select><select aria-label="生日日期" required value={day} onChange={e=>setDay(e.target.value)}><option value="">选择日期</option>{Array.from({length:month?daysInBirthdayMonth(Number(month)):31},(_,i)=><option key={i+1} value={i+1}>{i+1}日</option>)}</select></div></div>
   <fieldset className="survey-field birthday-options"><legend>是否想参加本学期集体生日 <small>必填</small></legend>{Object.entries(participationLabels).map(([value,label])=><label className={'birthday-option '+(participation===value?'chosen':'')} key={value}><input required type="radio" name="participation" value={value} checked={participation===value} onChange={()=>setParticipation(value as Participation)}/><span>{label}</span></label>)}</fieldset>
   {error&&<p className="callout error" role="alert">{error}</p>}
   <button className="btn birthday-submit" type="submit" disabled={busy}><Send size={17}/>{busy?'正在保存…':'提交登记'}</button>
  </fieldset>
 </form>;
}
