import {resolve,dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {openStore,readBackup} from './store';
const [command,input,...flags]=process.argv.slice(2);const database=process.env.DATABASE_PATH??resolve('data/onecup.sqlite');
if(!['backup','restore','verify'].includes(command)||!input)throw Error('Usage: cli.mjs backup <new.sqlite> | verify <backup.sqlite> | restore <backup.sqlite> --confirm-replace');
if(command==='verify'){readBackup(resolve(input));console.log('Backup integrity and workspace validation passed.');}
else if(command==='backup'){if(existsSync(resolve(input)))throw Error('备份目标已存在，请换一个新文件名。');const store=openStore(database);try{await store.backupTo(resolve(input));console.log('Consistent SQLite backup created.');}finally{store.close();}}
else{
 if(!flags.includes('--confirm-replace'))throw Error('恢复会替换此实例全部记录；先备份并使用 --confirm-replace 明确确认。');
 const data=readBackup(resolve(input));const store=openStore(database);try{const current=store.read();const before=join(dirname(resolve(database)),'backups','before-restore-'+Date.now()+'-'+randomUUID()+'.sqlite');await store.backupTo(before);store.write(data,current.revision);console.log('Restored workspace; automatic before-restore snapshot retained.');}finally{store.close();}
}
