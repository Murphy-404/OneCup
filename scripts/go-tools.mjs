import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadEnvFile} from 'node:process';

try { loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
export const goCommand = process.env.GO_BINARY || 'go';
export function execute(command,args,options={}) {
 return new Promise((resolveRun,reject)=>{
  const child=spawn(command,args,{stdio:'inherit',...options});
  child.on('error',error=>reject(new Error(`Unable to run ${command}. Install Go or set GO_BINARY. ${error.message}`)));
  child.on('exit',code=>code===0?resolveRun():reject(new Error(`Command exited with ${code}`)));
 });
}
export async function buildBackend(directory=resolve('backend'),name='onecup') {
 const output=resolve(directory,'bin',name+(process.platform==='win32'?'.exe':''));
 await mkdir(resolve(directory,'bin'),{recursive:true});
 await execute(goCommand,['build','-trimpath','-ldflags=-s -w','-o',output,'./cmd/'+name],{cwd:directory});
 return output;
}
export function runBinary(binary,args) {
 const child=spawn(binary,args,{stdio:'inherit',env:process.env});
 process.on('SIGINT',()=>child.kill('SIGINT'));
 process.on('SIGTERM',()=>child.kill('SIGTERM'));
 child.on('error',error=>{console.error(error.message);process.exitCode=1;});
 child.on('exit',code=>{process.exitCode=code??1;});
}
