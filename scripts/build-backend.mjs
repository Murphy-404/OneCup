import {buildBackend,execute} from './go-tools.mjs';
await execute(process.execPath,['--import','tsx','scripts/export-contracts.ts','--check']);
console.log('Built '+await buildBackend());
