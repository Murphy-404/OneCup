import assert from 'node:assert/strict';
const base=new URL(process.argv[2]??'http://127.0.0.1:8080');
async function read(path){const r=await fetch(new URL(path,base),{signal:AbortSignal.timeout(10000)});assert.equal(r.status,200,path);return r.text();}
assert.equal((await read('/healthz')).trim(),'ok');const html=await read('/');const script=html.match(/src="([^"]+\.js)"/);assert(script);const source=await read(script[1]);assert(!source.includes('/api/auth/session'));assert(source.includes('/api/workspace'));
assert((await read('/drinks/example')).includes('<div id="root">'));assert((await read('/LICENSE')).includes('OneCup Personal Non-Commercial Attribution'));
const workspace=JSON.parse(await read('/api/workspace'));assert(Number.isInteger(workspace.revision));assert.equal(workspace.data.schemaVersion,2);
for(const path of ['/api/auth/session','/api/data','/assets/missing.js'])assert.equal((await fetch(new URL(path,base))).status,404,path);
const image=await fetch(new URL('/images/recipes/matcha.webp',base));assert.equal(image.status,200);assert(image.headers.get('content-type')?.startsWith('image/'));
console.log('Single-user server smoke passed: SQLite workspace, static resources, license, SPA route and absent account API.');
