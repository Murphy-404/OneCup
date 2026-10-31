import { useEffect, useRef, useState } from 'react';
import { apiRequest, ApiError, type AccountUser, type AuthenticatedSession, type Workspace } from './api';
import { freshData, validateBackup, type UserData } from './logic';
const GUEST_KEY = 'onecup.data.v1';
const accountKey = (id: string) => `onecup.account.${id}.v1`;
type Sync = { state: 'guest' | 'loading' | 'saved' | 'saving' | 'error' | 'conflict'; message: string };
interface Cache { data: UserData; revision: number; dirty: boolean }
function loadGuest() {
  try { const raw = localStorage.getItem(GUEST_KEY); return { data: raw ? validateBackup(JSON.parse(raw)) : freshData(), error: '' }; }
  catch { return { data: freshData(), error: '本地游客记录读取失败，建议先恢复备份。保存新记录将替换旧记录。' }; }
}
function loadAccount(id: string): Cache | null {
  try {
    const raw = localStorage.getItem(accountKey(id)); if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Number.isInteger(parsed.revision) || parsed.revision < 0 || typeof parsed.dirty !== 'boolean') return null;
    return { data: validateBackup(parsed.data), revision: parsed.revision, dirty: parsed.dirty };
  } catch { return null; }
}
function cacheAccount(id: string, value: Cache) {
  try { localStorage.setItem(accountKey(id), JSON.stringify(value)); return true; } catch { return false; }
}
export function mergeGuestRecords(account: UserData, guest: UserData): UserData {
  const stock = { ...guest.stock };
  for (const [id, status] of Object.entries(account.stock)) if (status !== 'unknown') stock[id] = status;
  function mergeById<T extends {id:string}>(current:T[], incoming:T[]):T[]{
    const merged=[...current];
    for(const item of incoming){
      const existing=merged.find(v=>v.id===item.id);
      if(!existing)merged.push(item);
      else if(JSON.stringify(existing)!==JSON.stringify(item)){
        const {id:ignored,...incoming}=item;
        if(!merged.some(record=>{const {id:_,...content}=record;return JSON.stringify(content)===JSON.stringify(incoming);}))merged.push({...item,id:crypto.randomUUID()});
      }
    }
    return merged;
  }
  const versions=mergeById(account.versions,guest.versions);
  const plan=mergeById(account.plan,guest.plan);
  const coffeeRecords=mergeById(account.coffeeRecords,guest.coffeeRecords);
  const equipment={...guest.equipment,...Object.fromEntries(Object.entries(account.equipment).filter(([,s])=>s!=='unknown'))};
  return validateBackup({ ...account, favorites: [...new Set([...account.favorites, ...guest.favorites])], stock, equipment, versions, plan,coffeeRecords });
}
export function useWorkspace(notify: (message: string) => void) {
  const [boot] = useState(loadGuest);
  const [data, setData] = useState(boot.data);
  const dataRef = useRef(data); const guestRef = useRef(boot.data);
  const [user, setUser] = useState<AccountUser | null>(null); const userRef = useRef<AccountUser | null>(null);
  const [ready, setReady] = useState(false); const [authError, setAuthError] = useState('');
  const [sync, setSync] = useState<Sync>({ state: 'loading', message: '正在连接数据服务…' });
  const syncRef = useRef(sync); const revision = useRef(0); const generation = useRef(0);
  const chain = useRef(Promise.resolve()); const blocked = useRef(false); const notice = useRef(notify); notice.current = notify;
  function updateSync(value: Sync) { syncRef.current = value; setSync(value); }
  function useData(value: UserData) { dataRef.current = value; setData(value); }
  function enqueue(next: UserData) {
    const id = userRef.current?.id; const currentGeneration = generation.current;
    if (!id || blocked.current) return;
    updateSync({ state: 'saving', message: '正在保存到数据库…' });
    chain.current = chain.current.then(async () => {
      if (generation.current !== currentGeneration || blocked.current) return;
      try {
        const result = await apiRequest<Workspace>('/data', 'PUT', { data: next, revision: revision.current });
        if (generation.current !== currentGeneration) return;
        revision.current = result.revision;
        const isLatest = dataRef.current === next;
        cacheAccount(id, { data: dataRef.current, revision: result.revision, dirty: !isLatest });
        if (isLatest) updateSync({ state: 'saved', message: '已保存到数据库' });
      } catch (error) {
        if (generation.current !== currentGeneration) return;
        blocked.current = true;
        const cached=cacheAccount(id, { data: dataRef.current, revision: revision.current, dirty: true });
        const message = (error instanceof Error ? error.message : '保存失败。')+(cached?' 修改已缓存于此设备，可重试保存。':' 浏览器缓存也失败，修改仅在当前页面，请立即导出备份，勿刷新或退出。');
        updateSync({ state: error instanceof ApiError && error.status === 409 ? 'conflict' : 'error', message });
        notice.current(message);
      }
    });
  }
  function acceptSession(value: AuthenticatedSession) {
    const remote = validateBackup(value.workspace.data);
    generation.current++; blocked.current = false; chain.current = Promise.resolve();
    userRef.current = value.user; setUser(value.user); revision.current = value.workspace.revision;
    const cached = loadAccount(value.user.id);
    if (cached?.dirty) {
      useData(cached.data);
      if (cached.revision === value.workspace.revision) enqueue(cached.data);
      else {
        blocked.current = true;
        updateSync({ state: 'conflict', message: '此设备有待保存的修改，数据库也有更新。请选择保留哪个版本。' });
      }
    } else {
      useData(remote); cacheAccount(value.user.id, { data: remote, revision: value.workspace.revision, dirty: false });
      updateSync({ state: 'saved', message: '已保存到数据库' });
    }
    setReady(true); setAuthError('');
  }
  useEffect(() => {
    let cancelled = false;
    apiRequest<AuthenticatedSession | { user: null }>('/auth/session').then(result => {
      if (cancelled) return;
      if (result.user) acceptSession(result);
      else { setReady(true); updateSync({ state: 'guest', message: '游客模式 · 仅保存在此设备' }); }
    }).catch(error => {
      if (cancelled) return;
      setReady(true); setAuthError(error.message);
      updateSync({ state: 'guest', message: '游客模式 · 数据服务未连接' });
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (userRef.current && ['saving', 'error', 'conflict'].includes(syncRef.current.state)) { e.preventDefault(); e.returnValue = ''; }
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  function persist(next: UserData) {
    if (!ready) { notice.current('正在确认账号，请稍后再操作。'); return false; }
    if (!userRef.current) {
      try { localStorage.setItem(GUEST_KEY, JSON.stringify(next)); guestRef.current = next; useData(next); return true; }
      catch { notice.current('保存失败，可能是浏览器存储已满。请导出备份后重试，当前输入已保留。'); return false; }
    }
    if(!cacheAccount(userRef.current.id, { data: next, revision: revision.current, dirty: true })){
      notice.current('浏览器缓存失败，当前输入已保留。请导出备份并清理存储后重试。');return false;
    }
    useData(next); enqueue(next); return true;
  }
  function resetToGuest() {
    const oldId = userRef.current?.id;
    if (oldId && syncRef.current.state === 'saved') { try { localStorage.removeItem(accountKey(oldId)); } catch { /* no destructive fallback */ } }
    generation.current++; blocked.current = false; chain.current = Promise.resolve(); userRef.current = null; setUser(null);
    useData(guestRef.current); updateSync({ state: 'guest', message: '游客模式 · 仅保存在此设备' });
  }
  async function logout() {
    if (syncRef.current.state === 'saving') throw Error('正在保存，请稍后再退出。');
    if (['error', 'conflict'].includes(syncRef.current.state) && !window.confirm('账号仍有未同步的修改。确定退出吗？请先导出备份，缓存失败时退出可能丢失修改。')) return false;
    await apiRequest('/auth/logout', 'POST', {}); resetToGuest(); return true;
  }
  function updateUser(value: AccountUser) { userRef.current = value; setUser(value); }
  function mergeGuest() { try { return persist(mergeGuestRecords(dataRef.current, guestRef.current)); } catch (error) { notice.current((error as Error).message); return false; } }
  function retrySync() { if (!userRef.current) return; blocked.current = false; enqueue(dataRef.current); }
  async function resolveConflict(choice: 'local' | 'remote') {
    const id = userRef.current?.id; if (!id) return;
    const currentGeneration = generation.current;
    const result = await apiRequest<Workspace>('/data');
    if (currentGeneration !== generation.current) return;
    revision.current = result.revision;
    if (choice === 'remote') {
      const remote = validateBackup(result.data); useData(remote); blocked.current = false;
      cacheAccount(id, { data: remote, revision: result.revision, dirty: false });
      updateSync({ state: 'saved', message: '已读取数据库最新版本' });
    } else { blocked.current = false; enqueue(dataRef.current); }
  }
  function afterDelete() {
    const id = userRef.current?.id; if (id) { try { localStorage.removeItem(accountKey(id)); } catch { /* account removed on server */ } }
    resetToGuest();
  }
  const guestCount = guestRef.current.favorites.length + guestRef.current.versions.length + guestRef.current.plan.length + guestRef.current.coffeeRecords.length + Object.keys(guestRef.current.equipment).length + Object.keys(guestRef.current.stock).length;
  return { data, user, ready, sync, authError, storeError: boot.error, persist, acceptSession, logout, updateUser, mergeGuest, guestCount, retrySync, resolveConflict, afterDelete, resetToGuest };
}
