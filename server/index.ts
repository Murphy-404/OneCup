import {resolve,dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApplication} from './app';
const databasePath=process.env.DATABASE_PATH??resolve('data/onecup.sqlite');
const port=Number(process.env.PORT??8080);if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT 无效。');
const {server,store}=createApplication({databasePath,staticDirectory:process.env.STATIC_DIRECTORY??resolve('dist'),origin:process.env.ONECUP_ORIGIN||undefined});
const hours=Number(process.env.ONECUP_AUTO_BACKUP_HOURS??24);if(!Number.isInteger(hours)||hours<0||hours>168)throw Error('备份间隔需为 0～168 小时。');
const backupDirectory=process.env.BACKUP_DIRECTORY??join(dirname(resolve(databasePath)),'backups');let backingUp=false;
async function snapshot(){if(backingUp)return;backingUp=true;try{const name='auto-'+new Date().toISOString().replaceAll(':','-')+'-'+randomUUID()+'.sqlite';await store.backupTo(join(backupDirectory,name));console.log('Server database backup completed.');}catch{console.error('Automatic backup failed; inspect backup directory permissions and free space.');}finally{backingUp=false;}}
const timer=hours>0?setInterval(()=>void snapshot(),hours*3600000):null;timer?.unref();
server.listen(port,process.env.HOST??'127.0.0.1',()=>{console.log(`OneCup single-user server on port ${port}; SQLite: ${databasePath}`);if(hours>0)void snapshot();});
function stop(){if(timer)clearInterval(timer);server.close(()=>{const close=()=>{if(backingUp){setTimeout(close,50);return;}store.close();};close();});server.closeIdleConnections();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
