import {mkdir,copyFile,readdir} from 'node:fs/promises';
await mkdir('dist/licenses',{recursive:true});await mkdir('dist/docs/reference',{recursive:true});
for(const path of ['LICENSE','THIRD_PARTY_NOTICES.md'])await copyFile(path,'dist/'+path);
for(const path of await readdir('licenses'))await copyFile('licenses/'+path,'dist/licenses/'+path);
await copyFile('docs/reference/ASSETS.md','dist/docs/reference/ASSETS.md');
