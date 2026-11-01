import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {freshData,validateBackup,type UserData} from '../src/logic';

export class StoreConflict extends Error{}
export function openStore(filename:string){
 if(filename!==':memory:')mkdirSync(dirname(resolve(filename)),{recursive:true,mode:0o700});
 const db=new DatabaseSync(filename);try{
  if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get())throw Error('这是旧账号数据库。请从旧版本导出 JSON 后导入，不直接复用账号库。');
  const version=Number(Object.values(db.prepare('PRAGMA user_version').get()!)[0]);if(version>1)throw Error('数据库版本较新，请升级程序；原数据未覆盖。');
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  db.exec('CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=0),updated_at TEXT NOT NULL);');
  db.prepare('INSERT OR IGNORE INTO workspace VALUES(1,?,0,?)').run(JSON.stringify(freshData()),new Date().toISOString());db.exec('PRAGMA user_version=1');
  if(filename!==':memory:')chmodSync(filename,0o600);
  function read(){const row=db.prepare('SELECT payload,revision,updated_at FROM workspace WHERE id=1').get()!;if(!Number.isInteger(row.revision)||Number(row.revision)<0)throw Error('数据库记录版本无效。');return {data:validateBackup(JSON.parse(String(row.payload))),revision:Number(row.revision),updatedAt:String(row.updated_at)};}
  read();
  return {db,read,
   write(data:UserData,expected:number){const valid=validateBackup(data);if(!Number.isSafeInteger(expected)||expected<0)throw Error('记录版本无效。');const payload=JSON.stringify(valid);
    const result=db.prepare('UPDATE workspace SET payload=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?').run(payload,new Date().toISOString(),expected);
    if(Number(result.changes)!==1){const current=read();if(JSON.stringify(current.data)===payload)return current;throw new StoreConflict('其他页面或设备已更新记录，请处理版本冲突。');}return read();},
   async backupTo(destination:string){if(filename!==':memory:'&&resolve(filename)===resolve(destination))throw Error('备份不能覆盖活动数据库。');mkdirSync(dirname(resolve(destination)),{recursive:true,mode:0o700});await backup(db,destination);chmodSync(destination,0o600);return destination;},
   close(){db.close();}
  };
 }catch(error){db.close();throw error;}
}
export function readBackup(filename:string){const db=new DatabaseSync(filename,{readOnly:true});try{const check=db.prepare('PRAGMA integrity_check').all();if(check.length!==1||Object.values(check[0])[0]!=='ok')throw Error('备份数据库完整性检查失败。');const row=db.prepare('SELECT payload FROM workspace WHERE id=1').get();if(!row)throw Error('备份缺少工作区。');return validateBackup(JSON.parse(String(row.payload)));}finally{db.close();}}
