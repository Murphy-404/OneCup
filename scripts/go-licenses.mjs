import {execFileSync} from 'node:child_process';
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {goCommand} from './go-tools.mjs';

// Run after go mod download. Only include modules actually linked into the API.
const command=goCommand;
const lines=execFileSync(command,['list','-deps','-f','{{if .Module}}{{.Module.Path}}|{{.Module.Dir}}{{end}}','./cmd/onecup'],{cwd:'backend',encoding:'utf8'}).trim().split(/\r?\n/);
const modules=new Map(lines.filter(line=>line.includes('|')).map(line=>line.split('|')));
modules.delete('github.com/Murphy-404/OneCup/backend');
await mkdir('licenses',{recursive:true});
const notice=['# Go runtime dependencies','','These modules are linked into the Go API. Their original licenses remain in force. Exact module versions and checksums are recorded in backend/go.mod and backend/go.sum.',''];
for(const [name,directory] of [...modules].sort()){
 const files=(await readdir(directory)).filter(file=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(file));
 if(!files.length)throw Error('Missing license for '+name);
 for(const file of files){const target='go-'+name.replaceAll('/','_')+'-'+file;await writeFile(join('licenses',target),await readFile(join(directory,file)));notice.push(`- ${name}: [${file}](${target})`);}
}
const goroot=execFileSync(command,['env','GOROOT'],{encoding:'utf8'}).trim();await writeFile('licenses/go-stdlib-LICENSE',await readFile(join(goroot,'LICENSE')));notice.push('- Go standard library: [LICENSE](go-stdlib-LICENSE)');
await writeFile('licenses/GO-DEPENDENCIES.md',notice.join('\n')+'\n');console.log(`Collected licenses for ${modules.size} linked Go modules and the standard library.`);
