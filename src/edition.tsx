import {Database} from 'lucide-react';
import {useWorkspace} from './workspace';
import {readBrowserBackup} from './browser-migration';
import type {UserData} from './logic';

export function useEdition({notify,onSettings,onImport}:{notify:(message:string)=>void;onSettings:()=>void;onExport:()=>void;onImport:(data:UserData)=>void}){
 const workspace=useWorkspace(notify);
 return {workspace,
  header:<button className="icon-button" aria-label="服务器数据与备份" onClick={onSettings}><Database size={19}/></button>,
  banners:null,dialogs:null,
  footer:<a className="footer-data" href="https://github.com/Murphy-404/OneCup" target="_blank" rel="noreferrer">OneCup by Murphy-404 · 个人非商业使用 · 来源</a>,
  storageHelp:<><p>无需登录。收藏、材料、配方、合集和制作记录保存在{workspace.storageLabel}。访问同一实例的设备共用一份记录。</p><p role="status">{workspace.sync.message}</p></>,
  migrationButton:<button disabled={workspace.readOnly} className="secondary-button" onClick={()=>{readBrowserBackup().then(onImport).catch(e=>notify(e.message));}}>导入旧浏览器记录</button>,
  restoreWarning:'恢复将替换此实例的服务器记录，其他连接设备也会读取恢复后的版本。',
 };
}
