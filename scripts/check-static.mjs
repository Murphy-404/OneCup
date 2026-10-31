import assert from 'node:assert/strict';
const base=new URL(process.argv[2]??'http://127.0.0.1:8080');
async function read(path){const r=await fetch(new URL(path,base),{signal:AbortSignal.timeout(10000)});assert.equal(r.status,200,path);return r.text();}
assert.equal((await read('/healthz')).trim(),'ok');
const html=await read('/');const script=html.match(/src="([^"]+\.js)"/);assert(script,'built script');const source=await read(script[1]);assert(!source.includes('/api/auth/session'));assert(!source.includes('/api/data'));
assert((await read('/drinks/example')).includes('<div id="root">'));
assert((await read('/LICENSE')).includes('OneCup Personal Non-Commercial Attribution'));
for(const path of ['/api/auth/session','/api/data','/assets/missing.js']){const r=await fetch(new URL(path,base));assert.equal(r.status,404,path);}
const picture=await fetch(new URL('/images/recipes/matcha.webp',base));assert.equal(picture.status,200);assert(picture.headers.get('content-type')?.startsWith('image/'));
console.log('Static container smoke passed: health, HTML, JS, image, license, SPA route and missing/API 404.');
