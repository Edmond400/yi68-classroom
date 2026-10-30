'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, KeyRound } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { api } from '@/lib/client';
import { Field } from './forms';

export function AccountAccess({ destination = '/participation' }: { destination?: string }) {
  const [tab, setTab] = useState('login');
  const [message, setMessage] = useState('');
  return <><Tabs value={tab} onValueChange={v => { setTab(v); setMessage(''); }}>
    <TabsList className="account-tabs"><TabsTrigger value="login">账号登录</TabsTrigger><TabsTrigger value="register">首次激活</TabsTrigger><TabsTrigger value="reset">找回密码</TabsTrigger></TabsList>
    {message && <p className="callout form-status" role="status">{message}</p>}
    <TabsContent value="login"><CredentialForm mode="login" destination={destination}/></TabsContent>
    <TabsContent value="register"><p className="small muted">请先向班长领取本人一次性激活码，填写名册中的姓名并设置密码即可，无需填写学号。</p><CredentialForm mode="register" destination={destination}/></TabsContent>
    <TabsContent value="reset"><p className="small muted">请联系班长核实身份并获取一次性重置码，重置码30分钟内有效。</p><PasswordForm mode="reset" onDone={() => { setTab('login'); setMessage('密码已重置，请使用新密码登录。'); }}/></TabsContent>
  </Tabs></>;
}
function PasswordInput({ value, onChange, label, current = false }: { value: string; onChange: (v: string) => void; label: string; current?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <Field label={label} hint={current ? undefined : '4–128位，可使用中文、字母、数字和符号。'}><div className="password-input"><input required type={visible ? 'text' : 'password'} minLength={4} maxLength={128} autoComplete={current ? 'current-password' : 'new-password'} value={value} onChange={e => onChange(e.target.value)}/><button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? '隐藏密码' : '显示密码'}>{visible ? '隐藏' : '显示'}</button></div></Field>;
}
function CredentialForm({ mode, destination }: { mode: 'login' | 'register'; destination: string }) {
  const [name, setName] = useState(''), [password, setPassword] = useState(''), [activationCode,setActivationCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const router = useRouter();
  return <form onSubmit={async e => {
    e.preventDefault(); if (busy) return; setError('');
    if (mode === 'register' && !window.confirm('请确认你已记住刚设置的密码。是否使用这个密码激活账号并登录？')) return;
    setBusy(true);
    try { await api('/api/account', { action: mode, name:name.trim(), password, ...(mode === 'register' ? { activation_code:activationCode.trim() } : {}) }); router.push(destination); router.refresh(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }}>
    <Field label="姓名"><input required minLength={2} maxLength={50} autoComplete={mode==='login'?'username':'name'} value={name} onChange={e=>setName(e.target.value)} placeholder="与班级名册一致"/></Field>
    {mode === 'register' && <Field label="本人一次性激活码"><input required autoComplete="off" maxLength={64} value={activationCode} onChange={e=>setActivationCode(e.target.value)} placeholder="私下向班长领取"/></Field>}
    <PasswordInput label={mode === 'login' ? '密码' : '设置密码'} value={password} onChange={setPassword} current={mode === 'login'}/>
    {error && <p className="callout error form-status" role="alert">{error}</p>}
    <div className="form-actions"><button className="btn" type="submit" disabled={busy}>{busy ? '正在验证…' : mode === 'login' ? '登录' : '激活并登录'}</button></div>
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
export function AccountControls({ name }: { name: string }) {
  const [change, setChange] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const router = useRouter();
  return <div className="account-controls"><div className="account-controls-row"><span>已登录：<strong>{name}</strong></span><div><button type="button" className="text-link" onClick={() => setChange(v => !v)}><KeyRound size={15}/>修改密码</button><button type="button" className="text-link" disabled={busy} onClick={async () => { setBusy(true); try { await api('/api/account', { action: 'logout' }); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><LogOut size={15}/>退出</button></div></div>
    {error && <p className="callout error form-status" role="alert">{error}</p>}
    {change && <PasswordForm mode="change" onDone={() => router.refresh()}/>}
  </div>;
}
export function AdminClaim() {
  const [token, setToken] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false); const router = useRouter();
  return <details className="admin-claim"><summary>班长首次初始化管理权限</summary><p className="small muted">使用部署时设置的管理员初始化码。该入口只对指定的班长学号生效。</p><form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await api('/api/account', { action: 'claim_admin', token }); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><Field label="管理员初始化码"><input type="password" required minLength={20} maxLength={200} autoComplete="off" value={token} onChange={e => setToken(e.target.value)}/></Field>{error && <p className="callout error form-status" role="alert">{error}</p>}<button className="btn" disabled={busy}>初始化管理权限</button></form></details>;
}
