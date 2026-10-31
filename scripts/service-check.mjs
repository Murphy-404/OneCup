const origin=process.argv[2]??'http://127.0.0.1:8787';
if(!/^https?:\/\//.test(origin))throw Error('Expected HTTP(S) origin');
const paths=['/','/api/health','/api/recipes','/images/recipes/matcha.webp'];
const results=await Promise.all(paths.map(async path=>{const start=Date.now();try{const res=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(15000)});let valid=res.ok;let metadata={};if(path==='/api/health'){const body=await res.json();valid&&=body.recipes===24;metadata={storage:body.storage,testAuth:body.plaintextPasswordTest};}if(path==='/api/recipes')valid&&=(await res.json()).recipes?.length===24;if(path.endsWith('.webp'))valid&&=(res.headers.get('content-type')??'').includes('image/');return {path,status:res.status,ok:valid,ms:Date.now()-start,...metadata};}catch{return {path,ok:false,ms:Date.now()-start,error:'network-or-timeout'};}}));
console.log(JSON.stringify({at:new Date().toISOString(),origin,results,scope:'Checks only this machine/network; does not certify mainland reachability or authenticated saves.'},null,2));
if(results.some(r=>!r.ok))process.exitCode=1;
