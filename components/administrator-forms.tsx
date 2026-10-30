"use client";
import { useState } from 'react';
import { api } from '@/lib/client';
export function AdministratorAccess({configured}:{configured:boolean}){
 const [username,setUsername]=useState('admin'),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setError('');if(!configured&&password!==confirm){setError('两次输入的密码不一致。');return}setBusy(true);try{await api('/api/admin/auth',configured?{action:'login',username,password}:{action:'setup',code:code.trim(),password});window.location.assign('/admin/surveys/birthday')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <form onSubmit={submit} className="admin-access-form"><fieldset disabled={busy}>
  {configured?<label className="survey-field">用户名<input required autoComplete="username" maxLength={40} value={username} onChange={e=>setUsername(e.target.value)}/></label>:<><p className="field-hint">首次使用请填写班长收到的私密初始化码，并设置自己的管理员密码。用户名为 admin。</p><label className="survey-field">一次性初始化码<input required autoComplete="off" type="password" minLength={20} maxLength={200} value={code} onChange={e=>setCode(e.target.value)}/></label></>}
  <label className="survey-field">{configured?'密码':'设置密码（至少12位）'}<input required type="password" minLength={configured?1:12} maxLength={128} autoComplete={configured?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
  {!configured&&<label className="survey-field">再次输入密码<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
  {error&&<p className="callout error" role="alert">{error}</p>}<button className="btn" disabled={busy}>{busy?'正在处理…':configured?'登录管理后台':'设置密码并进入后台'}</button>
 </fieldset></form>;
}
export function AdministratorBar(){
 const [open,setOpen]=useState(false),[current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function logout(){setError('');setBusy(true);try{await api('/api/admin/auth',{action:'logout'});window.location.assign('/admin/login')}catch(e){setError((e as Error).message);setBusy(false)}}
 async function change(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setError('');if(password!==confirm){setError('两次输入的密码不一致。');return}setBusy(true);try{await api('/api/admin/auth',{action:'change_password',current_password:current,password});window.location.assign('/admin/login?changed=1')}catch(e){setError((e as Error).message);setBusy(false)}}
 return <div className="administrator-bar"><div className="administrator-links"><span>管理员 admin</span><a href="/admin/surveys/birthday">生日问卷结果</a><a href="/admin">班务管理</a><a href="/admin/incentives">活动参与管理</a><button type="button" onClick={()=>setOpen(!open)}>修改密码</button><button type="button" disabled={busy} onClick={logout}>退出登录</button></div>{open&&<form className="password-change-form" onSubmit={change}><label>当前密码<input required type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)}/></label><label>新密码<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>再次输入新密码<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button className="btn" disabled={busy}>保存密码并重新登录</button></form>}{error&&<p role="alert" className="callout error">{error}</p>}</div>;
}
