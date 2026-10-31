import type {Recipe,StockStatus} from './data';
import {toolsFor,toolStatus,type ToolRequirement,type EquipmentStock} from './equipment';
import {candidates,shoppingIngredients,solutionRequirements} from './substitutions';
export type PathKind='direct'|'preparation'|'approximation';
export interface PathChange {id:string;target:string;label:string;kind:'preparation'|'approximation'}
export interface PreparationPath {
 kind:PathKind;changes:PathChange[];
 materials:{id:string;status:'none'|'unknown'}[];
 tools:{requirement:ToolRequirement;status:'missing'|'unknown'}[];
 alternativeTools:ToolRequirement[];lowStock:string[];
 parameters:string[];conditionsMet:boolean;
}
export interface Readiness {current:PreparationPath;alternatives:PreparationPath[];best:PreparationPath;label:string;rank:number}
// This evaluates known rules only. It never applies substitutions, invents a yield or changes inventory.
export function recipeReadiness(r:Recipe,stock:Record<string,StockStatus>,equipment:EquipmentStock,amounts:Record<string,number>=Object.fromEntries(r.ingredients.map(i=>[i.id,i.amount]))):Readiness{
 const base=shoppingIngredients(r,amounts).filter(i=>!i.optional&&i.amount>0).map(i=>i.id);
 function evaluate(changes:PathChange[]):PreparationPath{
  const ids=new Set(base);const tools=toolsFor(r);const parameters:string[]=[];
  for(const change of changes){
   ids.delete(change.target);const req=solutionRequirements(change.id);req.materials.forEach(id=>ids.add(id));
   for(const id of req.tools){const existing=tools.find(t=>t.id===id);if(existing)existing.optional=false;else tools.push({id});}
   if(change.kind==='preparation')parameters.push(change.id==='syrup-home'?'确认质量 1:1 规格，制作冷却后测量成品 ml':'记录实际粉量、用水与出液 ml，不以出液 g 代替');
  }
  for(const p of r.preparations??[])if(!p.batch)parameters.push('旧版自制记录需复核规格与实际产量');
  const materials=[...ids].filter(id=>!['have','low'].includes(stock[id]??'unknown')).map(id=>({id,status:stock[id]==='none'?'none' as const:'unknown' as const}));
  const required=tools.filter(t=>!t.optional);
  const unavailable=required.filter(t=>['missing','unknown'].includes(toolStatus(t,equipment))).map(requirement=>({requirement,status:toolStatus(requirement,equipment) as 'missing'|'unknown'}));
  const kind=changes.some(c=>c.kind==='approximation')||r.resolutions?.some(s=>s.kind==='approximation')?'approximation':changes.some(c=>c.kind==='preparation')||r.preparations?.length?'preparation':'direct';
  return {kind,changes,materials,tools:unavailable,alternativeTools:required.filter(t=>toolStatus(t,equipment)==='alternative'),lowStock:[...ids].filter(id=>stock[id]==='low'),parameters,conditionsMet:materials.length===0&&unavailable.length===0};
 }
 const current=evaluate([]);let combinations:PathChange[][]=[[]];
 for(const ingredient of r.ingredients){
  if(ingredient.optional||(amounts[ingredient.id]??ingredient.amount)<=0||['have','low'].includes(stock[ingredient.id]??'unknown'))continue;
  const rules=candidates(r,ingredient.id);if(!rules.length)continue;
  const previous=combinations;combinations=[];
  for(const path of previous){combinations.push(path);for(const rule of rules)combinations.push([...path,{id:rule.id,target:rule.target,label:rule.label,kind:rule.kind}]);}
 }
 function score(p:PreparationPath){return (p.conditionsMet?0:100)+(p.kind==='direct'?0:p.kind==='preparation'?10:20)+p.materials.length*3+p.tools.length*3+p.changes.length;}
 const alternatives=combinations.filter(p=>p.length).map(evaluate).sort((a,b)=>score(a)-score(b));
 const best=[current,...alternatives].sort((a,b)=>score(a)-score(b))[0];
 const label=current.conditionsMet?(current.kind==='direct'?'原方材料器具齐备':current.kind==='preparation'?(current.parameters.length?'已选自制 · 需复核参数':'已选自制 · 条件齐备'):'已选近似 · 条件齐备'):best.conditionsMet?(best.kind==='preparation'?'有自制路径 · 需确认参数':'有近似路径 · 待采用'):[...best.materials.map(m=>m.status),...best.tools.map(t=>t.status)].some(s=>s==='none'||s==='missing')?'仍有条件缺少':'准备条件待登记';
 return {current,alternatives,best,label,rank:score(best)};
}
export function matchesReadiness(value:Readiness,filter:string){
 if(filter==='direct')return value.current.kind==='direct'&&value.current.conditionsMet;
 if(filter==='self')return [value.current,...value.alternatives].some(p=>p.kind==='preparation'&&p.conditionsMet);
 if(filter==='approx')return [value.current,...value.alternatives].some(p=>p.kind==='approximation'&&p.conditionsMet);
 if(filter==='needs')return ![value.current,...value.alternatives].some(p=>p.conditionsMet);
 return true;
}
