import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {DatabaseSync} from 'node:sqlite';

const directory=await mkdtemp(join(tmpdir(),'onecup-go-smoke-'));
const binary=resolve('backend/bin/onecup'+(process.platform==='win32'?'.exe':''));
const contracts=JSON.parse(await readFile('backend/domain/testdata/contracts.json','utf8'));
const fixture=contracts.find(entry=>entry.name==='photos and frozen snapshots').expected;
let server;
async function port(){const socket=createServer();await new Promise(done=>socket.listen(0,'127.0.0.1',done));const value=socket.address().port;await new Promise(done=>socket.close(done));return value;}
function child(args,env){const processHandle=spawn(binary,args,{env,stdio:['ignore','pipe','pipe']});let output='';processHandle.stdout.on('data',data=>{output+=data;});processHandle.stderr.on('data',data=>{output+=data;});const closed=new Promise((done,fail)=>{processHandle.on('error',fail);processHandle.on('close',code=>done({code,output}));});return {processHandle,closed};}
async function start(database){const servicePort=await port();const base=`http://127.0.0.1:${servicePort}`;const env={...process.env,PATH:'',HOST:'127.0.0.1',PORT:String(servicePort),DATABASE_PATH:database,STATIC_DIRECTORY:resolve('dist'),ONECUP_ORIGIN:base,ONECUP_AUTO_BACKUP_HOURS:'0',BACKUP_DIRECTORY:join(directory,'backups')};server=child(['serve'],env);for(let attempt=0;attempt<100;attempt++){try{const response=await fetch(base+'/healthz',{signal:AbortSignal.timeout(500)});if(response.ok)return {base,env};}catch{}await new Promise(done=>setTimeout(done,50));}throw Error('Go server did not become ready');}
async function stop(){if(server){server.processHandle.kill();await server.closed;server=null;}}
async function command(args,env,expected=0){const result=await child(args,env).closed;assert.equal(result.code,expected,result.output);return result;}
try{
 const database=join(directory,'data.sqlite');let {base,env}=await start(database);
 const workspace=()=>fetch(base+'/api/workspace').then(r=>r.json());
 const put=(data,revision)=>fetch(base+'/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({data,revision})});
 assert.equal((await put(fixture,0)).status,200);
 const snapshot=join(directory,'snapshot.sqlite');await command(['backup',snapshot],env);await command(['verify',snapshot],env);
 assert.equal((await put({...fixture,theme:'clay'},1)).status,200);
 await command(['restore',snapshot],env,1);assert.equal((await workspace()).data.theme,'clay');
 await command(['restore',snapshot,'--confirm-replace'],env);const restored=await workspace();assert.equal(restored.revision,3);assert.deepEqual(restored.data,fixture);
 assert((await readdir(join(directory,'backups'))).some(file=>file.startsWith('before-restore-')));
 const html=await(await fetch(base)).text();assert(html.includes('id="root"'));assert.equal((await fetch(base+'/api/auth/session')).status,404);assert.equal((await fetch(base+'/assets/missing.js')).status,404);
 assert((await fetch(base+'/images/recipes/matcha.webp')).headers.get('content-type').startsWith('image/'));
 await stop();({base,env}=await start(database));assert.deepEqual((await workspace()).data,fixture);await stop();
 const legacy=join(directory,'node-legacy.sqlite');const old=new DatabaseSync(legacy);old.exec('CREATE TABLE workspace(id INTEGER PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL); PRAGMA user_version=1;');const oldCase=contracts.find(entry=>entry.name==='legacy v1');old.prepare('INSERT INTO workspace VALUES(1,?,9,?)').run(JSON.stringify(oldCase.input),'2026-01-01T00:00:00.000Z');old.close();({base,env}=await start(legacy));const upgraded=await workspace();assert.equal(upgraded.revision,9);assert.deepEqual(upgraded.data,oldCase.expected);
 console.log('Native Go smoke passed with an empty PATH: HTTP, photos, SQLite restart, Node database migration, backup, verify, confirmation guard and restore.');
}finally{await stop();await rm(directory,{recursive:true,force:true});}
