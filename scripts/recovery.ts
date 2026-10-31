import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {validateBackup} from '../src/logic';
export function inspectRestoredDatabase(db:DatabaseSync){
 const integrity=db.prepare('PRAGMA integrity_check').all();
 if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok')throw Error('恢复后的数据库完整性检查失败。');
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('恢复后的账号关联关系不完整。');
 const rows=db.prepare('SELECT user_id,payload,revision FROM user_data ORDER BY user_id').all();
 for(const row of rows){validateBackup(JSON.parse(String(row.payload)));if(!Number.isInteger(row.revision)||Number(row.revision)<0)throw Error('记录版本无效。');}
 const tables=['users','user_data','recipe_catalog','sessions','email_tokens'];
 const counts=Object.fromEntries(tables.map(table=>[table,db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n]));
 // Hashes verify restored contents without logging emails, passwords or personal notes.
 const digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
 return {counts,workspaceDigest:digest};
}
export async function restoreDrill(sqlPath:string,outputDir:string){
 await mkdir(outputDir,{recursive:true});
 const sql=await readFile(sqlPath,'utf8');const path=join(outputDir,`recovery-${crypto.randomUUID()}.sqlite`);
 const restored=new DatabaseSync(path);
 let first;
 try{restored.exec(sql);first=inspectRestoredDatabase(restored);}finally{restored.close();}
 const reopened=new DatabaseSync(path,{readOnly:true});let second;
 try{second=inspectRestoredDatabase(reopened);}finally{reopened.close();}
 if(JSON.stringify(first)!==JSON.stringify(second))throw Error('数据库重新打开后内容不一致。');
 const report={at:new Date().toISOString(),sqlSha256:createHash('sha256').update(sql).digest('hex'),...second,checks:['SQL restored to isolated SQLite file','integrity_check','foreign_key_check','workspace schema validation','reopen content equality'],scope:'Local recovery drill; production D1 restore and deleted-user reconciliation require separate verification.'};
 await writeFile(join(outputDir,'recovery-report.json'),JSON.stringify(report,null,2),{mode:0o600});
 return report;
}
async function main(){
 const [command,pathArg]=process.argv.slice(2);const dir=resolve('.private/backups',new Date().toISOString().replaceAll(':','-'));
 if(command==='backup'){
  if(pathArg!=='--remote')throw Error('Use backup --remote to explicitly export production D1.');
  await mkdir(dir,{recursive:true});const target=join(dir,'database.sql');
  await new Promise<void>((done,fail)=>{const p=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','export','DB','--remote','--output',target],{stdio:['ignore','pipe','pipe']});let failed='';p.stderr.on('data',chunk=>{failed+=String(chunk);});p.on('error',fail);p.on('exit',code=>code===0?done():fail(Error(`D1 export failed (${code}). ${failed.slice(-1000)}`)));});
  const report=await restoreDrill(target,dir);console.log(JSON.stringify({backupDirectory:dir,...report},null,2));
 }else if(command==='verify'&&pathArg){console.log(JSON.stringify(await restoreDrill(resolve(pathArg),dir),null,2));}
 else throw Error('Usage: tsx scripts/recovery.ts backup --remote | verify <SQL dump>');
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/recovery.ts'))main().catch(()=>{console.error('备份或恢复演练失败，未修改生产数据库。请检查登录、D1 配置和备份文件；不输出数据库内容。');process.exitCode=1;});
