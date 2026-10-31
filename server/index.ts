import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createApplication } from './app';
try { loadEnvFile(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const production = process.env.NODE_ENV === 'production';
if (production && !process.env.APP_ORIGIN) throw Error('Production requires APP_ORIGIN=https://your-domain.example');
const origin = process.env.APP_ORIGIN ?? (process.argv.includes('--standalone') ? 'http://127.0.0.1:3001' : 'http://127.0.0.1:5173');
if (production && !origin.startsWith('https://')) throw Error('Production APP_ORIGIN must use HTTPS.');
const { server, db } = createApplication({
  databasePath: process.env.DATABASE_PATH ?? resolve('data/onecup.sqlite'),
  origin, secureCookies: production, staticDirectory: resolve('dist'),
});
const port = Number(process.env.PORT ?? 3001);
server.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`OneCup API + SQLite: http://${process.env.HOST ?? '127.0.0.1'}:${port}`));
function stop() { server.close(() => { db.close(); process.exit(0); }); server.closeIdleConnections(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
