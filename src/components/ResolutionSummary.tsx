import type {Recipe} from '../data';
import {ingredientName} from '../data';
import {amountText} from '../logic';
import {canUndoResolution} from '../substitutions';
export function ResolutionSummary({recipe:r,amounts,servings,onUndo,onRestore}:{recipe:Recipe;amounts:Record<string,number>;servings:number;onUndo:(id:string)=>void;onRestore:()=>void}){
 if(!r.resolutions?.length)return null;
 return <section className="resolution-summary" aria-label="已采用的方案"><strong>你的变体 · {r.resolutions.length} 项方案</strong>{r.resolutions.map(s=><article className="adopted-resolution" key={s.id}><h3>{s.label}</h3><p>{s.effect}</p><p className="resolution-comparison">{s.kind==='preparation'?`${ingredientName(s.target)}：从直接准备成品，改为先自制，再量取本杯用量。`:s.id==='milk-oat'?`牛奶 → 燕麦饮；当前用量 ${amountText((amounts.oat??0)*servings,'ml')}。`:s.undo?`浓缩咖啡液 ${amountText(s.undo.amountBefore*servings,'ml')} → 速溶粉与水的试调基底。`:'旧版方案未保存采用前用量。'}</p>{canUndoResolution(s)?<><button className="secondary-button" aria-label={`撤销${s.label}`} onClick={()=>onUndo(s.id)}>仅撤销此方案</button><small>{s.id==='instant-base'?'恢复采用前的浓缩量；速溶粉和水的后续调整不作等效回算。':s.id==='milk-oat'?'保留最近调整的体积，恢复为牛奶。':'保留目标用量，移除这一项前置自制。'} 份数、笔记和其他方案保留。</small></>:<small>此旧版方案缺少逐项撤销信息；可先备份，再整体恢复原版。</small>}</article>)}<button className="text-button" onClick={onRestore}>整体恢复原版配方</button><small>替代与组合效果尚未实测；整体恢复会重置用量。</small></section>;
}
