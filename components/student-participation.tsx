'use client';
import { useEffect, useState } from 'react';
import type { Student } from '@/lib/accounts';
import { api } from '@/lib/client';
import { clearStudentSession, studentSession } from '@/lib/student-session';
import { AccountAccess, AccountControls } from './account-forms';
import { ParticipationView } from './participation-view';
import { IncentiveAdmin } from './incentive-admin';

export function StudentParticipation({initialStudent=null,initialError=''}:{initialStudent?:Student|null;initialError?:string}){
  const [student,setStudent]=useState(initialStudent),[loading,setLoading]=useState(true),[error,setError]=useState(initialError);
  const [managing,setManaging]=useState(false);
  useEffect(()=>{
    if(!studentSession()&&!initialStudent){setLoading(false);return;}
    let live=true;setLoading(true);
    api('/api/account').then(data=>{if(live){setStudent(data.student);if(!data.student)clearStudentSession()}}).catch(e=>{if(live){setStudent(null);setError((e as Error).message)}}).finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[]);
  if(loading)return <p className="callout" role="status">正在恢复你的登录状态…</p>;
  return student?<><AccountControls name={student.name} onSignedOut={()=>{setStudent(null);setManaging(false);setError('')}}/>{student.activity_admin&&<div className="form-actions"><button className="btn secondary" onClick={()=>setManaging(!managing)}>{managing?'返回我的参与记录':'进入活动管理'}</button></div>}{managing&&student.activity_admin?<IncentiveAdmin delegated/>:<ParticipationView key={student.id}/>}</>:<section className="panel form-panel narrow"><h2>登录自己的班级账号</h2><p className="small muted">输入姓名后，系统会自动带你进入登录或激活流程。生日登记和公开开奖无需登录。</p><AccountAccess initialError={error} onLogin={current=>{setError('');setStudent(current)}}/></section>;
}
