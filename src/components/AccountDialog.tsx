import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, Cloud, Eye, EyeOff, LogOut, ShieldCheck, UserRound, X } from 'lucide-react';
import { apiRequest, type AccountUser, type AuthenticatedSession } from '../api';
import { Modal } from './Modal';
import type { EmailFlow } from './EmailFlowDialog';

interface Props {
  user: AccountUser | null; ready: boolean; authError: string; syncMessage: string; guestCount: number;
  onAuthenticated: (session: AuthenticatedSession) => void; onUserUpdated: (user: AccountUser) => void;
  onLogout: () => Promise<boolean>; onDeleted: () => void; onMergeGuest: () => boolean;
  onExport: () => void; onClose: () => void; notify: (message: string) => void;
  emailEnabled: boolean; onEmailFlow: (flow: EmailFlow) => void;
  plaintextPasswordTest: boolean;
}
export function AccountDialog(props: Props) {
  const [view, setView] = useState<'login' | 'register' | 'account'>(props.user ? 'account' : 'login');
  const [email, setEmail] = useState(props.user?.email ?? '');
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [name, setName] = useState(props.user?.name ?? ''); const [currentPassword, setCurrentPassword] = useState('');
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [section, setSection] = useState<'profile' | 'password' | 'delete'>('profile');
  function switchView(next: typeof view) { setView(next); setError(''); setPassword(''); setConfirm(''); }
  async function act(task: () => Promise<void>) {
    setBusy(true); setError('');
    try { await task(); } catch (error) { setError(error instanceof Error ? error.message : '操作失败，请重试。'); }
    finally { setBusy(false); }
  }
  async function authenticate(e: FormEvent) {
    e.preventDefault();
    if (view === 'register' && password !== confirm) { setError('两次输入的密码不一致。'); return; }
    await act(async () => {
      const result = await apiRequest<AuthenticatedSession | { verificationRequired: true; email: string; previewUrl?: string }>(`/auth/${view}`, 'POST', { email, password, ...(view === 'register' ? { name } : {}) });
      if ('verificationRequired' in result) { props.onEmailFlow({kind:'pending',email:result.email,previewUrl:result.previewUrl}); return; }
      props.onAuthenticated(result); props.notify(view === 'register' ? '注册成功，账号已创建。' : '登录成功，已载入账号记录。'); props.onClose();
    });
  }
  return <Modal label={view === 'account' ? '账号管理' : '登录与注册'} className="account-modal" onClose={() => { if (!busy) props.onClose(); }}>
    <div className="dialog-top"><span className="account-dialog-label"><UserRound size={18}/>{view === 'account' ? '账号与数据' : '欢迎来到一杯'}</span><button className="icon-button" disabled={busy} aria-label="关闭账号面板" onClick={props.onClose}><X size={20}/></button></div>
    <div className="account-content">
      {view !== 'account' ? <>
        <h2>{view === 'register' ? '把喜欢的味道，存下来。' : '继续你的饮品日常。'}</h2>
        <p className="account-subtitle">{props.plaintextPasswordTest?'功能验证账号暂不验证邮箱。登录后可测试收藏、材料与个人做法的数据库保存。':'登录后保存收藏、材料与个人做法。浏览和制作无需登录。'}</p>
        <div className="auth-tabs" role="tablist" aria-label="账号操作"><button role="tab" aria-selected={view==='login'} className={view === 'login' ? 'selected' : ''} disabled={busy} onClick={() => switchView('login')}>登录</button><button role="tab" aria-selected={view==='register'} className={view === 'register' ? 'selected' : ''} disabled={busy} onClick={() => switchView('register')}>注册</button></div>
        {props.authError && <p className="form-help">{props.authError} 可以重新提交登录或注册来连接服务。</p>}
        <form onSubmit={authenticate} className="account-form">
          {view === 'register' && <label>昵称<input required maxLength={40} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)} placeholder="怎么称呼你？"/></label>}
          <label>邮箱<input type="email" required maxLength={254} autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></label>
          <label>密码<span className="password-input"><input aria-label="密码" type={show ? 'text' : 'password'} required minLength={view === 'register' ? 12 : 1} maxLength={128} autoComplete={view === 'register' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={view === 'register' ? '至少 12 个字符' : '输入你的密码'}/><button type="button" className="icon-button" aria-label={show ? '隐藏密码' : '显示密码'} onClick={() => setShow(v => !v)}>{show ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
          {view === 'register' && <label>确认密码<input type={show ? 'text' : 'password'} required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></label>}
          {error && <p role="alert" className="form-error">{error}</p>}
          <button className="primary-button auth-submit" disabled={busy || !props.ready} type="submit">{busy ? '正在处理…' : view === 'register' ? '创建账号' : '登录'}<ArrowRight size={17}/></button>
        </form>
        {props.plaintextPasswordTest?<p className="form-help test-password-note">功能验证模式：密码会以明文存入数据库。仅使用临时测试密码，勿使用常用密码。暂不提供邮件找回。</p>:props.emailEnabled?<><div className="auth-help-links"><button className="text-button" disabled={busy} onClick={()=>props.onEmailFlow({kind:'forgot',email})}>忘记密码？</button><button className="text-button" disabled={busy} onClick={()=>props.onEmailFlow({kind:'pending',email})}>重新发送验证邮件</button></div><p className="form-help"><ShieldCheck size={15}/>注册需要验证邮箱。正式环境通过邮件完成验证与找回；本地开发提供邮件预览。</p></>:<p className="form-help"><ShieldCheck size={15}/>当前 Node 本地版本尚未启用账号邮件；Cloudflare 版本提供邮箱验证与密码找回。</p>}
        <button className="text-button guest-continue" onClick={props.onClose} disabled={busy}>继续作为游客使用</button>
      </> : props.user && <>
        <div className="account-profile"><span className="account-avatar">{props.user.name.slice(0, 1).toUpperCase()}</span><div><h2>{props.user.name}</h2><p>{props.user.email}</p></div></div>
        <div className="account-sync-note"><Cloud size={18}/><div><strong>{props.syncMessage}</strong><p>收藏、材料、个人做法按账号隔离保存。</p></div></div>
        {props.guestCount > 0 && <section className="guest-migration"><h3>此设备还有游客记录</h3><p>共 {props.guestCount} 条，可合并到当前账号。相同材料以账号状态为准，游客原记录保留。</p><button className="secondary-button" disabled={busy} onClick={() => { if (props.onMergeGuest()) props.notify('游客记录已加入账号待保存。'); }}>合并游客记录</button></section>}
        <div className="account-section-tabs"><button className={section === 'profile' ? 'selected' : ''} onClick={() => { setSection('profile'); setError(''); }}>个人资料</button><button className={section === 'password' ? 'selected' : ''} onClick={() => { setSection('password'); setError(''); }}>修改密码</button><button className={section === 'delete' ? 'selected' : ''} onClick={() => { setSection('delete'); setError(''); }}>删除账号</button></div>
        {section === 'profile' && <form className="account-form" onSubmit={e => { e.preventDefault(); act(async () => { const result = await apiRequest<{ user: AccountUser }>('/account', 'PATCH', { name }); props.onUserUpdated(result.user); props.notify('昵称已更新。'); }); }}><label>昵称<input required maxLength={40} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)}/></label><p className="form-help">邮箱用于登录，目前暂不支持更换。</p><button type="submit" className="secondary-button" disabled={busy}><Check size={16}/>保存资料</button></form>}
        {section === 'password' && <form className="account-form" onSubmit={e => { e.preventDefault(); if (password !== confirm) { setError('两次输入的新密码不一致。'); return; } act(async () => { await apiRequest('/account/password', 'POST', { currentPassword, password }); setCurrentPassword(''); setPassword(''); setConfirm(''); props.notify('密码已修改，其他设备的登录已退出。'); }); }}><label>当前密码<input type="password" required autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}/></label><label>新密码<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" placeholder="至少 12 个字符" value={password} onChange={e => setPassword(e.target.value)}/></label><label>确认新密码<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></label><button type="submit" className="secondary-button" disabled={busy}>更新密码</button></form>}
        {section === 'delete' && <form className="account-form" onSubmit={e => { e.preventDefault(); if (!window.confirm('确定永久删除账号及其数据库中的收藏、材料和个人做法吗？建议先导出备份。')) return; act(async () => { await apiRequest('/account', 'DELETE', { password }); props.onDeleted(); props.notify('账号与数据库中的个人记录已删除。'); props.onClose(); }); }}><p className="form-help danger-text">删除将永久移除账号、全部登录会话及账号数据。此设备独立的游客记录会保留。</p><button type="button" className="secondary-button" onClick={props.onExport}>先导出我的数据</button><label>输入密码确认<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label><button type="submit" className="danger-button" disabled={busy}>永久删除账号与数据</button></form>}
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="account-footer"><button className="text-button" disabled={busy} onClick={() => act(async () => { if (await props.onLogout()) { props.notify('已退出，当前显示此设备的游客记录。'); props.onClose(); } })}><LogOut size={16}/>退出登录</button><button className="text-button" onClick={() => switchView('login')}>重新登录</button></div>
      </>}
    </div>
  </Modal>;
}
