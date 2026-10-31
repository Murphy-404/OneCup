import type {Recipe,Amount} from './data';
import {ingredientSpecs} from './content';
import {inferTools} from './equipment';
export interface Preparation {id:string;version:1;target:string;label:string;inputs:Amount[];steps:string[];tools:string[];note:string;batch?:{outputMl:number;inputs:Amount[]}}
export interface ResolutionUndo {original:Amount;indexBefore:number;amountBefore:number;replacements:string[];edits:{before:string|null;after:string}[];nameBefore:string;nameAfter:string;tagsBefore:string[];tagsAfter:string[];specBefore?:string}
export interface Resolution {id:string;version:1;target:string;kind:'preparation'|'approximation';label:string;effect:string;undo?:ResolutionUndo}
export const substitutionRules=[
 {id:'espresso-home',target:'espresso',label:'用研磨咖啡粉萃取浓缩',kind:'preparation',effect:'需要意式咖啡机、电子秤和量杯。使用实际粉量、用水与出液体积建立本次换算，不将咖啡豆直接当成咖啡液。',recipes:[]},
 {id:'syrup-home',target:'syrup',label:'自制 1:1 原味糖浆',kind:'preparation',effect:'白砂糖与水按质量 1:1 制作；需确认原配方采用同规格糖浆，按实测成品体积换算。',recipes:[]},
 {id:'milk-oat',target:'milk',label:'用燕麦饮制作冰奶咖',kind:'approximation',effect:'保留奶咖结构，增加谷物风味；甜度、稠度与泡沫不同。当前仅适用于香草冰拿铁。',recipes:['vanilla-latte']},
 {id:'instant-base',target:'espresso',label:'用速溶粉制作咖啡基底',kind:'approximation',effect:'适用于椰乳冰咖啡、冰燕麦拿铁的家庭变体。没有浓缩油脂与相同香气，不等同意式浓缩。',recipes:['coconut-coffee','oat-latte']},
] as const;
export function candidates(r:Recipe,target:string){return substitutionRules.filter(rule=>rule.target===target&&(rule.recipes.length===0||(rule.recipes as readonly string[]).includes(r.id))&&r.ingredients.some(i=>i.id===target&&i.unit==='ml')&&!(r.resolutions??[]).some(s=>s.target===target));}
export function solutionRequirements(id:string):{materials:string[];tools:string[]}{
 switch(id){
  case 'syrup-home':return {materials:['sugar','water'],tools:['scale','measure','heater','spoon']};
  case 'espresso-home':return {materials:['groundcoffee','water'],tools:['espressoMachine','scale','measure']};
  case 'milk-oat':return {materials:['oat'],tools:['measure']};
  case 'instant-base':return {materials:['instantcoffee','water'],tools:['scale','measure','heater','spoon']};
  default:throw Error('未知方案。');
 }
}
export function applySubstitution(r:Recipe,amounts:Record<string,number>,id:string,yieldMl?:number,coffeeDose?:number,coffeeWater?:number):{recipe:Recipe;amounts:Record<string,number>}{
 const rule=substitutionRules.find(s=>s.id===id);if(!rule||!candidates(r,rule.target).some(s=>s.id===id))throw Error('此方案不适用于当前配方。');
 const recipe=structuredClone(r);const next={...amounts};const target=r.ingredients.find(i=>i.id===rule.target)!;const dose=amounts[target.id]??target.amount;
 const resolution:Resolution={id:rule.id,version:1,target:rule.target,kind:rule.kind,label:rule.label,effect:rule.effect};
 if(id==='espresso-home'){
  if(!yieldMl||!Number.isFinite(yieldMl)||yieldMl<5||yieldMl>200||!coffeeDose||!Number.isFinite(coffeeDose)||coffeeDose<1||coffeeDose>50||!coffeeWater||!Number.isFinite(coffeeWater)||coffeeWater<1||coffeeWater>500||target.amount<=0)throw Error('请填写有效的实测出液体积、粉量与用水量。');
  recipe.preparations=[...(recipe.preparations??[]),{id:'espresso-extract',version:1,target:'espresso',label:rule.label,inputs:[{id:'groundcoffee',amount:target.amount*coffeeDose/yieldMl,unit:'g'},{id:'water',amount:target.amount*coffeeWater/yieldMl,unit:'g'}],steps:[],tools:['espressoMachine','scale','measure'],note:`本次萃取：${coffeeDose} g 研磨咖啡粉，${coffeeWater} g 用水，实测出液 ${yieldMl} ml。用量按实测数据线性估算；粉碗容量固定，实际需按完整萃取批次制作，多余咖啡液另行处理。`}];
 }else if(id==='syrup-home'){
  if(typeof yieldMl!=='number'||!Number.isFinite(yieldMl)||yieldMl<50||yieldMl>300)throw Error('请填写 100 g 糖 + 100 g 水制成后，实际测得的成品体积（50–300 ml）。');
  if(target.amount<=0)throw Error('原配方目标量必须大于零。');
  recipe.preparations=[...(recipe.preparations??[]),{id:'syrup-1to1',version:1,target:'syrup',label:rule.label,inputs:[{id:'sugar',amount:target.amount*100/yieldMl,unit:'g'},{id:'water',amount:target.amount*100/yieldMl,unit:'g'}],steps:[],tools:['scale','measure','heater','spoon'],note:`已确认目标为质量 1:1 糖浆。100 g 白砂糖 + 100 g 水，实测成品 ${yieldMl} ml；按需比例制作，实际产量仍需复核。`}];
 }else if(id==='milk-oat'){
  recipe.ingredients=recipe.ingredients.map(i=>i.id==='milk'?{...i,id:'oat'}:i);next.oat=dose;delete next.milk;
  recipe.steps=recipe.steps.map(s=>s.replaceAll('{milk}','{oat}').replaceAll('牛奶','燕麦饮'));recipe.name='香草燕麦冰拿铁';recipe.tags=['谷物风味','近似替代'];
 }else{
  recipe.ingredients=recipe.ingredients.filter(i=>i.id!=='espresso');
  recipe.ingredients.push({id:'instantcoffee',amount:dose/15,unit:'g'},{id:'water',amount:dose,unit:'ml'});next.instantcoffee=dose/15;next.water=dose;delete next.espresso;
  recipe.steps=['先用 {water} 温水溶解 {instantcoffee} 速溶咖啡粉，放凉后作为咖啡基底。',...recipe.steps.map(s=>s.replaceAll('{espresso}','已准备的').replaceAll('浓缩咖啡液','速溶咖啡基底'))];recipe.name=r.name+' · 速溶版';recipe.tags=['家庭近似版本','无浓缩油脂'];
 }
 if(rule.kind==='preparation'){
  const p=recipe.preparations!.at(-1)!;
  p.batch={outputMl:yieldMl!,inputs:id==='syrup-home'?[{id:'sugar',amount:100,unit:'g'},{id:'water',amount:100,unit:'g'}]:[{id:'groundcoffee',amount:coffeeDose!,unit:'g'},{id:'water',amount:coffeeWater!,unit:'g'}]};
 }
 if(recipe.reference)recipe.reference.specs=Object.fromEntries(recipe.ingredients.map(i=>[i.id,recipe.reference!.specs[i.id]??ingredientSpecs[i.id]]));
 const shift=id==='instant-base'?1:0;
 resolution.undo={original:structuredClone(target),indexBefore:r.ingredients.findIndex(i=>i.id===target.id),amountBefore:dose,replacements:recipe.ingredients.filter(i=>!r.ingredients.some(old=>old.id===i.id)).map(i=>i.id),edits:recipe.steps.flatMap((after,index)=>{const before=index<shift?null:r.steps[index-shift];return before===after?[]:[{before,after}];}),nameBefore:r.name,nameAfter:recipe.name,tagsBefore:[...r.tags],tagsAfter:[...recipe.tags],specBefore:r.reference?.specs[target.id]};
 recipe.resolutions=[...(recipe.resolutions??[]),resolution];recipe.toolRequirements=inferTools(recipe);return {recipe,amounts:next};
}
export function canUndoResolution(resolution:Resolution){return resolution.kind==='preparation'||!!resolution.undo;}
export function undoSubstitution(r:Recipe,amounts:Record<string,number>,id:string){
 const resolution=r.resolutions?.find(s=>s.id===id);if(!resolution||!canUndoResolution(resolution))throw Error('此旧版方案缺少撤销信息，请先导出备份，再使用整体恢复原版。');
 const recipe=structuredClone(r);const next={...amounts};const undo=resolution.undo;
 if(resolution.kind==='approximation'){
  if(!undo)throw Error('缺少原方快照，未修改当前做法。');
  // A volume-for-volume milk swap retains the user's latest dose. Instant coffee is not an equivalent conversion.
  next[resolution.target]=id==='milk-oat'?(next.oat??recipe.ingredients.find(i=>i.id==='oat')!.amount):undo.amountBefore;
  recipe.ingredients=recipe.ingredients.filter(i=>!undo.replacements.includes(i.id));
  recipe.ingredients.splice(undo.indexBefore,0,structuredClone(undo.original));
  for(const ingredient of undo.replacements)delete next[ingredient];
  recipe.steps=recipe.steps.flatMap(step=>{const edit=undo.edits.find(e=>e.after===step);return edit?(edit.before===null?[]:[edit.before]):[step];});
  if(recipe.name===undo.nameAfter)recipe.name=undo.nameBefore;
  if(JSON.stringify(recipe.tags)===JSON.stringify(undo.tagsAfter))recipe.tags=[...undo.tagsBefore];
  if(recipe.reference){for(const ingredient of undo.replacements)delete recipe.reference.specs[ingredient];recipe.reference.specs[resolution.target]=undo.specBefore??ingredientSpecs[resolution.target];}
 }
 recipe.preparations=recipe.preparations?.filter(p=>p.target!==resolution.target);
 recipe.resolutions=recipe.resolutions?.filter(s=>s.id!==id);
 recipe.toolRequirements=inferTools(recipe);
 return {recipe,amounts:next};
}
export function preparationSteps(r:Recipe,servings:number,amounts:Record<string,number>){return (r.preparations??[]).map(p=>{const scale=(amounts[p.target]??r.ingredients.find(i=>i.id===p.target)!.amount)/r.ingredients.find(i=>i.id===p.target)!.amount;const water=p.inputs.find(i=>i.id==='water')!.amount*scale*servings;if(p.id==='espresso-extract')return `先准备浓缩：按保存的萃取参数，用意式咖啡机制作咖啡液，再用量杯量取 ${((amounts[p.target]??r.ingredients.find(i=>i.id===p.target)!.amount)*servings).toFixed(1)} ml。原料消耗为估算，请遵循粉碗容量按完整批次萃取，勿照估算值随意减粉。${p.note}`;const sugar=p.inputs.find(i=>i.id==='sugar')!.amount*scale*servings;return `先自制糖浆：称取 ${sugar.toFixed(1)} g 白砂糖与 ${water.toFixed(1)} g 水，加热搅拌至糖完全溶解，冷却后量取所需体积。器具：电子秤、加热设备、量杯、搅拌匙。`;});}
export function shoppingIngredients(r:Recipe,amounts:Record<string,number>):Amount[]{
 return r.ingredients.flatMap(i=>{const p=r.preparations?.find(p=>p.target===i.id);return p?p.inputs.map(input=>({...input,amount:input.amount*(amounts[i.id]??i.amount)/i.amount})): [{...i,amount:amounts[i.id]??i.amount}];});
}
export function preparationBatchSummary(plan:import('./logic').PersonalVersion[]){
 const batches=new Map<string,{label:string;need:number;output:number}>();
 for(const item of plan)for(const p of item.snapshot.preparations??[]){if(!p.batch)continue;const key=JSON.stringify({id:p.id,batch:p.batch});const entry=batches.get(key)??{label:p.label,need:0,output:p.batch.outputMl};entry.need+=(item.amounts[p.target]??item.snapshot.ingredients.find(i=>i.id===p.target)!.amount)*item.servings;batches.set(key,entry);}
 return [...batches.values()].map(b=>({...b,count:Math.ceil(b.need/b.output),total:Math.ceil(b.need/b.output)*b.output,remaining:Math.ceil(b.need/b.output)*b.output-b.need}));
}
export function batchSteps(r:Recipe,servings:number,amounts:Record<string,number>){
 return (r.preparations??[]).flatMap(p=>{
  if(!p.batch)return preparationSteps({...r,preparations:[p]},servings,amounts);
  const need=(amounts[p.target]??r.ingredients.find(i=>i.id===p.target)!.amount)*servings;
  const batches=Math.ceil(need/p.batch.outputMl);const inputs=p.batch.inputs.map(i=>`${(i.amount*batches).toFixed(1)} g ${i.id==='sugar'?'白砂糖':i.id==='groundcoffee'?'研磨咖啡粉':'水'}`).join(' + ');
  return [`前置准备：${p.label}。若已有本次备料清单准备的成品，直接量取 ${need.toFixed(1)} ml；否则按 ${batches} 个完整批次准备：${inputs}。${p.id==='syrup-1to1'?'加热搅拌至糖完全溶解，冷却后使用。':'用意式咖啡机按记录的粉碗与萃取参数制作，不能把整豆直接使用。'}按记录估计共 ${ (batches*p.batch.outputMl).toFixed(1)} ml，本杯用 ${need.toFixed(1)} ml，剩余另行处理。实际产出需复核。`];
 });
}
