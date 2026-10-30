'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Confirm, type AdminData } from './admin-console';
import { Blank, Badge } from './public-ui';
import { api } from '@/lib/client';
import { timeLabel } from '@/lib/model';
export function AccountManager({ data, refresh }: { data: AdminData; refresh: () => Promise<AdminData> }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState('');
  const [reset, setReset] = useState<{ name: string; token: string; expiresAt: number } | null>(null);
  async function enable(studentId: string, enabled: boolean) {
    setBusy(studentId); setError('');
    try { await api('/api/admin', { entity: 'account', value: { student_id: studentId, enabled } }); await refresh(); toast.success(enabled ? '账号已启用' : '账号已停用，登录状态已撤销'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  return <><p className="callout" style={{ marginBottom: 20 }}>学生首次激活还需要班长私发的一次性激活码，请在“活动参与管理”的名册中生成。此处可停用账号；忘记密码时，请先核实本人身份，再生成一次性重置码并私下交给本人。</p>
    {error && <p className="callout error form-status" role="alert">{error}</p>}
    {reset && <section className="panel reset-result" aria-live="polite"><h3>{reset.name}的一次性重置码</h3><p className="small muted">到期时间：{timeLabel(new Date(reset.expiresAt).toISOString())}。使用后即失效。</p><code>{reset.token}</code><button className="btn secondary small-btn" onClick={async () => { try { await navigator.clipboard.writeText(reset.token); toast.success('重置码已复制'); } catch { toast.error('请手动选中并复制重置码'); } }}>复制重置码</button><button className="text-link" onClick={() => setReset(null)}>关闭</button></section>}
    <section className="panel">{data.accounts.length ? data.accounts.map(m => <article className="member-card" key={m.student_id}><div className="member-card-head"><h3>{m.name}</h3><Badge label={!m.enabled ? '已停用' : m.id ? '已注册' : '未注册'}/></div><p className="small muted">学号：{m.student_id}{m.role === 'admin' ? ' · 班长账号' : ''}</p>{m.created_at && <p className="small muted">注册于 {timeLabel(m.created_at)}</p>}<div className="form-actions">{m.role !== 'admin' && (m.enabled ? <Confirm label="停用账号" title={'停用' + m.name + '的账号？'} description="将立即退出此账号的所有登录设备，并关闭注册和反馈资格。已有反馈会保留。" onConfirm={() => enable(m.student_id, false)}/> : <button className="btn secondary small-btn" disabled={busy === m.student_id} onClick={() => enable(m.student_id, true)}>重新启用</button>)}{m.id && !!m.enabled && <Confirm label="生成密码重置码" title={'为' + m.name + '重置密码？'} description="请先核实请求来自本人。生成的新码会替代旧重置码，请私下交给本人；此操作不会显示原密码。" onConfirm={async () => { setError(''); try { const result = await api('/api/admin', { entity: 'reset_account', value: { id: m.id } }); setReset({ name: m.name, token: result.token, expiresAt: result.expiresAt }); } catch (e) { setError((e as Error).message); } }}/>}</div></article>) : <Blank title="名册尚未配置" description="请先导入班级姓名与学号对应表。"/>}</section></>;
}
