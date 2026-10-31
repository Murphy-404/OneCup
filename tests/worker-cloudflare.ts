import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, scryptSync } from 'node:crypto';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';
import { recipes } from '../src/data';
import { freshData,recipeDraft } from '../src/logic';
import { applySubstitution,undoSubstitution } from '../src/substitutions';
import { passwordHash } from '../cloudflare/security';
import {DatabaseSync} from 'node:sqlite';
import {credentialMigration} from '../scripts/prepare-auth-migration';
const origin = 'http://127.0.0.1:8787';
const password = 'worker-test-long-passphrase';
test('migrated test account verifies its mailbox and retains D1 data in secure mode',async()=>{
 const f=await fixture(false,true);const scratch=new DatabaseSync(':memory:');
 try{
  const c=f.client();const created=await c.request('/auth/register','POST',{email:'migration@example.test',name:'Migration',password});assert.equal(created.status,201);
  const payload={...freshData(),favorites:['matcha']};await c.request('/data','PUT',{data:payload,revision:0});
  const row=await f.db.prepare('SELECT id,password_plaintext,auth_version,credential_nonce FROM users WHERE id=?').bind(created.body.user.id).first<any>();
  scratch.exec('CREATE TABLE users(id TEXT,password_plaintext TEXT,auth_version INTEGER,credential_nonce TEXT,password_scheme TEXT)');scratch.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(row.id,row.password_plaintext,row.auth_version,row.credential_nonce,'plaintext-functional-test-v1');
  const migration=credentialMigration(scratch);const statements=migration.sql.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);await f.db.batch(statements.map(s=>f.db.prepare(s)));
  await f.setMode(false);assert.equal((await c.request('/data')).status,401);assert.equal((await c.request('/auth/login','POST',{email:'migration@example.test',password})).status,403);
  const mail=await c.request('/auth/resend-verification','POST',{email:'migration@example.test'});assert.equal(mail.status,200);assert(mail.body.previewUrl);
  const token=new URLSearchParams(new URL(mail.body.previewUrl).hash.slice(1)).get('verify');assert.equal((await c.request('/auth/verify-email','POST',{token})).status,200);
  const restored=await c.request('/data');assert.deepEqual(restored.body.data.favorites,['matcha']);assert.equal(restored.body.revision,1);
  const migratedDb=await f.mf.getD1Database('DB','onecup-test');const credentials=await migratedDb.prepare('SELECT password_plaintext,password_scheme FROM users WHERE id=?').bind(row.id).first<any>();assert.equal(credentials.password_plaintext,null);assert.equal(credentials.password_scheme,'scrypt-n14-r8-p5-v1');
 }finally{scratch.close();await f.close();}
});
async function fixture(production = false, plaintextTest = false) {
  const expected = production ? 'https://onecup.example.test' : origin;
  const options=(testMode:boolean)=>convertV4MiniflareOptions({ cf: false, log: new Log(LogLevel.ERROR), workers: [{ name:'onecup-test', modules: true,
    scriptPath: resolve('cloudflare/.dry-run/worker.js'), compatibilityDate: '2026-10-01', d1Databases: { DB: 'onecup-tests' },
    bindings: { ENVIRONMENT: production ? 'production' : 'local', APP_ORIGIN: expected, EMAIL_FROM: production ? '' : 'test@example.test', DEV_EMAILS: production ? 'false' : 'true',PLAINTEXT_PASSWORD_TEST:testMode?'true':'false' } }] });
  const mf = new Miniflare(options(plaintextTest));
  const db = await mf.getD1Database('DB','onecup-test').catch(async error=>{await mf.dispose();throw error;});
  for(const file of(await readdir('cloudflare/migrations')).filter(f=>f.endsWith('.sql')).sort()){
    const schema=(await readFile('cloudflare/migrations/'+file,'utf8')).replace(/^--.*$/gm,'');
    for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  await db.batch(recipes.map((r, i) => db.prepare('INSERT INTO recipe_catalog(id,position,payload) VALUES (?,?,?)').bind(r.id, i, JSON.stringify(r))));
  function client() {
    let cookie = '';
    return { get cookie() { return cookie; }, set cookie(value: string) { cookie = value; },
      async request(path: string, method = 'GET', data?: unknown, source: string | null = expected) {
        const res = await mf.dispatchFetch(expected + '/api' + path, { method,
          headers: { ...(cookie ? { Cookie: cookie } : {}), ...(source ? { Origin: source } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
          body: data === undefined ? undefined : JSON.stringify(data) });
        const next = res.headers.get('set-cookie'); if (next) cookie = next.split(';')[0];
        return { status: res.status, body: await res.json() as any, headers: res.headers };
      },
    };
  }
  async function verified(email: string) {
    const c = client(); const r = await c.request('/auth/register', 'POST', { email, name: 'Worker Test', password });
    assert.equal(r.status, 201); assert(r.body.verificationRequired); assert(r.body.previewUrl);
    const token = new URLSearchParams(new URL(r.body.previewUrl).hash.slice(1)).get('verify');
    const v = await c.request('/auth/verify-email', 'POST', { token }); assert.equal(v.status, 200);
    return { c, token, user: v.body.user };
  }
  return { mf, db, client, verified, setMode:async(value:boolean)=>{await mf.setOptions(options(value));await mf.ready;},close: () => mf.dispose() };
}
test('Worker password derivation matches standard scrypt at the constrained-memory profile', async () => {
  const actual = await passwordHash(password, 'fixed-test-salt');
  const expected = scryptSync(password, 'fixed-test-salt', 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }).toString('hex');
  assert.equal(actual, expected);
});
test('actual Workers + D1: verified registration, isolation, CAS conflicts, password change, logout, cascade deletion', async () => {
  const f = await fixture();
  try {
    const guest = f.client(); const health = await guest.request('/health');
    assert.equal(health.body.storage, 'd1'); assert.equal(health.body.recipes, 24); assert.equal(health.body.emailDelivery, 'local-preview');
    assert.equal((await guest.request('/data')).status, 401);
    assert.equal((await guest.request('/auth/register', 'POST', { email: 'bad@example.test', name: 'Bad', password }, null)).status, 403);
    assert.equal((await guest.request('/auth/register', 'POST', { email: 'bad@example.test', name: 'Bad', password }, 'https://untrusted.example')).status, 403);
    const pending = await guest.request('/auth/register', 'POST', { email: 'pending@example.test', name: 'Pending', password });
    assert.equal(pending.status, 201); assert.equal(pending.headers.get('set-cookie'), null);
    assert.equal((await guest.request('/auth/login', 'POST', { email: 'pending@example.test', password })).status, 403);
    const { c: alice, token, user } = await f.verified('alice@example.test');
    assert.equal((await alice.request('/auth/verify-email', 'POST', { token })).status, 400, 'Verification link is single-use');
    assert.equal((await alice.request('/auth/session')).body.user.emailVerified, true);
    const data = { ...freshData(), favorites: ['matcha'], stock: { milk: 'have' as const } };
    assert.equal((await alice.request('/data', 'PUT', { data, revision: 0 })).body.revision, 1);
    assert.equal((await alice.request('/data', 'PUT', { data: freshData(), revision: 0 })).status, 409);
    assert.equal((await alice.request('/data', 'PUT', { data: { ...data, stock: { milk: 'bad' } }, revision: 1 })).status, 400);
    const { c: bob } = await f.verified('bob@example.test');
    assert.deepEqual((await bob.request('/data')).body.data.favorites, []);
    await bob.request('/data', 'PUT', { data: { ...freshData(), favorites: ['negroni'] }, revision: 0, userId: user.id });
    assert.deepEqual((await alice.request('/data')).body.data.favorites, ['matcha']);
    const other = f.client();
    assert.equal((await other.request('/auth/login', 'POST', { email: 'alice@example.test', password: 'wrong' })).status, 401);
    assert.equal((await other.request('/auth/login', 'POST', { email: 'alice@example.test', password })).status, 200);
    assert.equal((await alice.request('/account', 'PATCH', { name: 'Updated' })).body.user.name, 'Updated');
    assert.equal((await alice.request('/account/password', 'POST', { currentPassword: password, password: 'new-worker-long-passphrase' })).status, 200);
    assert.equal((await other.request('/data')).status, 401);
    assert.equal((await alice.request('/account', 'DELETE', { password: 'new-worker-long-passphrase' })).status, 200);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').bind(user.id).first())!.n, 0);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM user_data WHERE user_id=?').bind(user.id).first())!.n, 0);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM email_tokens WHERE user_id=?').bind(user.id).first())!.n, 0);
    assert.deepEqual((await bob.request('/data')).body.data.favorites, ['negroni']);
    const oldCookie = bob.cookie; await bob.request('/auth/logout', 'POST', {}); bob.cookie = oldCookie;
    assert.equal((await bob.request('/data')).status, 401);
  } finally { await f.close(); }
});
test('D1 token claims are single-use under concurrent verification and reset; reset revokes all sessions', async () => {
  const f = await fixture();
  try {
    const a = f.client(); const b = f.client();
    const signup = await a.request('/auth/register', 'POST', { email: 'race@example.test', name: 'Race', password });
    const token = new URLSearchParams(new URL(signup.body.previewUrl).hash.slice(1)).get('verify');
    const verified = await Promise.all([a.request('/auth/verify-email', 'POST', { token }), b.request('/auth/verify-email', 'POST', { token })]);
    assert.deepEqual(verified.map(r => r.status).sort(), [200, 400]);
    await a.request('/auth/login', 'POST', { email: 'race@example.test', password });
    await b.request('/auth/login', 'POST', { email: 'race@example.test', password });
    const forgot = await a.request('/auth/forgot-password', 'POST', { email: 'race@example.test' });
    const resetToken = new URLSearchParams(new URL(forgot.body.previewUrl).hash.slice(1)).get('reset');
    const results = await Promise.all([a.request('/auth/reset-password', 'POST', { token: resetToken, password: 'new-password-one-long' }), b.request('/auth/reset-password', 'POST', { token: resetToken, password: 'new-password-two-long' })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
    assert.equal((await a.request('/data')).status, 401); assert.equal((await b.request('/data')).status, 401);
    assert.equal((await a.request('/auth/reset-password', 'POST', { token: resetToken, password })).status, 400);
    assert.equal((await a.request('/auth/login', 'POST', { email: 'race@example.test', password })).status, 401);
    const winner = results[0].status === 200 ? 'new-password-one-long' : 'new-password-two-long';
    assert.equal((await a.request('/auth/login', 'POST', { email: 'race@example.test', password: winner })).status, 200);
    const next = await a.request('/auth/forgot-password', 'POST', { email: 'race@example.test' });
    const expired = new URLSearchParams(new URL(next.body.previewUrl).hash.slice(1)).get('reset')!;
    await f.db.prepare('UPDATE email_tokens SET expires_at=0 WHERE token_hash=?').bind(createHash('sha256').update(expired).digest('hex')).run();
    assert.equal((await a.request('/auth/reset-password', 'POST', { token: expired, password })).status, 400);
    const unknown = await a.request('/auth/forgot-password', 'POST', { email: 'unknown@example.test' });
    assert.equal(unknown.status, 200); assert.equal(unknown.body.previewUrl, undefined);
  } finally { await f.close(); }
});
test('production never exposes preview links and refuses registration without mail service', async () => {
  const f = await fixture(true);
  try {
    const c = f.client();
    assert.equal((await c.request('/health')).body.emailDelivery, 'unconfigured');
    const result = await c.request('/auth/register', 'POST', { email: 'public@example.test', password, name: 'Public' });
    assert.equal(result.status, 503); assert.equal(result.body.previewUrl, undefined);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM users').first())!.n, 0);
    assert.equal((await c.request('/auth/forgot-password', 'POST', { email: 'unknown@example.test' })).status, 503);
  } finally { await f.close(); }
});
test('explicit public plaintext test mode: register without mail, persist, change password, isolate and delete',async()=>{
  const f=await fixture(true,true);
  try{
    const a=f.client(),other=f.client(),b=f.client();
    const health=await a.request('/health');assert.equal(health.body.plaintextPasswordTest,true);assert.equal(health.body.emailVerification,false);assert.equal(health.body.passwordRecovery,false);
    const signup=await a.request('/auth/register','POST',{email:'plaintext@example.test',name:'Temporary test',password});
    assert.equal(signup.status,201);assert.equal(signup.body.user.emailVerified,false);assert(!signup.body.user.password_plaintext);
    const userId=signup.body.user.id;
    const row=await f.db.prepare('SELECT password_plaintext,password_hash,password_scheme FROM users WHERE id=?').bind(userId).first();
    assert.equal(row!.password_plaintext,password);assert.equal(row!.password_hash,'');assert.equal(row!.password_scheme,'plaintext-functional-test-v1');
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM email_tokens WHERE user_id=?').bind(userId).first())!.n,0);
    const draft=recipeDraft(recipes.find(r=>r.id==='vanilla-latte')!);const resolved=applySubstitution(draft.snapshot,draft.amounts,'milk-oat');
    const variant={...draft,snapshot:resolved.recipe,amounts:resolved.amounts};
    const data={...freshData(),favorites:['matcha'],equipment:{sealedjar:'have' as const},versions:[variant],plan:[{...variant,id:'plan-variant'}]};assert.equal((await a.request('/data','PUT',{data,revision:0})).status,200);
    await b.request('/auth/register','POST',{email:'plaintext-other@example.test',name:'Other test',password});assert.deepEqual((await b.request('/data')).body.data.favorites,[]);
    assert.equal((await other.request('/auth/login','POST',{email:'plaintext@example.test',password:'incorrect'})).status,401);
    assert.equal((await other.request('/auth/login','POST',{email:'plaintext@example.test',password})).status,200);
    assert.deepEqual((await other.request('/data')).body.data.favorites,['matcha']);
    const restored=(await other.request('/data')).body.data;assert.deepEqual(restored.equipment,data.equipment);assert.deepEqual(restored.versions,data.versions);assert.deepEqual(restored.plan,data.plan);
    const stored=restored.versions[0];const undone=undoSubstitution(stored.snapshot,{...stored.amounts,oat:135},'milk-oat');
    const afterUndo={...restored,versions:[{...stored,snapshot:undone.recipe,amounts:undone.amounts,servings:2,note:'undo keeps note'}]};
    assert.equal((await other.request('/data','PUT',{data:afterUndo,revision:1})).status,200);
    const persisted=(await a.request('/data')).body;assert.equal(persisted.revision,2);assert.equal(persisted.data.versions[0].amounts.milk,135);assert.equal(persisted.data.versions[0].note,'undo keeps note');assert.equal(persisted.data.plan[0].snapshot.resolutions[0].id,'milk-oat','saved plan must remain independent');
    const bad=structuredClone(afterUndo);bad.plan[0].snapshot.resolutions[0].undo.replacements=['sugar'];assert.equal((await other.request('/data','PUT',{data:bad,revision:2})).status,400);assert.equal((await a.request('/data')).body.revision,2,'rejected backup does not overwrite the workspace');
    const changed='temporary-new-test-password';
    assert.equal((await a.request('/account/password','POST',{currentPassword:password,password:changed})).status,200);
    assert.equal((await other.request('/data')).status,401);
    assert.equal((await f.db.prepare('SELECT password_plaintext FROM users WHERE id=?').bind(userId).first())!.password_plaintext,changed);
    assert.equal((await a.request('/auth/forgot-password','POST',{email:'plaintext@example.test'})).status,503);
    assert.equal((await a.request('/account','DELETE',{password:changed})).status,200);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM users WHERE id=?').bind(userId).first())!.n,0);
  }finally{await f.close();}
});
test('turning test mode off rejects plaintext account login and existing sessions',async()=>{
  const f=await fixture(true,true);
  try{
    const a=f.client();const created=await a.request('/auth/register','POST',{email:'disable@example.test',name:'Disable',password});assert.equal(created.status,201);
    assert.equal((await a.request('/data')).status,200);
    await f.setMode(false);
    assert.equal((await a.request('/auth/session')).body.user,null);
    assert.equal((await a.request('/data')).status,401);
    assert.equal((await a.request('/auth/login','POST',{email:'disable@example.test',password})).status,401);
  }finally{await f.close();}
});
