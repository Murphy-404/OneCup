import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 plugins:[react()],
 resolve:{alias:{'@onecup/edition':fileURLToPath(new URL('./src/edition.tsx',import.meta.url)),'@onecup/service-info':fileURLToPath(new URL('./src/components/ServiceInfo.tsx',import.meta.url))}},
 server:{proxy:{'/api':{target:'http://127.0.0.1:3001'}}},
});
