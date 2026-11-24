'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, KeyRound } from 'lucide-react';
import { api } from '@/lib/client';
import type { Student } from '@/lib/accounts';
import { clearStudentSession, saveStudentSession } from '@/lib/student-session';
import { Field } from './forms';

export function AccountAccess({ onLogin, initialError = '' }: { onLogin: (student:Student)=>void; initialError?: string }) {
  const [flow,setFlow]=useState<{name:string;mode:'login'|'register'}|null>(null);
  const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(initialError);
  const [showReset, setShowReset] = useState(false);
  const [message, setMessage] = useState('');
  async function identify(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
    try{
      const result=await api('/api/account',{action:'identify',name:name.trim()});
      if(result.mode!=='login'&&result.mode!=='register')throw new Error('账号状态有误，请稍后重试。');
      setFlow({name:name.trim(),mode:result.mode});
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <>
    {message && <p className="callout form-status" role="status">{message}</p>}
    {error && <p className="callout error form-status" role="alert">{error}</p>}
    {!flow ? <form onSubmit={identify}><Field label="姓名"><input required name="name" minLength={2} maxLength={50} autoComplete="username" value={name} onChange={e=>setName(e.target.value)} placeholder="请输入班级名册中的姓名"/></Field><div className="form-actions"><button className="btn" disabled={busy}>{busy?'正在确认账号…':'下一步'}</button></div></form> : <>
      <p className="form-status"><strong>{flow.name}</strong>{showReset?'，重新设置账号密码。':flow.mode==='login'?'，您的账号已激活，请输入密码登录。':'，您的账号尚未激活，请输入激活码并设置密码。'}</p>
      {showReset ? <><p className="small muted">请联系班长核实身份并获取一次性重置码，重置码30分钟内有效。</p><PasswordForm mode="reset" onDone={() => { clearStudentSession();setShowReset(false);setError('');setMessage('密码已重置，请使用新密码登录。'); }}/><p className="small"><a className="text-link" href="#login" onClick={e=>{e.preventDefault();setShowReset(false)}}>返回密码登录</a></p></> : <CredentialForm mode={flow.mode} name={flow.name} onLogin={onLogin} onForgot={()=>{setError('');setMessage('');setShowReset(true)}}/>}
      <button className="text-link small" type="button" onClick={()=>{setFlow(null);setShowReset(false);setError('');setMessage('')}}>更换姓名</button>
    </>}
  </>;
}
function PasswordInput({ value, onChange, label, current = false, name }: { value: string; onChange: (v: string) => void; label: string; current?: boolean; name?: string }) {
  const [visible, setVisible] = useState(false);
  return <Field label={label} hint={current ? undefined : '4–128位，可使用中文、字母、数字和符号。'}><div className="password-input"><input required name={name} type={visible ? 'text' : 'password'} minLength={4} maxLength={128} autoComplete={current ? 'current-password' : 'new-password'} value={value} onChange={e => onChange(e.target.value)}/><button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? '隐藏密码' : '显示密码'}>{visible ? '隐藏' : '显示'}</button></div></Field>;
}
function CredentialForm({ mode, name, onLogin, onForgot }: { mode: 'login' | 'register'; name: string; onLogin: (student:Student)=>void; onForgot:()=>void }) {
  const [password,setPassword]=useState(''),[activationCode,setActivationCode]=useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <form onSubmit={async e => {
    e.preventDefault();if (busy) return;setError('');
    if (mode === 'register' && !window.confirm('请确认你已记住刚设置的密码。是否使用这个密码激活账号并登录？')) return;
    setBusy(true);
    try {
      const result=await api('/api/account',{action:mode,name,password,...(mode==='register'?{activation_code:activationCode.trim()}:{})});
      if(result.session_token)saveStudentSession(result.session_token);
      const verified=await api('/api/account');
      if(!verified.student){clearStudentSession();throw new Error('未能建立登录会话，请重新登录。');}
      onLogin(verified.student);
    } catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }}>
    <input type="hidden" name="name" value={name} autoComplete="username"/>
    {mode==='register' && <Field label="本人一次性激活码"><input required name="activation_code" autoComplete="off" maxLength={64} value={activationCode} onChange={e=>setActivationCode(e.target.value)} placeholder="私下向班长领取"/></Field>}
    <PasswordInput name="password" label={mode==='login'?'密码':'设置密码'} value={password} onChange={setPassword} current={mode==='login'}/>
    {mode==='login' && <p className="small"><a className="text-link" href="#forgot-password" onClick={e=>{e.preventDefault();onForgot()}}>忘记密码？</a></p>}
    {error && <p className="callout error form-status" role="alert">{error}</p>}
    <div className="form-actions"><button className="btn" type="submit" disabled={busy}>{busy ? '正在验证…' : mode==='login'?'登录':'激活并登录'}</button></div>
  </form>;
}
function PasswordForm({ mode, onDone }: { mode: 'change' | 'reset'; onDone: () => void }) {
  const [credential, setCredential] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <form onSubmit={async e => {
    e.preventDefault(); if (busy) return; setError('');
    if (password !== confirm) { setError('两次输入的密码不一致。'); return; }
    setBusy(true);
    try { await api('/api/account', { action: mode, password, ...(mode === 'reset' ? { token: credential.trim() } : { current_password: credential }) }); onDone(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>
    {mode === 'change' ? <PasswordInput label="当前密码" current value={credential} onChange={setCredential}/> : <Field label="一次性重置码"><input required maxLength={64} autoComplete="off" value={credential} onChange={e => setCredential(e.target.value)} placeholder="粘贴班长发来的重置码"/></Field>}
    <PasswordInput label="新密码" value={password} onChange={setPassword}/>
    <Field label="确认新密码"><input required type="password" minLength={4} maxLength={128} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></Field>
    {error && <p className="callout error form-status" role="alert">{error}</p>}
    <div className="form-actions"><button type="submit" disabled={busy} className="btn">{busy ? '正在更新…' : '更新密码并重新登录'}</button></div>
  </form>;
}
export function AccountControls({ name, onSignedOut }: { name: string; onSignedOut:()=>void }) {
  const [change, setChange] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <div className="account-controls"><div className="account-controls-row"><span>已登录：<strong>{name}</strong></span><div><button type="button" className="text-link" onClick={() => setChange(v => !v)}><KeyRound size={15}/>修改密码</button><button type="button" className="text-link" disabled={busy} onClick={async () => { setBusy(true); try { await api('/api/account', { action: 'logout' }); clearStudentSession();onSignedOut(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><LogOut size={15}/>退出</button></div></div>
    {error && <p className="callout error form-status" role="alert">{error}</p>}
    {change && <PasswordForm mode="change" onDone={() => {clearStudentSession();onSignedOut()}}/>}
  </div>;
}
export function AdminClaim() {
  const [token, setToken] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false); const router = useRouter();
  return <details className="admin-claim"><summary>班长首次初始化管理权限</summary><p className="small muted">使用部署时设置的管理员初始化码。该入口只对指定的班长学号生效。</p><form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await api('/api/account', { action: 'claim_admin', token }); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><Field label="管理员初始化码"><input type="password" required minLength={20} maxLength={200} autoComplete="off" value={token} onChange={e => setToken(e.target.value)}/></Field>{error && <p className="callout error form-status" role="alert">{error}</p>}<button className="btn" disabled={busy}>初始化管理权限</button></form></details>;
}
