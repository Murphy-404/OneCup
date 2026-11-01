import assert from 'node:assert/strict';
if(process.env.CI!=='true')throw Error('Only run against the disposable CI instance, never a real user database.');
const [stage,base='http://127.0.0.1:8080']=process.argv.slice(2);const endpoint=new URL('/api/workspace',base);
const current=await(await fetch(endpoint)).json();
if(stage==='seed'){assert.equal(current.revision,0);assert.deepEqual(current.data.favorites,[]);current.data.favorites=['matcha'];current.data.theme='slate';}
else if(stage==='change'){assert.deepEqual(current.data.favorites,['matcha']);current.data.theme='clay';}
else if(stage==='check'){assert.deepEqual(current.data.favorites,['matcha']);assert.equal(current.data.theme,'slate');console.log('Records survived container recreation / SQLite restore.');process.exit(0);}
else throw Error('Expected seed, change or check.');
const response=await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:current.data,revision:current.revision})});assert.equal(response.status,200);console.log('Disposable CI workspace updated.');
