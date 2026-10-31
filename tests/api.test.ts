import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApplication } from '../server/app';
import { freshData } from '../src/logic';
const origin = 'http://127.0.0.1:5173';
const password = 'onecup-test-long-passphrase';
async function start(databasePath = ':memory:') {
  const app = createApplication({ databasePath, origin });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const address = app.server.address(); if (!address || typeof address === 'string') throw Error('No server address');
  const base = `http://127.0.0.1:${address.port}`;
  return { ...app, base, async close() { app.server.close(); app.server.closeAllConnections(); await once(app.server, 'close'); app.db.close(); } };
}
function client(base: string) {
  let cookie = '';
  return { get cookie() { return cookie; }, set cookie(value: string) { cookie = value; },
    async request(path: string, method = 'GET', body?: unknown, requestOrigin: string | null = origin) {
      const headers: Record<string, string> = { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(requestOrigin ? { Origin: requestOrigin } : {}) };
      const response = await fetch(`${base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
      return { status: response.status, headers: response.headers, body: await response.json() };
    },
  };
}
test('real authentication, per-account DB isolation, optimistic conflicts, password rotation and deletion', async () => {
  const app = await start(); const alice = client(app.base); const bob = client(app.base); const otherDevice = client(app.base); const guest = client(app.base);
  try {
    assert.equal((await guest.request('/data')).status, 401);
    assert.equal((await guest.request('/auth/register', 'POST', { email: 'guest@example.test', password, name: 'Guest' }, null)).status, 403);
    assert.equal((await guest.request('/auth/register', 'POST', { email: 'guest@example.test', password, name: 'Guest' }, 'https://untrusted.example')).status, 403);
    const registered = await alice.request('/auth/register', 'POST', { email: 'Alice@Example.test', password, name: 'Alice' });
    assert.equal(registered.status, 201); assert.equal(registered.body.user.email, 'alice@example.test');
    assert(!registered.body.user.password_hash); assert(registered.headers.get('set-cookie')?.includes('HttpOnly'));
    assert(registered.headers.get('set-cookie')?.includes('SameSite=Lax'));
    const aliceId = registered.body.user.id;
    const row = app.db.prepare('SELECT password_hash,salt FROM users WHERE id=?').get(aliceId)!;
    assert.equal(String(row.password_hash).length, 64); assert.notEqual(row.password_hash, password); assert.equal(String(row.salt).length, 32);
    const data = { ...freshData(), favorites: ['matcha'], stock: { milk: 'have' as const } };
    const saved = await alice.request('/data', 'PUT', { data, revision: 0 });
    assert.equal(saved.status, 200); assert.equal(saved.body.revision, 1);
    assert.equal((await alice.request('/data', 'PUT', { data: freshData(), revision: 0 })).status, 409);
    assert.equal((await alice.request('/data', 'PUT', { data: { ...data, stock: { milk: 'invalid' } }, revision: 1 })).status, 400);
    assert.deepEqual((await alice.request('/data')).body.data, data);
    assert.equal((await bob.request('/auth/register', 'POST', { email: 'bob@example.test', password, name: 'Bob' })).status, 201);
    assert.deepEqual((await bob.request('/data')).body.data.favorites, []);
    const bobData = { ...freshData(), favorites: ['negroni'] };
    await bob.request('/data', 'PUT', { data: bobData, revision: 0, userId: aliceId });
    assert.deepEqual((await alice.request('/data')).body.data.favorites, ['matcha']);
    assert.equal((await otherDevice.request('/auth/login', 'POST', { email: 'alice@example.test', password: 'incorrect' })).status, 401);
    assert.equal((await otherDevice.request('/auth/login', 'POST', { email: 'alice@example.test', password })).status, 200);
    assert.deepEqual((await otherDevice.request('/data')).body.data.favorites, ['matcha']);
    assert.equal((await alice.request('/account', 'PATCH', { name: 'Alice Updated' })).body.user.name, 'Alice Updated');
    assert.equal((await alice.request('/account/password', 'POST', { currentPassword: password, password: 'new-long-test-passphrase' })).status, 200);
    assert.equal((await otherDevice.request('/data')).status, 401);
    assert.equal((await otherDevice.request('/auth/login', 'POST', { email: 'alice@example.test', password })).status, 401);
    assert.equal((await otherDevice.request('/auth/login', 'POST', { email: 'alice@example.test', password: 'new-long-test-passphrase' })).status, 200);
    assert.equal((await alice.request('/account', 'DELETE', { password: 'wrong' })).status, 401);
    assert.equal((await alice.request('/account', 'DELETE', { password: 'new-long-test-passphrase' })).status, 200);
    assert.equal((await otherDevice.request('/data')).status, 401);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM user_data WHERE user_id=?').get(aliceId)!.n, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(aliceId)!.n, 0);
    assert.deepEqual((await bob.request('/data')).body.data.favorites, ['negroni']);
    const oldCookie = bob.cookie;
    await bob.request('/auth/logout', 'POST', {}); bob.cookie = oldCookie;
    assert.equal((await bob.request('/data')).status, 401);
    assert.equal((await guest.request('/recipes')).body.recipes.length, 24);
  } finally { await app.close(); }
});
test('SQLite file retains accounts, sessions, recipes and user records after server restart', async () => {
  await mkdir('test-results', { recursive: true });
  const path = resolve('test-results', `persistence-${randomUUID()}.sqlite`);
  let app = await start(path); const user = client(app.base); let closed = false;
  try {
    await user.request('/auth/register', 'POST', { email: 'persist@example.test', name: 'Persistent', password });
    const data = { ...freshData(), favorites: ['matcha', 'gin-tonic'] };
    await user.request('/data', 'PUT', { data, revision: 0 }); const cookie = user.cookie;
    await app.close(); closed = true;
    app = await start(path); closed = false;
    const restored = client(app.base); restored.cookie = cookie;
    const session = await restored.request('/auth/session');
    assert.equal(session.body.user.email, 'persist@example.test');
    assert.deepEqual(session.body.workspace.data.favorites, ['matcha', 'gin-tonic']);
    assert.equal(session.body.workspace.revision, 1);
    assert.equal((await restored.request('/recipes')).body.recipes.length, 24);
  } finally {
    if (!closed) await app.close();
    for (const suffix of ['', '-shm', '-wal']) await unlink(path + suffix).catch(() => {});
  }
});
test('auth throttling persists in SQLite and unknown users do not leak through login errors', async () => {
  const app = await start(); const user = client(app.base);
  try {
    const missing = await user.request('/auth/login', 'POST', { email: 'missing@example.test', password });
    assert.equal(missing.status, 401); assert.equal(missing.body.error, '邮箱或密码不正确。');
    for (let i = 0; i < 12; i++) await user.request('/auth/login', 'POST', { email: 'limited@example.test', password: 'wrong' });
    const limited = await user.request('/auth/login', 'POST', { email: 'limited@example.test', password: 'wrong' });
    assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '900');
  } finally { await app.close(); }
});
