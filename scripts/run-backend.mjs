import {resolve} from 'node:path';
import {runBinary} from './go-tools.mjs';
runBinary(resolve('backend/bin/onecup'+(process.platform==='win32'?'.exe':'')),process.argv.slice(2));
