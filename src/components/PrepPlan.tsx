import { Check, ClipboardList, Minus, Plus, Trash2, X } from 'lucide-react';
import { ingredientName } from '../data';
import { amountText, shoppingList, type PersonalVersion, type UserData } from '../logic';
import { Modal } from './Modal';
import { toolsFor,toolName,toolStatus } from '../equipment';
import { preparationBatchSummary } from '../substitutions';

export function PrepPlan({data,onChange,onClose,onOpen,notify}:{data:UserData;onChange:(next:UserData)=>boolean;onClose:()=>void;onOpen:(item:PersonalVersion)=>void;notify:(message:string)=>void}) {
  const rows=shoppingList(data.plan);
  const tools=data.plan.flatMap(item=>toolsFor(item.snapshot)).filter((t,i,all)=>all.findIndex(a=>a.id===t.id)===i);
  const missing=rows.filter(row=>!['have','low'].includes(data.stock[row.id]??'unknown'));
  function update(id:string,servings:number){onChange({...data,plan:data.plan.map(item=>item.id===id?{...item,servings,updatedAt:new Date().toISOString()}:item)});}
  async function copy(){const text=['一杯 · 备料清单',...data.plan.map(item=>`${item.name} × ${item.servings} 份`),'待准备（材料种类，未检查库存数量）',...missing.map(row=>`${ingredientName(row.id)} ${amountText(row.amount,row.unit)}`)].join('\n');try{await navigator.clipboard.writeText(text);notify('待准备材料已复制。');}catch{notify('浏览器未允许复制，请直接查看清单。');}}
  return <Modal label="备料清单" className="prep-modal" onClose={onClose}>
    <div className="dialog-top"><h2><ClipboardList size={21}/>备料清单 <span>{data.plan.length}</span></h2><button className="icon-button" aria-label="关闭备料清单" onClick={onClose}><X size={21}/></button></div>
    <div className="prep-content"><p className="prep-intro">先选好想做的几杯，材料一起准备。</p>
      {!data.plan.length?<div className="prep-empty"><ClipboardList size={38} strokeWidth={1.2}/><h3>把想做的一杯放进来</h3><p>在配方中点“加入备料”，自动合并必需材料与份数。</p><button className="primary-button" onClick={onClose}>去选一杯</button></div>:<>
      <div className="prep-recipes">{data.plan.map(item=><article className="prep-recipe" key={item.id}><button className="prep-recipe-name" onClick={()=>onOpen(item)}><strong>{item.name}</strong><small>查看这份用量与做法 ↗</small></button><div className="servings-control"><button aria-label={`减少${item.name}份数`} disabled={item.servings<=.5} onClick={()=>update(item.id,Math.max(.5,item.servings-.5))}><Minus size={14}/></button><span>{item.servings} 份</span><button aria-label={`增加${item.name}份数`} disabled={item.servings>=20} onClick={()=>update(item.id,Math.min(20,item.servings+.5))}><Plus size={14}/></button></div><button className="icon-button" aria-label={`移除${item.name}`} onClick={()=>onChange({...data,plan:data.plan.filter(p=>p.id!==item.id)})}><Trash2 size={16}/></button></article>)}</div>
      <div className="prep-list-heading"><h3>待准备 <span>{missing.length} 种</span></h3><button className="text-button" onClick={copy}>复制待备材料</button></div>
      <p className="small-muted">合计用量不含可选材料；库存只记录种类，请另行确认家里数量。</p>
      {preparationBatchSummary(data.plan).map((b,i)=><p className="preparation-note" key={i}>{b.label}：合并准备 {b.count} 批，预计 {b.total.toFixed(1)} ml；本次需 {b.need.toFixed(1)} ml，预计剩余 {b.remaining.toFixed(1)} ml。共用成品请勿逐杯重复制作；实际产出需复核。</p>)}
      <div className="shopping-list">{rows.map(row=>{const owned=['have','low'].includes(data.stock[row.id]??'unknown');return <div className={owned?'shopping-row owned':'shopping-row'} key={`${row.id}:${row.unit}`}><label><input type="checkbox" aria-label={`已备齐${ingredientName(row.id)}`} checked={owned} onChange={e=>onChange({...data,stock:{...data.stock,[row.id]:e.target.checked?'have':'none'}})}/><span><strong>{ingredientName(row.id)}</strong><small>{owned?(data.stock[row.id]==='low'?'快用完，请确认数量':'已登记为有'):data.stock[row.id]==='none'?'家里没有':'尚未登记'} · {row.recipes.join('、')}</small></span></label><span>{amountText(row.amount,row.unit)}</span></div>;})}</div>
      {missing.length===0&&<p className="prep-ready"><Check size={17}/>必需材料种类齐全，请继续确认数量与器具。</p>}
      <section className="prep-tools"><h3>本次所需器具 · 不随份数增加</h3><ul>{tools.map(t=><li key={t.id}>{toolName(t.id)} · {t.optional?'可选':toolStatus(t,data.equipment)==='ready'?'已具备':toolStatus(t,data.equipment)==='alternative'?'可用已登记替代品':'待准备 / 确认'}{t.alternatives?`（可替代：${t.alternatives.map(toolName).join('、')}）`:''}</li>)}</ul></section>
      <p className="small-muted prep-footnote">勾选会将“我的材料”更新为有；取消勾选更新为没有。清单保存在此实例的服务器数据库。</p>
      </>}
    </div>
  </Modal>;
}
