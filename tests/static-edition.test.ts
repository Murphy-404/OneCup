import test from 'node:test';import assert from 'node:assert/strict';import {readFile,access} from 'node:fs/promises';
test('personal build exposes no login components or account API dependency',async()=>{
 const main=await readFile('src/main.tsx','utf8'),workspace=await readFile('src/workspace.ts','utf8'),vite=await readFile('vite.config.ts','utf8');
 assert(!/AccountDialog|EmailFlowDialog|apiRequest|登录或注册|\/auth\/session/.test(main));assert(!/apiRequest|fetch\(/.test(workspace));assert(!vite.includes('proxy'));
 await assert.rejects(access('src/api.ts'));await assert.rejects(access('server/app.ts'));
});
test('Docker serves a read-only static app, retains notices and has no database volume',async()=>{
 const docker=await readFile('Dockerfile','utf8'),compose=await readFile('compose.yaml','utf8'),nginx=await readFile('docker/default.conf','utf8');
 assert(docker.includes('nginxinc/nginx-unprivileged'));assert(docker.includes('LICENSE THIRD_PARTY_NOTICES.md'));assert(compose.includes('read_only: true'));assert(!compose.includes('volumes:'));assert(nginx.includes('location /api/ { return 404; }'));
});
