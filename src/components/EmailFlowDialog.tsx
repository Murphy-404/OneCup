import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, KeyRound, Mail, ShieldCheck, X } from 'lucide-react';
import { apiRequest, type AuthenticatedSession } from '../api';
import { Modal } from './Modal';
export interface EmailFlow { kind: 'pending' | 'verify' | 'forgot' | 'reset'; token?: string; email?: string; previewUrl?: string }
interface Props {
  flow: EmailFlow; onChange: (flow: EmailFlow) => void; onClose: () => void;
  onVerified: (session: AuthenticatedSession) => void; onReset: () => void;
}
export function EmailFlowDialog({ flow, onChange, onClose, onVerified, onReset }: Props) {
  const [email, setEmail] = useState(flow.email ?? ''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(flow.previewUrl);
  useEffect(() => { setError(''); setMessage(''); setPreview(flow.previewUrl); }, [flow.kind, flow.previewUrl]);
  const title = { pending: '验证邮箱，完成注册。', verify: '确认这是你的邮箱。', forgot: '找回你的饮品日常。', reset: '设置一个新密码。' }[flow.kind];
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setMessage('');
    if (flow.kind === 'reset' && password !== confirm) { setError('两次输入的密码不一致。'); return; }
    setBusy(true);
    try {
      if (flow.kind === 'verify') {
        onVerified(await apiRequest<AuthenticatedSession>('/auth/verify-email', 'POST', { token: flow.token })); return;
      }
      if (flow.kind === 'reset') { await apiRequest('/auth/reset-password', 'POST', { token: flow.token, password }); onReset(); return; }
      const result = await apiRequest<{ message: string; previewUrl?: string }>(flow.kind === 'forgot' ? '/auth/forgot-password' : '/auth/resend-verification', 'POST', { email });
      setMessage(result.message); setPreview(result.previewUrl);
    } catch (error) { setError(error instanceof Error ? error.message : '操作失败，请重试。'); }
    finally { setBusy(false); }
  }
  function openPreview() {
    if (!preview) return;
    const hash = new URLSearchParams(new URL(preview).hash.slice(1));
    const token = hash.get('verify') ?? hash.get('reset');
    if (token) onChange({ kind: hash.has('verify') ? 'verify' : 'reset', token });
  }
  return <Modal label="邮箱验证与密码找回" className="account-modal" onClose={() => { if (!busy) onClose(); }}>
    <div className="dialog-top"><span className="account-dialog-label"><Mail size={18}/>账号邮件</span><button className="icon-button" disabled={busy} aria-label="关闭邮件面板" onClick={onClose}><X size={20}/></button></div>
    <div className="account-content email-flow"><div className="email-flow-icon">{flow.kind === 'reset' ? <KeyRound size={25}/> : <ShieldCheck size={25}/>}</div><h2>{title}</h2>
      <p className="account-subtitle">{flow.kind === 'pending' ? `请打开${flow.email ? ` ${flow.email} ` : ''}收到的验证邮件。邮箱验证完成后才能登录。` : flow.kind === 'verify' ? '点击下方按钮完成验证，并登录你的一杯账号。' : flow.kind === 'forgot' ? '输入注册邮箱，我们会向符合条件的账号发送重设链接。' : '重设成功后，所有设备上的旧登录都会退出。'}</p>
      <form className="account-form" onSubmit={submit}>
        {['pending', 'forgot'].includes(flow.kind) && <label>邮箱<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/></label>}
        {flow.kind === 'reset' && <><label>新密码<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 12 个字符"/></label><label>确认新密码<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></label></>}
        {error && <p role="alert" className="form-error">{error}</p>}
        {message && <p role="status" className="email-result">{message}</p>}
        <button type="submit" className="primary-button auth-submit" disabled={busy}>{busy ? '正在处理…' : { pending: '重新发送验证邮件', verify: '确认验证邮箱', forgot: '发送重设链接', reset: '保存新密码' }[flow.kind]}<ArrowRight size={17}/></button>
      </form>
      {preview && <div className="local-mail-preview"><strong>本地邮件预览</strong><p>开发环境没有实际发送邮件。此入口仅用于本机测试，生产环境不会返回邮件链接。</p><a href={preview} onClick={e => { e.preventDefault(); openPreview(); }}>打开邮件中的操作链接<ArrowRight size={14}/></a></div>}
      {flow.kind === 'pending' && <p className="form-help">验证链接有效期 24 小时。若未收到，请检查垃圾邮件或重新发送。</p>}
      {flow.kind === 'forgot' && <p className="form-help">密码重设链接有效期 30 分钟，只能使用一次。</p>}
    </div>
  </Modal>;
}
