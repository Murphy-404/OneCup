import type { UserData } from './logic';
export interface AccountUser { id: string; email: string; name: string; createdAt: string }
export interface Workspace { data: UserData; revision: number; updatedAt: string }
export interface AuthenticatedSession { user: AccountUser; workspace: Workspace }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function apiRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method, credentials: 'same-origin', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new ApiError(0, '无法连接数据服务。请确认后端已启动，当前输入仍保留。'); }
  let data;
  try { data = await response.json(); } catch { throw new ApiError(response.status, '数据服务暂不可用，请稍后重试。'); }
  if (!response.ok) throw new ApiError(response.status, data.error ?? '请求失败，请重试。');
  return data as T;
}
