import {validateBackup,type UserData} from '../src/logic';
export class D1Conflict extends Error{}
export function d1Store(db:D1Database){
 async function read(){
  return decode(await db.batch(readStatements()));
 }
 function readStatements(){return [db.prepare('SELECT revision,updated_at,chunk_count FROM workspace WHERE id=1'),db.prepare('SELECT position,payload FROM workspace_chunks WHERE revision=(SELECT revision FROM workspace WHERE id=1) ORDER BY position')];}
 function decode([meta,parts]:D1Result[]){
  const row=meta.results[0] as {revision:number;updated_at:string;chunk_count:number}|undefined;
  if(!row||!Number.isSafeInteger(row.revision)||row.revision<0||parts.results.length!==row.chunk_count||parts.results.some((p,i)=>(p as {position:number}).position!==i))throw Error('Database workspace is incomplete');
  return {data:validateBackup(JSON.parse(parts.results.map(p=>(p as {payload:string}).payload).join(''))),revision:row.revision,updatedAt:row.updated_at};
 }
 return {read,async write(data:UserData,expected:number){
  const payload=JSON.stringify(validateBackup(data));const commit=crypto.randomUUID();const next=expected+1;
  // Small chunks keep each D1 bound string well below its row-size limit, including UTF-8 Chinese text.
  const chunks=payload.match(/[\s\S]{1,60000}/gu)??[];
  const inserts:D1PreparedStatement[]=[];for(let start=0;start<chunks.length;start+=20){const group=chunks.slice(start,start+20);inserts.push(db.prepare('WITH parts(revision,position,payload) AS (VALUES '+group.map(()=>'(?,?,?)').join(',')+') INSERT INTO workspace_chunks SELECT revision,position,payload FROM parts WHERE EXISTS(SELECT 1 FROM workspace WHERE id=1 AND commit_key=?)').bind(...group.flatMap((part,i)=>[next,start+i,part]),commit));}
  const statements=[db.prepare('UPDATE workspace SET revision=?,updated_at=?,chunk_count=?,commit_key=? WHERE id=1 AND revision=?').bind(next,new Date().toISOString(),chunks.length,commit,expected),...inserts,db.prepare('DELETE FROM workspace_chunks WHERE revision<>? AND EXISTS(SELECT 1 FROM workspace WHERE id=1 AND commit_key=?)').bind(next,commit),...readStatements()];
  const result=await db.batch(statements);
  const current=decode(result.slice(-2));if(result[0].meta.changes!==1&&JSON.stringify(current.data)!==payload)throw new D1Conflict('其他页面或设备已更新记录，请处理版本冲突。');
  return current;
 }};
}
