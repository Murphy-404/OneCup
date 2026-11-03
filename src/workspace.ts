import {assertWorkspaceFits} from './photo';
import {useEffect,useRef,useState} from 'react';
import {freshData,validateBackup,type UserData} from './logic';
import {LocalConflict,type LocalStore} from './local-db';
import {createServerStore} from './server-store';
type Sync={state:'loading'|'saved'|'saving'|'error'|'conflict';message:string};
export function useWorkspace(notify:(message:string)=>void){
 const [data,setData]=useState(freshData);const dataRef=useRef(data);const [ready,setReady]=useState(false);
 const [service,setService]=useState({storageLabel:'服务器 SQLite',readOnly:false});const serviceRef=useRef(service);
 const [sync,setSync]=useState<Sync>({state:'loading',message:'正在读取服务器记录…'});const syncRef=useRef(sync);
 const notice=useRef(notify);notice.current=notify;const revision=useRef(0);const store=useRef<LocalStore|null>(null);
 const channel=useRef<BroadcastChannel|null>(null);const queue=useRef<Promise<void>>(Promise.resolve());const blocked=useRef(false);const dirty=useRef(false);const generation=useRef(0);const changeId=useRef(0);
 function status(value:Sync){syncRef.current=value;setSync(value);}
 function useData(next:UserData){dataRef.current=next;setData(next);}
 async function boot(){
  const current=++generation.current;setReady(false);blocked.current=true;status({state:'loading',message:'正在读取服务器记录…'});
  try{if(!store.current)store.current=createServerStore();const loaded=await store.current.read();if(!loaded)throw Error('服务器没有返回工作区。');if(current!==generation.current)return;
   serviceRef.current={storageLabel:loaded.storage==='d1'?'Cloudflare D1':'服务器 SQLite',readOnly:loaded.readOnly===true};setService(serviceRef.current);revision.current=loaded.revision;useData(loaded.data);blocked.current=false;setReady(true);dirty.current=false;status({state:'saved',message:serviceRef.current.readOnly?'公开只读演示 · 数据来自 Cloudflare D1':`记录保存在此实例的${serviceRef.current.storageLabel}`});
  }catch(error){if(current!==generation.current)return;status({state:'error',message:`服务器记录读取失败：${error instanceof Error?error.message:'存储不可用'}。原数据未覆盖，可重试读取。`});}
 }
 useEffect(()=>{
  void boot();let active=true;
  async function refresh(){
    if(!active||!store.current||serviceRef.current.readOnly||syncRef.current.state!=='saved')return;
    const ticket=changeId.current;
    try{const latest=await store.current.read();if(active&&ticket===changeId.current&&syncRef.current.state==='saved'&&latest&&latest.revision>revision.current){revision.current=latest.revision;useData(latest.data);status({state:'saved',message:'已读取其他设备的更新'});}}catch{/* A later save still checks the database revision. */}
   }
  if(typeof BroadcastChannel!=='undefined'){channel.current=new BroadcastChannel('onecup-personal-server-changes');channel.current.onmessage=()=>void refresh();}
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},15000);
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};document.addEventListener('visibilitychange',visible);
  function warn(e:BeforeUnloadEvent){if(dirty.current){e.preventDefault();e.returnValue='';}}
  window.addEventListener('beforeunload',warn);
  return()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);generation.current++;channel.current?.close();channel.current=null;window.removeEventListener('beforeunload',warn);};
 },[]);
 function enqueue(next:UserData){
  const ticket=++changeId.current,current=generation.current;dirty.current=true;status({state:'saving',message:'正在保存到服务器数据库…'});
  queue.current=queue.current.then(async()=>{
   if(current!==generation.current||blocked.current||!store.current)return;
   try{const saved=await store.current.write(next,revision.current);if(current!==generation.current)return;revision.current=saved.revision;channel.current?.postMessage(saved.revision);
    if(ticket===changeId.current){dirty.current=false;status({state:'saved',message:`已持久保存到${serviceRef.current.storageLabel}`});}
   }catch(error){if(current!==generation.current)return;blocked.current=true;const message=(error instanceof Error?error.message:'服务器保存失败。')+' 当前修改仍在页面中，请先导出备份，再重试；未完成保存前不要关闭页面。';status({state:error instanceof LocalConflict?'conflict':'error',message});notice.current(message);}
  });
 }
 function persist(next:UserData){
  if(serviceRef.current.readOnly){notice.current('此站点为公开只读演示。请自部署个人实例后保存记录。');return false;}
  if(!ready){notice.current('服务器记录尚未读取成功，请先重试读取；未覆盖原数据。');return false;}
  if(blocked.current){notice.current('请先处理保存失败或版本冲突，并导出当前记录。');return false;}
  try{const valid=structuredClone(validateBackup(next));assertWorkspaceFits(valid,4_999_000);useData(valid);enqueue(valid);return true;}catch(error){notice.current(error instanceof Error?error.message:'记录无效，未修改服务器数据。');return false;}
 }
 function retrySave(){if(!ready){void boot();return;}if(syncRef.current.state==='conflict')return;blocked.current=false;enqueue(dataRef.current);}
 async function resolveConflict(choice:'local'|'remote'){
  if(!store.current)return;await queue.current;const latest=await store.current.read();revision.current=latest?.revision??0;blocked.current=false;
  if(choice==='remote'){dirty.current=false;useData(latest?.data??freshData());status({state:'saved',message:'已读取服务器数据库版本'});}else enqueue(dataRef.current);
 }
 return {data,ready,sync,...service,persist,retrySave,resolveConflict};
}
