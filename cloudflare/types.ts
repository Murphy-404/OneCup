export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: 'local' | 'production';
  APP_ORIGIN: string;
  EMAIL_FROM: string;
  DEV_EMAILS?: string;
  PLAINTEXT_PASSWORD_TEST?: string;
  RESEND_API_KEY?: string;
  EMAIL?: { send(message: {from:string;to:string;subject:string;text:string}): Promise<unknown> };
}
export interface UserRow {
  id: string; email: string; name: string; password_hash: string; salt: string;
  password_scheme: string; auth_version: number; credential_nonce: string;
  email_verified_at: number | null; created_at: number;
  password_plaintext?: string | null;
}
export interface SessionRow extends UserRow { token_hash: string }
export interface EmailTokenRow {
  token_hash: string; user_id: string; purpose: 'verify' | 'reset'; auth_version: number;
  expires_at: number; used_at: number | null; claim_id: string | null;
}
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
