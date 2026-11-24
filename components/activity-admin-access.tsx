'use client';
import { useEffect,useState } from 'react';
import { api } from '@/lib/client';
const endpoint='/api/admin/activity-admins';
export function ActivityAdminAccess({onChanged}:{onChanged:()=>unknown}){
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){setData(await api(endpoint))}
 useEffect(()=>{refresh().catch(e=>setError(e.message))},[]);
 async function change(member:any,enabled:boolean){setBusy(true);setError('');setMessage('');try{await api(endpoint,{account_id:member.account_id,enabled,expected_version:member.version});await refresh();await onChanged();setMessage(member.name+(enabled?'已获得活动管理权限，可用原学生账号进入。':'的活动管理权限已撤销，学生功能保留。'))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <><section className="panel incentive-form"><h2>管理员授权</h2><p>主管理员：admin（受保护）</p><p className="small muted">勾选已激活、已启用的本班账号即可授权，取消勾选立即撤权。对方沿用学生密码，在“我的参与”中进入活动管理。</p><p className="small muted">普通管理员可建立活动、录入参与、审核他人申报和查看统计；本人记录须由其他管理员核实。</p></section>{error&&<p className="callout error" role="alert">{error}</p>}{message&&<p className="callout" role="status">{message}</p>}<section className="panel incentive-list">{data?data.members.map((m:any)=>{const eligible=m.enabled&&m.account_status==='active';return <article key={m.student_id}><label className="check-line"><input type="checkbox" checked={!!m.granted} disabled={busy||(!eligible&&!m.granted)} onChange={e=>{void change(m,e.target.checked)}}/>{m.name}<small>{!m.account_id?'尚未激活':!eligible?'账号已停用':m.granted?'活动管理员':'普通同学'}</small></label></article>}):<p role="status">正在读取候选名单…</p>}</section></>;
}
