import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {validateBackup} from '../src/logic';
import {openStore,StoreConflict} from './store';

export function createApplication(options:{databasePath:string;staticDirectory?:string;origin?:string}){
 const configured=options.origin?new URL(options.origin):null;if(configured&&(!['http:','https:'].includes(configured.protocol)||configured.origin!==options.origin))throw Error('ONECUP_ORIGIN 需为完整 HTTP(S) 来源，不带路径。');
 const store=openStore(options.databasePath);const directory=resolve(options.staticDirectory??'dist');
 function json(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
 async function body(req:IncomingMessage){if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('请使用 JSON 请求。'),{status:415});
  return new Promise<Record<string,unknown>>((done,fail)=>{let size=0,settled=false;const chunks:Buffer[]=[];req.on('data',chunk=>{if(settled)return;size+=chunk.length;if(size>5*1024*1024){settled=true;chunks.length=0;fail(Object.assign(Error('记录不能超过 5 MB。'),{status:413}));return;}chunks.push(chunk);});req.on('end',()=>{if(settled)return;try{const value=JSON.parse(Buffer.concat(chunks).toString());if(!value||Array.isArray(value)||typeof value!=='object')throw Error();done(value);}catch{fail(Object.assign(Error('JSON 格式无效。'),{status:400}));}});req.on('error',fail);});
 }
 const server=createServer(async(req,res)=>{
  try{
   const host=req.headers.host??'';let incoming:URL;try{incoming=new URL(`http://${host}`);}catch{json(res,400,{error:'Host 无效。'});return;}
   const url=new URL(req.url??'/',incoming);
   if(url.pathname==='/healthz'){store.read();res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('ok\n');return;}
   if(url.pathname.startsWith('/api/')){
    const trusted=['127.0.0.1','localhost','[::1]'].includes(incoming.hostname)||(configured?.host===incoming.host);
    const origin=req.headers.origin;
    if(!trusted||req.headers['sec-fetch-site']==='cross-site'||(origin&&origin!==incoming.origin&&origin!==configured?.origin)){json(res,403,{error:'仅允许配置来源和可信设备访问此单用户实例。'});return;}
    if(url.pathname==='/api/workspace'){
     if(req.method==='GET'){json(res,200,store.read());return;}
     if(req.method==='PUT'){const input=await body(req);let value;try{value=validateBackup(input.data);}catch(error){throw Object.assign(error as Error,{status:400});}const revision=input.revision;if(!Number.isSafeInteger(revision)||Number(revision)<0){json(res,400,{error:'记录版本无效。'});return;}json(res,200,store.write(value,Number(revision)));return;}
     json(res,405,{error:'方法不支持。'});return;
    }
    if(url.pathname==='/api/backup'&&req.method==='GET'){res.setHeader('Content-Disposition','attachment; filename="onecup-server-backup.json"');json(res,200,store.read().data);return;}
    json(res,404,{error:'此实例没有账号 API。'});return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{error:'方法不支持。'});return;}
   let pathname:string;try{pathname=decodeURIComponent(url.pathname);}catch{json(res,400,{error:'路径无效。'});return;}
   let file=resolve(directory,pathname==='/'?'index.html':'.'+pathname);if(file!==directory&&!file.startsWith(directory+sep)){json(res,403,{error:'路径不可访问。'});return;}
   try{if(!(await stat(file)).isFile())throw Error();}catch{if(extname(pathname)){json(res,404,{error:'资源不存在。'});return;}file=resolve(directory,'index.html');}
   const content=await readFile(file);const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
   res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':file.includes(sep+'assets'+sep)?'public, max-age=31536000, immutable':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
  }catch(error){if(res.headersSent){res.end();return;}const e=error as Error&{status?:number};const status=error instanceof StoreConflict?409:e.status??500;json(res,status,{error:status===500?'服务器保存或读取失败。请导出当前页面记录并检查磁盘。':e.message});}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 return {server,store};
}
