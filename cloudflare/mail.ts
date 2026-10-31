import type { Env } from './types';
import { HttpError } from './types';
export function localMailPreview(env: Env, request: Request) {
  const host = new URL(request.url).hostname;
  return env.ENVIRONMENT === 'local' && env.DEV_EMAILS === 'true' && ['127.0.0.1', 'localhost', '[::1]'].includes(host);
}
export function ensureMail(env: Env, request: Request) {
  if (!localMailPreview(env, request) && ((!env.EMAIL && !env.RESEND_API_KEY) || !env.EMAIL_FROM)) throw new HttpError(503, '邮件服务尚未配置，暂不能注册或找回密码。你仍可作为游客使用。');
}
export async function sendAccountMail(env: Env, request: Request, email: string, token: string, purpose: 'verify' | 'reset') {
  ensureMail(env, request);
  const link = new URL(env.APP_ORIGIN); link.hash = `${purpose}=${token}`;
  if (localMailPreview(env, request)) return link.toString();
  const title = purpose === 'verify' ? '验证你的一杯账号邮箱' : '重设你的一杯账号密码';
  const duration = purpose === 'verify' ? '24 小时' : '30 分钟';
  const text=`${title}\n\n请打开以下链接并按页面提示完成操作：\n${link}\n\n链接 ${duration}内有效，只能使用一次。如果不是你发起的操作，请忽略此邮件。`;
  if(env.EMAIL){
    try{await env.EMAIL.send({from:env.EMAIL_FROM,to:email,subject:title,text});return undefined;}
    catch{throw new HttpError(503,'邮件暂时未能发送，请稍后重新发送验证或找回邮件。');}
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject: title,
      text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new HttpError(503, '邮件暂时未能发送，请稍后重新发送验证或找回邮件。');
  return undefined;
}
