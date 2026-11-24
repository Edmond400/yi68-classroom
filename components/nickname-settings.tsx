'use client';
import { useEffect,useState } from 'react';
import type { Student } from '@/lib/accounts';
import { api } from '@/lib/client';
import { nicknameIssue,nicknameLength } from '@/lib/nickname-rules';
import { clearStudentSession } from '@/lib/student-session';
import { AccountAccess,AccountControls } from './account-forms';
type Nickname={name:string;nickname:string;display_name:string};
export function NicknameSettings({initialStudent=null}:{initialStudent?:Student|null}){
 const [student,setStudent]=useState(initialStudent),[settings,setSettings]=useState<Nickname|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function load(current:Student){setStudent(current);setSettings(null);setLoading(true);setError('');try{setSettings(await api('/api/nickname'))}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 useEffect(()=>{let live=true;void (async()=>{try{
  const current=(await api('/api/account')).student;
  if(!live)return;setStudent(current);if(!current){clearStudentSession();return}
  const result=await api('/api/nickname');if(live)setSettings(result);
 }catch(e){if(live)setError((e as Error).message)}finally{if(live)setLoading(false)}})();return()=>{live=false}},[]);
 return <section className="panel nickname-panel" aria-labelledby="nickname-heading"><div className="nickname-intro"><p className="eyebrow">A NAME TO REMEMBER</p><h2 id="nickname-heading">我的转盘昵称</h2><p className="muted">你可以设置显示在欢乐大转盘上的昵称，代替自己的姓名。没有昵称时直接显示姓名。</p></div>
  {error&&<p className="callout error" role="alert">{error}</p>}
  {loading?<p role="status">正在读取昵称设置…</p>:student?<>
   <AccountControls name={student.name} onSignedOut={()=>{setStudent(null);setSettings(null);setError('')}}/>
   {settings?<NicknameEditor key={student.id} initialSettings={settings}/>:<button className="btn secondary" onClick={()=>{void load(student)}}>重试读取昵称</button>}
  </>:<details className="nickname-login"><summary className="text-link">登录后设置昵称</summary><p className="small muted">使用自己的班级账号登录，也可以继续直接查看公开开奖。</p><AccountAccess onLogin={current=>{void load(current)}}/></details>}
 </section>;
}
export function NicknameEditor({initialSettings}:{initialSettings:Nickname}){
 const [settings,setSettings]=useState(initialSettings),[value,setValue]=useState(initialSettings.nickname),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function save(nickname:string){if(busy)return;setError('');setMessage('');if(nickname){const issue=nicknameIssue(nickname.normalize('NFC'));if(issue){setError(issue);return}}
  setBusy(true);try{const saved=await api('/api/nickname',{nickname});setSettings(saved);setValue(saved.nickname);setMessage(nickname?'昵称已保存，将用于之后的开奖。':'已恢复实名，将在之后的开奖中显示姓名。')}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <form className="nickname-form" onSubmit={e=>{e.preventDefault();void save(value)}}><p className="nickname-current">当前转盘显示：<strong>{settings.display_name}</strong></p><label htmlFor="turntable-nickname">昵称</label><div className="nickname-input-row"><input id="turntable-nickname" name="nickname" required maxLength={512} autoComplete="off" aria-describedby="nickname-hint nickname-count" value={value} disabled={busy} onChange={e=>setValue(e.target.value)} placeholder="给自己起个好记的名字"/><span id="nickname-count" className="small muted">{nicknameLength(value)} / 12</span></div><p id="nickname-hint" className="small muted">1—12个字或表情，不含空格，不与其他同学的姓名或昵称重复。</p><p className="small muted">月奖和学期奖通用，随时可以修改。已开奖的期次保留当时的名字；礼品卡获奖名单显示实名和昵称。</p>
  {error&&<p className="callout error" role="alert">{error}</p>}{message&&<p className="callout" role="status">{message}</p>}<div className="form-actions"><button className="btn" disabled={busy||!value}>{busy?'正在保存…':'保存昵称'}</button><button className="btn secondary" type="button" disabled={busy||!settings.nickname} onClick={()=>{void save('')}}>恢复实名</button></div>
 </form>;
}
