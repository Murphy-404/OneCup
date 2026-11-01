import {build} from 'esbuild';
await build({entryPoints:['server/index.ts','server/cli.ts'],outdir:'server-dist',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node24',sourcemap:false});
