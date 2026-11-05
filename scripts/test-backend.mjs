import {execute,goCommand} from './go-tools.mjs';
await execute(process.execPath,['--import','tsx','scripts/export-contracts.ts','--check']);
await execute(goCommand,['test','./...'],{cwd:'backend'});
