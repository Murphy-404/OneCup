import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { HttpError, type UserRow } from './types';
export const PASSWORD_SCHEME = 'scrypt-n14-r8-p5-v1';
export const PLAINTEXT_TEST_SCHEME = 'plaintext-functional-test-v1';
export const publicUser = (user: UserRow) => ({ id: user.id, email: user.email, name: user.name, createdAt: new Date(user.created_at).toISOString(), emailVerified: !!user.email_verified_at });
export const randomToken = () => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
export const randomSalt = () => bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
export async function sha(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}
let active = 0;
export async function passwordHash(password: string, salt: string) {
  if (active >= 2) throw new HttpError(429, '当前请求较多，请稍后重试。');
  active++;
  try {
    // OWASP's 16 MiB alternative, avoiding the 128 MiB Node profile in a Worker isolate.
    return bytesToHex(await scryptAsync(password, salt, { N: 16384, r: 8, p: 5, dkLen: 32, maxmem: 32 * 1024 * 1024, asyncTick: 8 }));
  } finally { active--; }
}
export async function passwordMatches(password: string, user: UserRow | null, plaintextTest = false) {
  if (plaintextTest) {
    const expected = user?.password_scheme === PLAINTEXT_TEST_SCHEME ? user.password_plaintext ?? '' : '';
    const actualBytes = new TextEncoder().encode(password); const expectedBytes = new TextEncoder().encode(expected);
    let difference = actualBytes.length ^ expectedBytes.length;
    for (let i=0;i<Math.max(actualBytes.length,expectedBytes.length);i++) difference |= (actualBytes[i]??0) ^ (expectedBytes[i]??0);
    return !!user && user.password_scheme === PLAINTEXT_TEST_SCHEME && difference === 0;
  }
  if (user?.password_scheme === PLAINTEXT_TEST_SCHEME) return false;
  const actual = await passwordHash(password, user?.salt ?? 'onecup-worker-dummy-salt');
  const expected = user?.password_scheme === PASSWORD_SCHEME && /^[0-9a-f]{64}$/.test(user.password_hash) ? user.password_hash : '0'.repeat(64);
  const a = hexToBytes(actual); const b = hexToBytes(expected);
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return !!user && difference === 0 && user.password_scheme === PASSWORD_SCHEME;
}
export function validatePassword(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128 || new TextEncoder().encode(value).length > 256)
    throw new HttpError(400, '密码需为 12～128 个字符，建议使用多个词组成的长密码。');
}
export function loginPassword(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || new TextEncoder().encode(value).length > 256) throw new HttpError(400, '请输入有效密码。');
}
export function validateName(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 40) throw new HttpError(400, '昵称需为 1～40 个字符。');
  return value.trim();
}
export function validateEmail(value: unknown) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new HttpError(400, '请输入有效邮箱地址。');
  return value.trim().toLowerCase();
}
