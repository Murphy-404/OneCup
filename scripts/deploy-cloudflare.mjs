import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
const config=JSON.parse(await fs.readFile('wrangler.jsonc','utf8'));
const db=config.d1_databases?.find(d=>d.binding==='DB');
if(!db||db.database_id==='00000000-0000-0000-0000-000000000000')throw Error('Create your own D1 and configure its ID before deployment.');
const url=new URL(config.vars.APP_ORIGIN);
if(url.protocol!=='https:'||url.hostname.endsWith('.example')||url.origin!==config.vars.APP_ORIGIN)throw Error('Configure your own public HTTPS APP_ORIGIN.');
if(config.vars.ENVIRONMENT!=='production'||config.vars.DEV_EMAILS!=='false'||config.vars.PLAINTEXT_PASSWORD_TEST!=='false')throw Error('Production requires secure authentication and disabled development emails.');
if(!config.vars.EMAIL_FROM)throw Error('Configure your own mail service and EMAIL_FROM. See docs/DEPLOYMENT.md.');
if(!Number.isInteger(config.limits?.cpu_ms)||config.limits.cpu_ms<1000)throw Error('Explicitly configure sufficient Workers CPU budget after reviewing your plan. See docs/DEPLOYMENT.md.');
function run(args){return new Promise((done,fail)=>{const p=spawn(process.execPath,args,{stdio:'inherit'});p.on('error',fail);p.on('exit',code=>code===0?done():fail(Error(`Command failed: ${code}`)));});}
await run(['node_modules/typescript/bin/tsc','-b']);
await run(['node_modules/typescript/bin/tsc','-p','tsconfig.worker.json']);
await run(['node_modules/vite/bin/vite.js','build']);
await run(['node_modules/wrangler/bin/wrangler.js','deploy']);
