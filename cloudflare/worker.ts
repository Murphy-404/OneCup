import {validateBackup} from '../src/logic';
import {d1Store,D1Conflict} from './store';
interface Env {DB:D1Database;ASSETS:Fetcher;APP_ORIGIN:string;WORKSPACE_MODE?:string}
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function body(request:Request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw Object.assign(Error('请使用 JSON 请求。'),{status:415});
 const reader=request.body?.getReader();if(!reader)throw Object.assign(Error('请求内容为空。'),{status:400});let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>5_000_000){await reader.cancel();throw Object.assign(Error('记录不能超过 5 MB。'),{status:413});}chunks.push(value);}}finally{reader.releaseLock();}
 const buffer=new Uint8Array(size);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}try{const value=JSON.parse(new TextDecoder().decode(buffer));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw Object.assign(Error('JSON 格式无效。'),{status:400});}
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);const readOnly=env.WORKSPACE_MODE!=='editable';const store=d1Store(env.DB);
  try{
   if(url.pathname==='/healthz'){await store.read();return new Response('ok\n',{headers:{'Cache-Control':'no-store'}});}
   if(url.pathname.startsWith('/api/')){
    const origin=request.headers.get('Origin');
    if(url.origin!==env.APP_ORIGIN||request.headers.get('Sec-Fetch-Site')==='cross-site'||(origin&&origin!==env.APP_ORIGIN))return json({error:'请求来源不受信任。'},403);
    if(url.pathname==='/api/workspace'){
     if(request.method==='GET')return json({...await store.read(),storage:'d1',readOnly});
     if(request.method!=='PUT')return json({error:'方法不支持。'},405);
     if(readOnly)return json({error:'此站点为公开只读演示，不能修改服务器记录。请自部署个人实例。'},403);
     const input=await body(request);let data;try{data=validateBackup(input.data);}catch(error){throw Object.assign(error as Error,{status:400});}
     if(!Number.isSafeInteger(input.revision)||input.revision<0)return json({error:'记录版本无效。'},400);
     return json({...await store.write(data,input.revision),storage:'d1',readOnly});
    }
    if(url.pathname==='/api/backup'&&request.method==='GET'){const response=json((await store.read()).data);response.headers.set('Content-Disposition','attachment; filename="onecup-d1-backup.json"');return response;}
    return json({error:'接口不存在。'},404);
   }
   return env.ASSETS.fetch(request);
  }catch(error){const e=error as Error&{status?:number};const status=error instanceof D1Conflict?409:e.status??500;return json({error:status===500?'服务器读取或保存失败，请导出当前页面记录后重试。':e.message},status);}
 }
} satisfies ExportedHandler<Env>;
