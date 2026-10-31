import {equipment,toolName,toolsFor,toolStatus,type EquipmentStock} from '../equipment';
import type {Recipe} from '../data';
export function EquipmentManager({value,onChange}:{value:EquipmentStock;onChange:(s:EquipmentStock)=>void}){
 return <section className="equipment-manager"><h2>我的器具</h2><p className="small-muted">器具单独登记，不消耗库存；未登记不等于已经具备。</p><div className="equipment-grid">{equipment.map(t=><label key={t.id}>{t.name}<select aria-label={`${t.name}器具状态`} value={value[t.id]??'unknown'} onChange={e=>onChange({...value,[t.id]:e.target.value as EquipmentStock[string]})}><option value="unknown">未登记</option><option value="have">有</option><option value="none">没有</option></select></label>)}</div></section>;
}
export function RecipeEquipment({recipe,stock}:{recipe:Recipe;stock:EquipmentStock}){
 return <section className="recipe-equipment"><h3>准备器具</h3><ul>{toolsFor(recipe).map(t=>{const status=toolStatus(t,stock);return <li key={t.id}><strong>{toolName(t.id)}</strong><span className={`tool-state ${status}`}>{t.optional?'可选':status==='ready'?'已具备':status==='alternative'?'有替代器具':status==='missing'?'缺少器具':'待确认'}</span>{t.alternatives&&<small>可替代：{t.alternatives.map(toolName).join(' / ')}</small>}{t.note&&<small>{t.note}</small>}</li>;})}</ul><p className="small-muted">此处按已有咖啡液、茶汤等基底计算；从豆子或茶叶制作时需额外设备与时间。</p></section>;
}
