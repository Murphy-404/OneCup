import {freshData,validateBackup,type UserData} from './logic';
export const DATABASE_NAME='onecup-personal';
export const LEGACY_KEY='onecup.data.v1';
export interface LocalRecord {revision:number;data:UserData}
export class LocalConflict extends Error {constructor(){super('另一个页面已经更新本机记录，请先处理版本冲突。');}}
export interface LocalStore {read:()=>Promise<LocalRecord|null>;write:(data:UserData,expectedRevision:number)=>Promise<LocalRecord>;close:()=>void}
export function createLocalStore(factory:IDBFactory=globalThis.indexedDB,name=DATABASE_NAME):LocalStore{
 let connection:Promise<IDBDatabase>|undefined;
 function open(){
  if(!factory)return Promise.reject(new Error('当前浏览器无法使用 IndexedDB，请更换普通浏览窗口后重试。'));
  if(!connection)connection=new Promise<IDBDatabase>((resolve,reject)=>{
   const request=factory.open(name,1);let timedOut=false;
   const timeout=setTimeout(()=>{timedOut=true;connection=undefined;reject(new Error('本机数据库被其他页面占用，请关闭旧页面后重试。'));},5000);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('workspace'))request.result.createObjectStore('workspace');};
   request.onerror=()=>{clearTimeout(timeout);connection=undefined;reject(request.error??new Error('本机数据库打开失败。'));};
   request.onsuccess=()=>{clearTimeout(timeout);const db=request.result;if(timedOut){db.close();return;}db.onversionchange=()=>{db.close();connection=undefined;};resolve(db);};
  });return connection;
 }
 return {
  async read(){const db=await open();return new Promise<LocalRecord|null>((resolve,reject)=>{
   const tx=db.transaction('workspace','readonly');const request=tx.objectStore('workspace').get('current');let result:LocalRecord|null=null;let failure:unknown;
   request.onsuccess=()=>{try{if(request.result!==undefined){const record=request.result;if(!Number.isInteger(record.revision)||record.revision<1)throw Error('本机记录版本损坏，原数据未覆盖。');result={revision:record.revision,data:validateBackup(record.data)};}}catch(error){failure=error;tx.abort();}};
   tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(failure??tx.error??new Error('本机记录读取失败。'));
  });},
  async write(data,expectedRevision){const validated=structuredClone(validateBackup(data));const db=await open();return new Promise<LocalRecord>((resolve,reject)=>{
   const tx=db.transaction('workspace','readwrite');const store=tx.objectStore('workspace');const request=store.get('current');let result:LocalRecord;let failure:unknown;
   request.onsuccess=()=>{try{const revision=request.result?.revision??0;if(revision!==expectedRevision){failure=new LocalConflict();tx.abort();return;}result={revision:revision+1,data:validated};store.put(result,'current');}catch(error){failure=error;tx.abort();}};
   // put success is not enough: wait for the transaction to commit.
   tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(failure??tx.error??new Error('本机保存失败，可能空间不足或存储权限被关闭。'));
  });},
  close(){const current=connection;connection=undefined;current?.then(db=>db.close()).catch(()=>{});}
 };
}
export async function loadLocalWorkspace(store:LocalStore,legacy?:Pick<Storage,'getItem'>):Promise<LocalRecord&{migrated:boolean}>{
 const current=await store.read();if(current)return {...current,migrated:false};
 const raw=legacy?.getItem(LEGACY_KEY);if(!raw)return {revision:0,data:freshData(),migrated:false};
 const data=validateBackup(JSON.parse(raw));try{return {...await store.write(data,0),migrated:true};}catch(error){if(error instanceof LocalConflict){const record=await store.read();if(record)return {...record,migrated:false};}throw error;}
}
