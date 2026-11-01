import {createLocalStore,LEGACY_KEY} from './local-db';
import {validateBackup} from './logic';
export async function readBrowserBackup(){const store=createLocalStore();try{const record=await store.read();if(record)return record.data;const raw=localStorage.getItem(LEGACY_KEY);if(raw)return validateBackup(JSON.parse(raw));throw Error('此浏览器和站点地址没有可导入的旧本地记录，请在旧地址导出 JSON 后恢复。');}finally{store.close();}}
