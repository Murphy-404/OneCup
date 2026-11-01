import {validateBackup,type UserData} from './logic';
import {LocalConflict,type LocalStore,type LocalRecord} from './local-db';
export function createServerStore():LocalStore{
 async function request(method:string,data?:UserData,revision?:number):Promise<LocalRecord>{
  const response=await fetch('/api/workspace',{method,headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify({data,revision}):undefined,signal:AbortSignal.timeout(15000)});
  let result;try{result=await response.json();}catch{throw Error('服务器返回无效，请确认已启动 SQLite 后端；未把浏览器记录视为保存成功。');}
  if(response.status===409)throw new LocalConflict();if(!response.ok)throw Error(result.error??'服务器暂不可用。');if(!Number.isSafeInteger(result.revision)||result.revision<0)throw Error('服务器记录版本无效。');
  return {data:validateBackup(result.data),revision:result.revision,...(result.storage==='d1'?{storage:'d1' as const,readOnly:result.readOnly===true}:{})};
 }
 return {read:()=>request('GET'),write:(data,revision)=>request('PUT',data,revision),close(){}};
}
