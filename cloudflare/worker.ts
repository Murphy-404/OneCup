import { freshData, validateBackup } from '../src/logic';
import { HttpError, type Env, type UserRow, type SessionRow, type EmailTokenRow } from './types';
import { PASSWORD_SCHEME, PLAINTEXT_TEST_SCHEME, loginPassword, passwordHash, passwordMatches, publicUser, randomSalt, randomToken, sha, validateEmail, validateName, validatePassword } from './security';
import { ensureMail, localMailPreview, sendAccountMail } from './mail';

const SEVEN_DAYS = 7 * 24 * 60 * 60;
const MAX_BODY = 2 * 1024 * 1024;
const MAX_DOCUMENT = 1_750_000;
interface WorkspaceRow { payload: string; revision: number; updated_at: number }
const workspaceResult = (row: WorkspaceRow) => ({ data: JSON.parse(row.payload), revision: row.revision, updatedAt: new Date(row.updated_at).toISOString() });
function response(status: number, body: unknown, cookie?: string) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    ...(cookie ? { 'Set-Cookie': cookie } : {}), ...(status === 429 ? { 'Retry-After': '900' } : {}),
  } });
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415, '请求需使用 JSON 格式。');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new HttpError(413, '请求数据过大。');
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (!reader) throw new HttpError(400, '缺少请求内容。');
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new HttpError(413, '请求数据过大。'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value;
  } catch { throw new HttpError(400, 'JSON 请求格式不正确。'); }
}
function checkOrigin(request: Request, env: Env) {
  const url = new URL(request.url);
  let expected: URL;
  try { expected = new URL(env.APP_ORIGIN); } catch { throw new HttpError(503, '网站地址尚未配置。'); }
  if (expected.origin !== env.APP_ORIGIN) throw new HttpError(503, '网站来源配置不正确。');
  if (env.ENVIRONMENT === 'local') {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !['127.0.0.1', 'localhost', '[::1]'].includes(expected.hostname)) throw new HttpError(503, '本地开发配置不能用于公网服务。');
  } else if (expected.protocol !== 'https:' || url.origin !== expected.origin || env.DEV_EMAILS === 'true') throw new HttpError(503, '生产域名或邮件安全配置不正确。');
  const origin = request.headers.get('Origin');
  if (origin && origin !== expected.origin) throw new HttpError(403, '请求来源不受信任。');
  if (!['GET', 'HEAD'].includes(request.method) && origin !== expected.origin) throw new HttpError(403, '缺少有效的请求来源。');
}
async function handleApi(request: Request, env: Env): Promise<Response> {
  checkOrigin(request, env);
  const path = new URL(request.url).pathname; const method = request.method;
  const local = env.ENVIRONMENT === 'local';
  const plaintextTest = env.PLAINTEXT_PASSWORD_TEST === 'true';
  // First-primary + sequential consistency also remains safe if D1 read replication is enabled later.
  const db = env.DB.withSession('first-primary');
  const cookieName = local ? 'onecup_session' : '__Host-onecup_session';
  const cookie = (token: string, maxAge = SEVEN_DAYS) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${local ? '' : '; Secure'}`;
  async function session() {
    const token = request.headers.get('Cookie')?.split(';').map(p => p.trim()).find(p => p.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return db.prepare(`SELECT u.*,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND s.auth_version=u.auth_version
      AND (u.email_verified_at IS NOT NULL OR ?=1) AND (?=1 OR u.password_scheme<>?)`).bind(await sha(token), Date.now(),plaintextTest?1:0,plaintextTest?1:0,PLAINTEXT_TEST_SCHEME).first<SessionRow>();
  }
  async function requireUser() { const user = await session(); if (!user) throw new HttpError(401, '登录已失效，请重新登录。'); return user; }
  async function workspace(userId: string) {
    const row = await db.prepare('SELECT payload,revision,updated_at FROM user_data WHERE user_id=?').bind(userId).first<WorkspaceRow>();
    if (!row) throw new HttpError(401, '账号记录不存在，请重新登录。'); return workspaceResult(row);
  }
  async function rateLimit(email?: string) {
    const now = Date.now();
    const address = local ? 'local' : request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const keys: [string, number][] = [[`ip:${address}`, local ? 2000 : 35], ...(email ? [[`email:${email}`, local ? 100 : 12] as [string, number]] : [])];
    for (const [identity, limit] of keys) {
      const result = await db.prepare(`INSERT INTO auth_attempts(key,count,expires_at) VALUES (?,1,?)
        ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
        expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING count`)
        .bind(await sha(identity), now + 900000, now, now, now + 900000).first<{ count: number }>();
      if (!result || result.count > limit) throw new HttpError(429, '尝试次数过多，请 15 分钟后再试。');
    }
  }
  async function issueSession(user: UserRow, previous?: string) {
    const token = randomToken(); const tokenHash = await sha(token); const now = Date.now();
    const result = await db.batch([
      db.prepare(`INSERT INTO sessions(token_hash,user_id,auth_version,expires_at,created_at)
        SELECT ?,id,auth_version,?,? FROM users WHERE id=? AND auth_version=? AND (email_verified_at IS NOT NULL OR ?=1)`)
        .bind(tokenHash, now + SEVEN_DAYS * 1000, now, user.id, user.auth_version,plaintextTest?1:0),
      db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(previous ?? ''),
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),
      db.prepare(`DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN
        (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY created_at DESC,token_hash DESC LIMIT 10)`).bind(user.id, user.id),
    ]);
    if (!result[0].meta.changes) throw new HttpError(401, '账号状态已更新，请重新登录。');
    return token;
  }
  async function tokenFor(user: UserRow, purpose: 'verify' | 'reset') {
    const token = randomToken();
    await db.prepare('INSERT INTO email_tokens(token_hash,user_id,purpose,auth_version,expires_at) VALUES (?,?,?,?,?)')
      .bind(await sha(token), user.id, purpose, user.auth_version, Date.now() + (purpose === 'verify' ? 86400000 : 1800000)).run();
    return token;
  }
  async function tokenRow(value: unknown, purpose: 'verify' | 'reset') {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new HttpError(400, '链接无效或已过期，请重新申请。');
    const row = await db.prepare(`SELECT t.* FROM email_tokens t JOIN users u ON u.id=t.user_id
      WHERE t.token_hash=? AND t.purpose=? AND t.used_at IS NULL AND t.expires_at>? AND t.auth_version=u.auth_version`)
      .bind(await sha(value), purpose, Date.now()).first<EmailTokenRow>();
    if (!row) throw new HttpError(400, '链接无效、已使用或已过期，请重新申请。'); return row;
  }
  if (method === 'GET' && path === '/api/health') {
    const catalogue = await db.prepare('SELECT COUNT(*) AS count FROM recipe_catalog').first<{ count: number }>();
    return response(200, { ok: true, storage: 'd1', recipes: catalogue?.count ?? 0, emailVerification: !plaintextTest, passwordRecovery: !plaintextTest, plaintextPasswordTest: plaintextTest,
      emailDelivery: plaintextTest?'disabled-functional-test':localMailPreview(env, request) ? 'local-preview' : (env.EMAIL || env.RESEND_API_KEY) && env.EMAIL_FROM ? 'configured' : 'unconfigured' });
  }
  if (method === 'GET' && path === '/api/recipes') {
    const rows = await db.prepare('SELECT payload FROM recipe_catalog ORDER BY position').all<{ payload: string }>();
    return response(200, { recipes: rows.results.map(row => JSON.parse(row.payload)) });
  }
  if (method === 'GET' && path === '/api/auth/session') {
    const user = await session(); return response(200, user ? { user: publicUser(user), workspace: await workspace(user.id) } : { user: null });
  }
  if (method === 'POST' && path === '/api/auth/register') {
    if(!plaintextTest)ensureMail(env, request); const input = await body(request); const email = validateEmail(input.email);
    validatePassword(input.password); const name = validateName(input.name); await rateLimit(email);
    if (await session()) throw new HttpError(409, '请先退出当前账号，再注册其他账号。');
    if(plaintextTest){
      const id=crypto.randomUUID();const now=Date.now();
      try{await db.batch([
        db.prepare(`INSERT INTO users(id,email,name,password_hash,salt,password_scheme,password_plaintext,created_at) VALUES (?,?,?,'','',?,?,?)`)
          .bind(id,email,name,PLAINTEXT_TEST_SCHEME,input.password,now),
        db.prepare('INSERT INTO user_data(user_id,payload,revision,updated_at) VALUES (?,?,0,?)').bind(id,JSON.stringify(freshData()),now),
      ]);}catch(error){if(error instanceof Error&&/UNIQUE|unique constraint/i.test(error.message))throw new HttpError(409,'这个邮箱无法注册，请尝试登录或使用其他测试邮箱。');throw error;}
      const user=await db.prepare('SELECT * FROM users WHERE id=?').bind(id).first<UserRow>();
      if(!user)throw new HttpError(500,'账号创建失败，请重试。');
      const token=await issueSession(user);
      return response(201,{user:publicUser(user),workspace:await workspace(id),plaintextPasswordTest:true},cookie(token));
    }
    const salt = randomSalt(); const hash = await passwordHash(input.password, salt); const id = crypto.randomUUID(); const now = Date.now();
    const token = randomToken();
    try {
      await db.batch([
        db.prepare(`INSERT INTO users(id,email,name,password_hash,salt,password_scheme,created_at) VALUES (?,?,?,?,?,?,?)`).bind(id, email, name, hash, salt, PASSWORD_SCHEME, now),
        db.prepare('INSERT INTO user_data(user_id,payload,revision,updated_at) VALUES (?,?,0,?)').bind(id, JSON.stringify(freshData()), now),
        db.prepare(`INSERT INTO email_tokens(token_hash,user_id,purpose,auth_version,expires_at) VALUES (?,?,'verify',0,?)`).bind(await sha(token), id, now + 86400000),
      ]);
    } catch (error) {
      if (error instanceof Error && /UNIQUE|unique constraint/i.test(error.message)) throw new HttpError(409, '这个邮箱无法注册，请尝试登录或重新发送验证邮件。');
      throw error;
    }
    const previewUrl = await sendAccountMail(env, request, email, token, 'verify');
    return response(201, { verificationRequired: true, email, message: '请验证邮箱后登录。', ...(previewUrl ? { previewUrl } : {}) });
  }
  if (method === 'POST' && path === '/api/auth/login') {
    const input = await body(request); const email = validateEmail(input.email); loginPassword(input.password); await rateLimit(email);
    const user = await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first<UserRow>();
    if (!await passwordMatches(input.password, user,plaintextTest)) throw new HttpError(401, '邮箱或密码不正确。');
    if (!plaintextTest&&!user!.email_verified_at) return response(403, { error: '邮箱尚未验证，请打开验证邮件或重新发送。', verificationRequired: true });
    const previous = await session(); const token = await issueSession(user!, previous?.token_hash);
    return response(200, { user: publicUser(user!), workspace: await workspace(user!.id) }, cookie(token));
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    const user = await session(); if (user) await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.token_hash).run();
    return response(200, { ok: true }, cookie('', 0));
  }
  if(plaintextTest&&['/api/auth/resend-verification','/api/auth/forgot-password','/api/auth/verify-email','/api/auth/reset-password'].includes(path))throw new HttpError(503,'功能验证模式暂不提供邮件验证或密码找回，请只使用临时测试账号。');
  if (method === 'POST' && ['/api/auth/resend-verification', '/api/auth/forgot-password'].includes(path)) {
    ensureMail(env, request); const input = await body(request); const email = validateEmail(input.email); await rateLimit(email);
    const purpose = path.endsWith('forgot-password') ? 'reset' : 'verify';
    const user = await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first<UserRow>();
    let previewUrl: string | undefined;
    if (user && (purpose === 'reset' ? !!user.email_verified_at : !user.email_verified_at)) previewUrl = await sendAccountMail(env, request, email, await tokenFor(user, purpose), purpose);
    return response(200, { message: '如果此邮箱符合条件，邮件将发送到该邮箱。请检查收件箱与垃圾邮件。', ...(previewUrl ? { previewUrl } : {}) });
  }
  if (method === 'POST' && path === '/api/auth/verify-email') {
    const input = await body(request); await rateLimit(); const row = await tokenRow(input.token, 'verify');
    const claim = crypto.randomUUID(); const now = Date.now(); const token = randomToken();
    const result = await db.batch([
      db.prepare(`UPDATE email_tokens SET used_at=?,claim_id=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?
        AND auth_version=(SELECT auth_version FROM users WHERE id=user_id)`).bind(now, claim, row.token_hash, now),
      db.prepare(`UPDATE users SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=? AND EXISTS
        (SELECT 1 FROM email_tokens WHERE token_hash=? AND claim_id=?)`).bind(now, row.user_id, row.token_hash, claim),
      db.prepare(`INSERT INTO sessions(token_hash,user_id,auth_version,expires_at,created_at)
        SELECT ?,id,auth_version,?,? FROM users WHERE id=? AND EXISTS
        (SELECT 1 FROM email_tokens WHERE token_hash=? AND claim_id=?)`).bind(await sha(token), now + SEVEN_DAYS * 1000, now, row.user_id, row.token_hash, claim),
    ]);
    if (!result[0].meta.changes) throw new HttpError(400, '链接已使用或已过期，请重新申请。');
    const user = await db.prepare('SELECT * FROM users WHERE id=?').bind(row.user_id).first<UserRow>();
    if (!user) throw new HttpError(400, '账号不存在。');
    return response(200, { user: publicUser(user), workspace: await workspace(user.id) }, cookie(token));
  }
  if (method === 'POST' && path === '/api/auth/reset-password') {
    const input = await body(request); validatePassword(input.password); await rateLimit(); const row = await tokenRow(input.token, 'reset');
    const salt = randomSalt(); const hash = await passwordHash(input.password, salt); const claim = crypto.randomUUID(); const now = Date.now();
    const result = await db.batch([
      db.prepare(`UPDATE email_tokens SET used_at=?,claim_id=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?
        AND auth_version=(SELECT auth_version FROM users WHERE id=user_id)`).bind(now, claim, row.token_hash, now),
      db.prepare(`UPDATE users SET password_hash=?,salt=?,password_scheme=?,password_plaintext=NULL,auth_version=auth_version+1,credential_nonce=?
        WHERE id=? AND auth_version=? AND EXISTS (SELECT 1 FROM email_tokens WHERE token_hash=? AND claim_id=?)`)
        .bind(hash, salt, PASSWORD_SCHEME, claim, row.user_id, row.auth_version, row.token_hash, claim),
      db.prepare(`DELETE FROM sessions WHERE user_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND credential_nonce=?)`).bind(row.user_id, row.user_id, claim),
    ]);
    if (!result[0].meta.changes || !result[1].meta.changes) throw new HttpError(400, '链接已失效，请重新申请。');
    return response(200, { ok: true, message: '密码已重设，请使用新密码登录。' }, cookie('', 0));
  }
  if (method === 'GET' && path === '/api/data') { const user = await requireUser(); return response(200, await workspace(user.id)); }
  if (method === 'PUT' && path === '/api/data') {
    const user = await requireUser(); const input = await body(request);
    if (!Number.isInteger(input.revision) || (input.revision as number) < 0) throw new HttpError(400, '缺少数据版本。');
    let data;
    try { data = validateBackup(input.data); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : '数据无效。'); }
    const payload = JSON.stringify(data);
    if (new TextEncoder().encode(payload).length > MAX_DOCUMENT) throw new HttpError(413, '账号记录已超过当前文档存储上限，请先导出备份并精简个人做法。');
    const row = await db.prepare(`UPDATE user_data SET payload=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?
      AND EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.auth_version=u.auth_version)
      RETURNING payload,revision,updated_at`).bind(payload, Date.now(), user.id, input.revision as number, user.token_hash, Date.now()).first<WorkspaceRow>();
    if (!row) {
      await requireUser(); return response(409, { error: '其他设备已更新记录。当前修改已保留，请选择读取数据库版本或确认覆盖。', workspace: await workspace(user.id) });
    }
    return response(200, workspaceResult(row));
  }
  if (method === 'PATCH' && path === '/api/account') {
    const user = await requireUser(); const input = await body(request); const name = validateName(input.name);
    const result = await db.prepare(`UPDATE users SET name=? WHERE id=? AND auth_version=?`).bind(name, user.id, user.auth_version).run();
    if (!result.meta.changes) throw new HttpError(401, '账号状态已更新，请重新登录。');
    return response(200, { user: publicUser({ ...user, name }) });
  }
  if (method === 'POST' && path === '/api/account/password') {
    const user = await requireUser(); const input = await body(request); loginPassword(input.currentPassword); validatePassword(input.password); await rateLimit(user.email);
    if (!await passwordMatches(input.currentPassword, user,plaintextTest)) throw new HttpError(401, '当前密码不正确。');
    const salt = plaintextTest?'':randomSalt(); const hash = plaintextTest?'':await passwordHash(input.password, salt); const nonce = crypto.randomUUID();
    const now = Date.now(); const token = randomToken();
    const result = await db.batch([
      db.prepare(`UPDATE users SET password_hash=?,salt=?,password_scheme=?,password_plaintext=?,auth_version=auth_version+1,credential_nonce=?
        WHERE id=? AND auth_version=? AND EXISTS (SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?)`)
        .bind(hash, salt, plaintextTest?PLAINTEXT_TEST_SCHEME:PASSWORD_SCHEME, plaintextTest?input.password:null, nonce, user.id, user.auth_version, user.token_hash, now),
      db.prepare('DELETE FROM sessions WHERE user_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND credential_nonce=?)').bind(user.id, user.id, nonce),
      db.prepare(`INSERT INTO sessions(token_hash,user_id,auth_version,expires_at,created_at)
        SELECT ?,id,auth_version,?,? FROM users WHERE id=? AND credential_nonce=?`).bind(await sha(token), now + SEVEN_DAYS * 1000, now, user.id, nonce),
    ]);
    if (!result[0].meta.changes) throw new HttpError(401, '账号状态已更新，请重新登录。');
    return response(200, { ok: true }, cookie(token));
  }
  if (method === 'DELETE' && path === '/api/account') {
    const user = await requireUser(); const input = await body(request); loginPassword(input.password); await rateLimit(user.email);
    if (!await passwordMatches(input.password, user,plaintextTest)) throw new HttpError(401, '密码不正确，账号未删除。');
    const result = await db.prepare('DELETE FROM users WHERE id=? AND auth_version=?').bind(user.id, user.auth_version).run();
    if (!result.meta.changes) throw new HttpError(401, '账号状态已更新，请重新登录。');
    return response(200, { ok: true }, cookie('', 0));
  }
  throw new HttpError(404, '接口不存在。');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await handleApi(request, env); }
    catch (error) {
      if (error instanceof HttpError) return response(error.status, { error: error.message });
      // Do not log email tokens, password inputs, database query arguments, or request bodies.
      console.error('Worker request failed', { path, errorType: error instanceof Error ? error.name : 'unknown' });
      return response(500, { error: '数据服务暂不可用，请稍后重试。' });
    }
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),
      env.DB.prepare('DELETE FROM auth_attempts WHERE expires_at<=?').bind(now),
      env.DB.prepare('DELETE FROM email_tokens WHERE expires_at<=? OR used_at IS NOT NULL').bind(now),
    ]);
  },
} satisfies ExportedHandler<Env>;
