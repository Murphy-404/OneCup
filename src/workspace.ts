import {useEffect,useRef,useState} from 'react';
import {freshData,validateBackup,type UserData} from './logic';
import {createLocalStore,loadLocalWorkspace,LocalConflict,type LocalStore} from './local-db';
type Sync={state:'loading'|'saved'|'saving'|'error'|'conflict';message:string};
export function useWorkspace(notify:(message:string)=>void){
 const [data,setData]=useState(freshData);const dataRef=useRef(data);const [ready,setReady]=useState(false);
 const [sync,setSync]=useState<Sync>({state:'loading',message:'正在读取本机记录…'});const syncRef=useRef(sync);
 const notice=useRef(notify);notice.current=notify;const revision=useRef(0);const store=useRef<LocalStore|null>(null);
 const channel=useRef<BroadcastChannel|null>(null);const queue=useRef<Promise<void>>(Promise.resolve());const blocked=useRef(false);const generation=useRef(0);const changeId=useRef(0);
 function status(value:Sync){syncRef.current=value;setSync(value);}
 function useData(next:UserData){dataRef.current=next;setData(next);}
 async function boot(){
  const current=++generation.current;setReady(false);blocked.current=true;status({state:'loading',message:'正在读取本机记录…'});
  try{if(!store.current)store.current=createLocalStore();const loaded=await loadLocalWorkspace(store.current,window.localStorage);if(current!==generation.current)return;
   revision.current=loaded.revision;useData(loaded.data);blocked.current=false;setReady(true);status({state:'saved',message:'记录保存在此浏览器'});if(loaded.migrated)notice.current('旧版本本地记录已迁移至 IndexedDB，旧记录保留。');
  }catch(error){if(current!==generation.current)return;status({state:'error',message:`本机记录读取失败：${error instanceof Error?error.message:'存储不可用'}。原数据未覆盖，可重试读取。`});}
 }
 useEffect(()=>{
  void boot();let active=true;
  if(typeof BroadcastChannel!=='undefined'){
   channel.current=new BroadcastChannel('onecup-personal-changes');channel.current.onmessage=async()=>{
    if(!active||!store.current||syncRef.current.state!=='saved')return;
    const ticket=changeId.current;
    try{const latest=await store.current.read();if(active&&ticket===changeId.current&&syncRef.current.state==='saved'&&latest&&latest.revision>revision.current){revision.current=latest.revision;useData(latest.data);status({state:'saved',message:'已读取其他页面的本机更新'});}}catch{/* A later save still checks the database revision. */}
   };
  }
  function warn(e:BeforeUnloadEvent){if(['saving','error','conflict'].includes(syncRef.current.state)){e.preventDefault();e.returnValue='';}}
  window.addEventListener('beforeunload',warn);
  return()=>{active=false;generation.current++;channel.current?.close();channel.current=null;window.removeEventListener('beforeunload',warn);};
 },[]);
 function enqueue(next:UserData){
  const ticket=++changeId.current,current=generation.current;status({state:'saving',message:'正在保存到本机数据库…'});
  queue.current=queue.current.then(async()=>{
   if(current!==generation.current||blocked.current||!store.current)return;
   try{const saved=await store.current.write(next,revision.current);if(current!==generation.current)return;revision.current=saved.revision;channel.current?.postMessage(saved.revision);
    if(ticket===changeId.current)status({state:'saved',message:'已保存到本机 IndexedDB'});
   }catch(error){if(current!==generation.current)return;blocked.current=true;const message=(error instanceof Error?error.message:'本机保存失败。')+' 当前修改仍在页面中，请先导出备份，再重试；未完成保存前不要关闭页面。';status({state:error instanceof LocalConflict?'conflict':'error',message});notice.current(message);}
  });
 }
 function persist(next:UserData){
  if(!ready){notice.current('本机记录尚未读取成功，请先重试读取；未覆盖原数据。');return false;}
  if(blocked.current){notice.current('请先处理保存失败或版本冲突，并导出当前记录。');return false;}
  try{const valid=structuredClone(validateBackup(next));useData(valid);enqueue(valid);return true;}catch(error){notice.current(error instanceof Error?error.message:'记录无效，未修改本机数据。');return false;}
 }
 function retrySave(){if(!ready){void boot();return;}if(syncRef.current.state==='conflict')return;blocked.current=false;enqueue(dataRef.current);}
 async function resolveConflict(choice:'local'|'remote'){
  if(!store.current)return;await queue.current;const latest=await store.current.read();revision.current=latest?.revision??0;blocked.current=false;
  if(choice==='remote'){useData(latest?.data??freshData());status({state:'saved',message:'已读取本机数据库版本'});}else enqueue(dataRef.current);
 }
 return {data,ready,sync,persist,retrySave,resolveConflict};
}
