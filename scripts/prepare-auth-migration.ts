import {DatabaseSync} from 'node:sqlite';
import {scryptSync,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
export function credentialMigration(db:DatabaseSync){
 const rows=db.prepare("SELECT id,password_plaintext,auth_version,credential_nonce FROM users WHERE password_scheme='plaintext-functional-test-v1'").all();
 const sql:string[]=['-- Prepared offline. Apply only during a maintenance window after email and CPU readiness checks.'];
 for(const row of rows){
  if(typeof row.password_plaintext!=='string'||!row.password_plaintext)throw Error('测试凭据不完整，停止准备。');
  const salt=randomBytes(16).toString('hex');
  const hash=scryptSync(row.password_plaintext,salt,32,{N:16384,r:8,p:5,maxmem:32*1024*1024}).toString('hex');const nonce=randomUUID();
  // No plaintext is written. The nonce/version guard prevents overwriting intervening password changes.
  const guard=`id=${quote(String(row.id))} AND auth_version=${Number(row.auth_version)} AND credential_nonce=${quote(String(row.credential_nonce))} AND password_scheme='plaintext-functional-test-v1'`;
  sql.push(`UPDATE users SET password_hash=${quote(hash)},salt=${quote(salt)},password_scheme='scrypt-n14-r8-p5-v1',password_plaintext=NULL,auth_version=auth_version+1,credential_nonce=${quote(nonce)} WHERE ${guard};`);
  const migrated=`SELECT id FROM users WHERE id=${quote(String(row.id))} AND credential_nonce=${quote(nonce)}`;
  sql.push(`DELETE FROM sessions WHERE user_id IN (${migrated});`,`DELETE FROM email_tokens WHERE user_id IN (${migrated});`);
 }
 return {sql:sql.join('\n'),count:rows.length};
}
async function main(){
 const [source,output]=process.argv.slice(2);if(!source||!output||!resolve(output).startsWith(resolve('.private')+'\\')&& !resolve(output).startsWith(resolve('.private')+'/'))throw Error('Output must be inside .private; usage: tsx scripts/prepare-auth-migration.ts <restored.sqlite> .private/auth-migration.sql');
 const db=new DatabaseSync(resolve(source),{readOnly:true});let result;try{result=credentialMigration(db);}finally{db.close();}
 await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(resolve(output),result.sql,{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({prepared:result.count,applied:false,note:'Existing users must verify email in secure mode. No production records or configuration changed.'}));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/prepare-auth-migration.ts'))main().catch(()=>{console.error('迁移准备失败，未修改生产数据库；不输出凭据。');process.exitCode=1;});
