import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { freshData, validateBackup } from '../src/logic';
import { recipes } from '../src/data';

interface Options { databasePath: string; origin: string; secureCookies?: boolean; staticDirectory?: string }
interface UserRow { id: string; email: string; name: string; password_hash: string; salt: string; created_at: number }
interface SessionRow extends UserRow { token_hash: string }
interface WorkspaceRow { payload: string; revision: number; updated_at: number }
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const SEVEN_DAYS = 7 * 24 * 60 * 60;
const MAX_BODY = 5 * 1024 * 1024;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const publicUser = (user: UserRow) => ({ id: user.id, email: user.email, name: user.name, createdAt: new Date(user.created_at).toISOString() });

// Memory-hard password derivation, using the OWASP scrypt baseline. Never store raw passwords.
let activeHashes = 0;
async function hashPassword(password: string, salt: string) {
  if (activeHashes >= 3) throw new HttpError(429, '当前请求较多，请稍后再试。');
  activeHashes++;
  try {
    return await new Promise<string>((resolveHash, reject) => scrypt(password, salt, 32,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolveHash(key.toString('hex'))));
  } finally { activeHashes--; }
}
async function passwordMatches(password: string, user?: UserRow) {
  const result = await hashPassword(password, user?.salt ?? 'onecup-dummy-salt-for-missing-user');
  return !!user && timingSafeEqual(Buffer.from(result, 'hex'), Buffer.from(user.password_hash, 'hex'));
}
function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 || Buffer.byteLength(password) > 256)
    throw new HttpError(400, '密码需为 12～128 个字符，建议使用多个词组成的长密码。');
}
function validateName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) throw new HttpError(400, '昵称需为 1～40 个字符。');
  return name.trim();
}
function validateEmail(email: unknown): string {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new HttpError(400, '请输入有效的邮箱地址。');
  return email.trim().toLowerCase();
}
async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, '请求需使用 JSON 格式。');
  if (Number(req.headers['content-length']) > MAX_BODY) throw new HttpError(413, '数据过大，不能超过 5 MB。');
  let total = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY) throw new HttpError(413, '数据过大，不能超过 5 MB。');
    chunks.push(Buffer.from(chunk));
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error();
    return data;
  } catch { throw new HttpError(400, 'JSON 请求格式不正确。'); }
}
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function createApplication(options: Options) {
  const expectedOrigin = new URL(options.origin).origin;
  if (options.databasePath !== ':memory:') mkdirSync(dirname(resolve(options.databasePath)), { recursive: true });
  const db = new DatabaseSync(options.databasePath);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS user_data (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recipe_catalog (id TEXT PRIMARY KEY, position INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    PRAGMA user_version=1;
  `);
  const seed = db.prepare('INSERT INTO recipe_catalog(id,position,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET position=excluded.position,payload=excluded.payload');
  db.exec('BEGIN');
  try { recipes.forEach((recipe, i) => seed.run(recipe.id, i, JSON.stringify(recipe))); db.exec('COMMIT'); }
  catch (error) { db.exec('ROLLBACK'); throw error; }
  const cookieName = options.secureCookies ? '__Host-onecup_session' : 'onecup_session';
  function cookie(res: ServerResponse, token: string, maxAge = SEVEN_DAYS) {
    res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${options.secureCookies ? '; Secure' : ''}`);
  }
  function session(req: IncomingMessage): SessionRow | undefined {
    const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
    return db.prepare(`SELECT u.*,s.token_hash FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`).get(sha(token), Date.now()) as SessionRow | undefined;
  }
  function requireUser(req: IncomingMessage) {
    const user = session(req);
    if (!user) throw new HttpError(401, '登录已失效，请重新登录。');
    return user;
  }
  function workspace(userId: string) {
    const row = db.prepare('SELECT payload,revision,updated_at FROM user_data WHERE user_id=?').get(userId) as unknown as WorkspaceRow;
    return { data: JSON.parse(row.payload), revision: row.revision, updatedAt: new Date(row.updated_at).toISOString() };
  }
  function newSession(res: ServerResponse, userId: string) {
    const token = randomBytes(32).toString('hex'); const now = Date.now();
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(sha(token), userId, now + SEVEN_DAYS * 1000, now);
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 10)').run(userId, userId);
    cookie(res, token);
  }
  function rateLimit(req: IncomingMessage, email?: string) {
    const now = Date.now();
    db.prepare('DELETE FROM auth_attempts WHERE expires_at<=?').run(now);
    // Do not trust arbitrary forwarded-IP headers; deploy behind an explicitly configured proxy.
    for (const [identity, limit] of [[`ip:${req.socket.remoteAddress}`, 35], ...(email ? [[`email:${email}`, 12]] : [])] as [string, number][]) {
      const key = sha(identity);
      db.prepare('INSERT INTO auth_attempts(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + 15 * 60 * 1000);
      const row = db.prepare('SELECT count FROM auth_attempts WHERE key=?').get(key) as { count: number };
      if (row.count > limit) throw new HttpError(429, '尝试次数过多，请 15 分钟后再试。');
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      const url = new URL(req.url ?? '/', expectedOrigin);
      const path = url.pathname; const method = req.method ?? 'GET';
      if (path.startsWith('/api/')) {
        if (req.headers.origin && req.headers.origin !== expectedOrigin) throw new HttpError(403, '请求来源不受信任。');
        if (!['GET', 'HEAD'].includes(method) && req.headers.origin !== expectedOrigin) throw new HttpError(403, '缺少有效的请求来源。');
        if (method === 'GET' && path === '/api/health') return json(res, 200, { ok: true, storage: 'sqlite', emailVerification: false, passwordRecovery: false });
        if (method === 'GET' && path === '/api/recipes') return json(res, 200, { recipes: db.prepare('SELECT payload FROM recipe_catalog ORDER BY position').all().map(row => JSON.parse(row.payload as string)) });
        if (method === 'GET' && path === '/api/auth/session') {
          const user = session(req);
          return json(res, 200, user ? { user: publicUser(user), workspace: workspace(user.id) } : { user: null });
        }
        if (method === 'POST' && (path === '/api/auth/register' || path === '/api/auth/login')) {
          const body = await jsonBody(req); const email = validateEmail(body.email);
          rateLimit(req, email);
          if (path.endsWith('/register')) {
            validatePassword(body.password); const name = validateName(body.name);
            const salt = randomBytes(16).toString('hex'); const hash = await hashPassword(body.password, salt);
            // Do not switch a currently authenticated session through registration.
            if (session(req)) throw new HttpError(409, '请先退出当前账号，再注册其他账号。');
            const user: UserRow = { id: randomUUID(), email, name, password_hash: hash, salt, created_at: Date.now() };
            db.exec('BEGIN');
            try {
              db.prepare('INSERT INTO users(id,email,name,password_hash,salt,created_at) VALUES (?,?,?,?,?,?)').run(user.id, email, name, hash, salt, user.created_at);
              db.prepare('INSERT INTO user_data(user_id,payload,revision,updated_at) VALUES (?,?,0,?)').run(user.id, JSON.stringify(freshData()), Date.now());
              db.exec('COMMIT');
            } catch (error) {
              db.exec('ROLLBACK');
              if (error instanceof Error && error.message.includes('UNIQUE')) throw new HttpError(409, '这个邮箱无法注册，请尝试登录或使用其他邮箱。');
              throw error;
            }
            newSession(res, user.id); return json(res, 201, { user: publicUser(user), workspace: workspace(user.id) });
          }
          if (typeof body.password !== 'string' || body.password.length > 128) throw new HttpError(400, '请输入有效密码。');
          const user = db.prepare('SELECT * FROM users WHERE email=?').get(email) as unknown as UserRow | undefined;
          if (!await passwordMatches(body.password, user)) throw new HttpError(401, '邮箱或密码不正确。');
          const old = session(req);
          if (old) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(old.token_hash);
          newSession(res, user!.id); return json(res, 200, { user: publicUser(user!), workspace: workspace(user!.id) });
        }
        if (method === 'POST' && path === '/api/auth/logout') {
          const user = session(req); if (user) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.token_hash);
          cookie(res, '', 0); return json(res, 200, { ok: true });
        }
        if (method === 'GET' && path === '/api/data') { const user = requireUser(req); return json(res, 200, workspace(user.id)); }
        if (method === 'PUT' && path === '/api/data') {
          const user = requireUser(req); const body = await jsonBody(req);
          if (!Number.isInteger(body.revision) || (body.revision as number) < 0) throw new HttpError(400, '缺少数据版本。');
          let data;
          try { data = validateBackup(body.data); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : '数据格式无效。'); }
          const update = db.prepare('UPDATE user_data SET payload=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').run(JSON.stringify(data), Date.now(), user.id, body.revision as number);
          if (!update.changes) return json(res, 409, { error: '其他设备已更新记录。当前修改已保留，请选择读取数据库版本或确认覆盖。', workspace: workspace(user.id) });
          return json(res, 200, workspace(user.id));
        }
        if (method === 'PATCH' && path === '/api/account') {
          const user = requireUser(req); const body = await jsonBody(req); const name = validateName(body.name);
          db.prepare('UPDATE users SET name=? WHERE id=?').run(name, user.id);
          return json(res, 200, { user: publicUser({ ...user, name }) });
        }
        if (method === 'POST' && path === '/api/account/password') {
          const user = requireUser(req); const body = await jsonBody(req); rateLimit(req, user.email);
          if (typeof body.currentPassword !== 'string' || body.currentPassword.length > 128 || !await passwordMatches(body.currentPassword, user)) throw new HttpError(401, '当前密码不正确。');
          validatePassword(body.password); const salt = randomBytes(16).toString('hex'); const hash = await hashPassword(body.password, salt);
          db.exec('BEGIN');
          try { db.prepare('UPDATE users SET password_hash=?,salt=? WHERE id=?').run(hash, salt, user.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); db.exec('COMMIT'); }
          catch (error) { db.exec('ROLLBACK'); throw error; }
          newSession(res, user.id); return json(res, 200, { ok: true });
        }
        if (method === 'DELETE' && path === '/api/account') {
          const user = requireUser(req); const body = await jsonBody(req); rateLimit(req, user.email);
          if (typeof body.password !== 'string' || body.password.length > 128 || !await passwordMatches(body.password, user)) throw new HttpError(401, '密码不正确，账号未删除。');
          db.prepare('DELETE FROM users WHERE id=?').run(user.id);
          cookie(res, '', 0); return json(res, 200, { ok: true });
        }
        throw new HttpError(404, '接口不存在。');
      }
      if (!options.staticDirectory || !['GET', 'HEAD'].includes(method)) throw new HttpError(404, '页面不存在。');
      const root = resolve(options.staticDirectory);
      const candidate = resolve(root, `.${decodeURIComponent(path)}`);
      if (candidate !== root && !candidate.startsWith(root + sep)) throw new HttpError(403, '无效路径。');
      let filePath = candidate;
      try { if (!(await stat(candidate)).isFile()) filePath = resolve(root, 'index.html'); }
      catch { if (extname(path)) throw new HttpError(404, '文件不存在。'); filePath = resolve(root, 'index.html'); }
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
      const content = await readFile(filePath);
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      res.writeHead(200, { 'Content-Type': types[extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600' });
      res.end(method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 429) res.setHeader('Retry-After', '900');
      if (status === 500) console.error('Request failed:', error instanceof Error ? error.message : 'unknown error');
      json(res, status, { error: error instanceof HttpError ? error.message : '服务暂时不可用，请稍后再试。' });
    }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 15_000;
  return { server, db };
}
