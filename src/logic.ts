import { ingredientName, ingredients, recipes, type Recipe, type StockStatus } from './data';
import { validCoffeeRecord, type CoffeeRecord } from './coffee';
import { equipment, type EquipmentStock } from './equipment';
import { shoppingIngredients } from './substitutions';
export interface PersonalVersion { id: string; recipeId: string; name: string; servings: number; amounts: Record<string, number>; note: string; snapshot: Recipe; updatedAt: string }
export interface UserData { schemaVersion: 1; favorites: string[]; stock: Record<string, StockStatus>; equipment:EquipmentStock; versions: PersonalVersion[]; plan: PersonalVersion[]; coffeeRecords:CoffeeRecord[]; theme: string }
export const freshData = (): UserData => ({schemaVersion:1,favorites:[],stock:{},equipment:{},versions:[],plan:[],coffeeRecords:[],theme:'oat'});
export function recipeDraft(r: Recipe): PersonalVersion {
  return {id:crypto.randomUUID(),recipeId:r.id,name:r.name,servings:1,amounts:Object.fromEntries(r.ingredients.map(i=>[i.id,i.amount])),note:'',snapshot:structuredClone(r),updatedAt:new Date().toISOString()};
}
export function shoppingList(plan: PersonalVersion[]) {
  const rows = new Map<string,{id:string;unit:string;amount:number;recipes:string[]}>();
  const batches=new Map<string,{outputMl:number;inputs:import('./data').Amount[];need:number;names:string[]}>();
  function add(ingredient:import('./data').Amount,servings:number,names:string[]){
    if(ingredient.optional) return;
    const key=`${ingredient.id}:${ingredient.unit}`;
    const row=rows.get(key)??{id:ingredient.id,unit:ingredient.unit,amount:0,recipes:[]};
    row.amount+=ingredient.amount*servings;
    for(const name of names)if(!row.recipes.includes(name))row.recipes.push(name);
    rows.set(key,row);
  }
  for(const item of plan){
    const prepared=item.snapshot.preparations??[];
    const withBatches=prepared.filter(p=>p.batch);
    const r={...item.snapshot,ingredients:item.snapshot.ingredients.filter(i=>!withBatches.some(p=>p.target===i.id)),preparations:prepared.filter(p=>!p.batch)};
    for(const ingredient of shoppingIngredients(r,item.amounts))add(ingredient,item.servings,[item.name]);
    for(const p of withBatches){const key=JSON.stringify({id:p.id,batch:p.batch});const batch=batches.get(key)??{...p.batch!,need:0,names:[]};batch.need+=(item.amounts[p.target]??item.snapshot.ingredients.find(i=>i.id===p.target)!.amount)*item.servings;batch.names.push(`${item.name}（自制${p.target==='syrup'?'糖浆':'浓缩'}）`);batches.set(key,batch);}
  }
  for(const batch of batches.values())for(const input of batch.inputs)add(input,Math.ceil(batch.need/batch.outputMl),batch.names);
  return [...rows.values()].filter(row=>row.amount>0);
}
export function missingIngredients(r: Recipe, stock: UserData['stock']) {
  return shoppingIngredients(r,Object.fromEntries(r.ingredients.map(i=>[i.id,i.amount]))).filter(i => !i.optional && !['have','low'].includes(stock[i.id] ?? 'unknown'));
}
export function amountText(amount: number, unit: string) {
  // Display rounding never changes source quantities.
  return `${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(amount)} ${unit}`;
}
export function stepText(step: string, r: Recipe, amounts: Record<string,number>, servings: number) {
  return step.replace(/\{(\w+)\}/g, (_match,id:string) => {
    const ingredient = r.ingredients.find(i=>i.id===id);
    return ingredient ? amountText((amounts[id] ?? ingredient.amount)*servings,ingredient.unit) : ingredientName(id);
  });
}
export function makeRandomBag(ids: string[], random = Math.random) {
  const bag = [...ids];
  for(let i=bag.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [bag[i],bag[j]]=[bag[j],bag[i]]; }
  return bag;
}
const knownIds = new Set(ingredients.map(i=>i.id));
const validStatuses = new Set(['unknown','have','low','none']);
const validThemes = new Set(['oat','coffee','slate','sage','clay']);
function finiteNumber(n: unknown, min: number, max: number): n is number { return typeof n==='number' && Number.isFinite(n) && n>=min && n<=max; }
function isRecord(v:unknown):v is Record<string,unknown> { return typeof v==='object' && v!==null && !Array.isArray(v); }
export function validateBackup(input: unknown): UserData {
  if(!isRecord(input) || input.schemaVersion!==1 || !Array.isArray(input.favorites) || !isRecord(input.stock) || !Array.isArray(input.versions)) throw Error('备份格式不正确，原有数据未修改。');
  const recipeIds=new Set(recipes.map(r=>r.id));
  if(input.favorites.some(id=>typeof id!=='string'||!recipeIds.has(id)) || input.favorites.length>1000 || input.versions.length>1000) throw Error('收藏或个人做法数据无效。');
  for(const [id,status] of Object.entries(input.stock)) if(!knownIds.has(id)||!validStatuses.has(String(status))) throw Error('材料状态无效。');
  const tools=input.equipment??{};
  if(!isRecord(tools)||Object.entries(tools).some(([id,status])=>!equipment.some(t=>t.id===id)||!['have','none','unknown'].includes(String(status))))throw Error('器具状态无效。');
  const plan=input.plan??[];
  const coffeeRecords=input.coffeeRecords??[];
  if(!Array.isArray(coffeeRecords)||coffeeRecords.length>100||coffeeRecords.some(v=>!validCoffeeRecord(v))||new Set(coffeeRecords.map(v=>v.id)).size!==coffeeRecords.length)throw Error('咖啡萃取记录无效，最多保存 100 条。');
  if(!Array.isArray(plan)||plan.length>30)throw Error('备料清单最多保存 30 杯。');
  for(const v of [...input.versions,...plan]) {
    if(!isRecord(v)||typeof v.id!=='string'||typeof v.recipeId!=='string'||!recipeIds.has(v.recipeId)||typeof v.name!=='string'||!v.name.trim()||v.name.length>100||typeof v.note!=='string'||v.note.length>10000||!finiteNumber(v.servings,.5,20)||!isRecord(v.amounts)||typeof v.updatedAt!=='string'||!Number.isFinite(Date.parse(v.updatedAt))) throw Error('个人做法格式无效。');
    const s=v.snapshot;
    validateResolutions(s);
    if(isRecord(s)&&s.toolRequirements!==undefined){
      const knownTools=new Set(equipment.map(t=>t.id));const tools=s.toolRequirements;
      if(!Array.isArray(tools)||tools.length>30||!tools.length||tools.some(t=>!isRecord(t)||!knownTools.has(String(t.id))||t.optional!==undefined&&typeof t.optional!=='boolean'||t.note!==undefined&&(typeof t.note!=='string'||t.note.length>2000)||t.alternatives!==undefined&&(!Array.isArray(t.alternatives)||t.alternatives.some(id=>typeof id!=='string'||!knownTools.has(id))))||new Set(tools.map(t=>t.id)).size!==tools.length)throw Error('保存的器具要求无效。');
    }
    if(isRecord(s)&&s.reference!==undefined){
      const ref=s.reference;
      if(!isRecord(ref)||ref.status!=='reference'||typeof ref.version!=='string'||ref.version.length>100||typeof ref.timeNote!=='string'||ref.timeNote.length>2000||!isRecord(ref.specs)||Object.entries(ref.specs).some(([id,text])=>!knownIds.has(id)||typeof text!=='string'||text.length>2000))throw Error('配方规格与验证状态无效。');
    }
    if(!isRecord(s)||s.id!==v.recipeId||typeof s.name!=='string'||typeof s.en!=='string'||!['coffee','tea','fruit','cocktail'].includes(String(s.category))||!finiteNumber(s.image,0,23)||!Number.isInteger(s.image)||typeof s.description!=='string'||!Array.isArray(s.tags)||s.tags.some(t=>typeof t!=='string')||!finiteNumber(s.minutes,0,10000)||typeof s.method!=='string'||typeof s.alcohol!=='boolean'||typeof s.story!=='string'||typeof s.source!=='string'||!Array.isArray(s.steps)||!s.steps.length||s.steps.some(t=>typeof t!=='string'||t.length>10000)||!Array.isArray(s.ingredients)||!s.ingredients.length) throw Error('配方快照无效。');
    for(const i of s.ingredients) if(!isRecord(i)||!knownIds.has(String(i.id))||!finiteNumber(i.amount,0,100000)||typeof i.unit!=='string'||!['ml','g','片'].includes(i.unit)||(i.optional!==undefined&&typeof i.optional!=='boolean')) throw Error('配方原料无效。');
    if(new Set(s.ingredients.map(i=>i.id)).size!==s.ingredients.length)throw Error('配方原料重复。');
    if(Object.entries(v.amounts).some(([id,n])=>!knownIds.has(id)||!finiteNumber(n,0,100000))) throw Error('原料用量无效。');
    const versionAmounts=v.amounts;
    if(s.ingredients.some(i=>!Object.hasOwn(versionAmounts,i.id))) throw Error('个人做法缺少原料用量。');
    const references = s.steps.join(' ').matchAll(/\{(\w+)\}/g);
    for(const [,id] of references) if(!s.ingredients.some(i=>i.id===id)) throw Error('步骤引用了未知原料。');
  }
  if(new Set(input.versions.map(v=>v.id)).size!==input.versions.length) throw Error('个人做法编号重复。');
  if(new Set(plan.map(v=>v.id)).size!==plan.length)throw Error('备料清单编号重复。');
  return {schemaVersion:1,favorites:[...new Set(input.favorites as string[])],stock:input.stock as UserData['stock'],equipment:tools as EquipmentStock,versions:input.versions as PersonalVersion[],plan:plan as PersonalVersion[],coffeeRecords,theme:validThemes.has(String(input.theme))?String(input.theme):'oat'};
}
function validateResolutions(s:unknown){
 if(!isRecord(s))throw Error('配方快照无效。');
 if(s.resolutions!==undefined&&(!Array.isArray(s.resolutions)||s.resolutions.length>3||s.resolutions.some(r=>!isRecord(r)||!['syrup-home','espresso-home','milk-oat','instant-base'].includes(String(r.id))||r.version!==1||!['preparation','approximation'].includes(String(r.kind))||!knownIds.has(String(r.target))||typeof r.label!=='string'||r.label.length>200||typeof r.effect!=='string'||r.effect.length>2000)))throw Error('替代方案无效。');
 if(s.preparations!==undefined&&(!Array.isArray(s.preparations)||s.preparations.length>2||s.preparations.some(p=>!isRecord(p)||!['syrup-1to1','espresso-extract'].includes(String(p.id))||p.version!==1||!['syrup','espresso'].includes(String(p.target))||!Array.isArray(p.inputs)||p.inputs.length!==2||p.inputs.some(i=>!isRecord(i)||!['sugar','groundcoffee','water'].includes(String(i.id))||i.unit!=='g'||!finiteNumber(i.amount,0,100000))||new Set(p.inputs.map(i=>i.id)).size!==2||!Array.isArray(p.tools)||p.tools.some(id=>!equipment.some(t=>t.id===id))||typeof p.label!=='string'||typeof p.note!=='string'||p.note.length>2000||!Array.isArray(p.steps)||p.steps.length!==0)))throw Error('自制原料配方无效。');
 if(Array.isArray(s.preparations)&&s.preparations.some(p=>!Array.isArray(s.ingredients)||!s.ingredients.some(i=>isRecord(i)&&i.id===p.target&&finiteNumber(i.amount,.0001,100000))))throw Error('自制原料缺少有效的目标用量。');
 if(Array.isArray(s.preparations)&&s.preparations.some(p=>p.batch!==undefined&&(!isRecord(p.batch)||!finiteNumber(p.batch.outputMl,1,10000)||!Array.isArray(p.batch.inputs)||p.batch.inputs.length!==2||p.batch.inputs.some((i:unknown)=>!isRecord(i)||!['sugar','groundcoffee','water'].includes(String(i.id))||i.unit!=='g'||!finiteNumber(i.amount,.001,100000)))))throw Error('自制批次数据无效。');
 if(Array.isArray(s.preparations))for(const p of s.preparations){
  const target=p.id==='syrup-1to1'?'syrup':'espresso';const input=p.id==='syrup-1to1'?'sugar':'groundcoffee';
  if(p.target!==target||!p.inputs.some((i:{id:string})=>i.id===input)||!p.inputs.some((i:{id:string})=>i.id==='water'))throw Error('自制原料对应关系无效。');
  if(p.batch&&(new Set(p.batch.inputs.map((i:{id:string})=>i.id)).size!==2||!p.batch.inputs.some((i:{id:string})=>i.id===input)||!p.batch.inputs.some((i:{id:string})=>i.id==='water')))throw Error('自制批次材料无效。');
  if(p.batch){
   const targetIngredient=(s.ingredients as {id:string;amount:number;unit:string}[]).find(i=>i.id===p.target)!;
   if(targetIngredient.unit!=='ml')throw Error('自制产出单位必须为 ml。');
   for(const item of p.inputs){const batchItem=p.batch.inputs.find((i:{id:string})=>i.id===item.id);const expected=batchItem.amount*targetIngredient.amount/p.batch.outputMl;if(Math.abs(item.amount-expected)>Math.max(1e-8,expected*1e-8))throw Error('自制投入与批次比例不一致。');}
   if(p.id==='syrup-1to1'&&p.batch.inputs.some((i:{amount:number})=>i.amount!==100))throw Error('糖浆基准批次须为 100 g 糖与 100 g 水。');
  }
 }
 if(Array.isArray(s.preparations)&&new Set(s.preparations.map(p=>p.target)).size!==s.preparations.length)throw Error('自制目标重复。');
 if(Array.isArray(s.resolutions)&&new Set(s.resolutions.map(r=>r.target)).size!==s.resolutions.length)throw Error('替代目标重复。');
 if(Array.isArray(s.resolutions))for(const r of s.resolutions){
  const targets:Record<string,string>={'syrup-home':'syrup','espresso-home':'espresso','milk-oat':'milk','instant-base':'espresso'};
  if(r.target!==targets[r.id]||r.kind!==(r.id.endsWith('-home')?'preparation':'approximation'))throw Error('替代规则对应关系无效。');
  if(r.id==='milk-oat'&&s.id!=='vanilla-latte'||r.id==='instant-base'&&!['oat-latte','coconut-coffee'].includes(String(s.id)))throw Error('近似方案不适用于此配方。');
  if(r.undo!==undefined){
   const u=r.undo;
   if(!isRecord(u)||!isRecord(u.original)||u.original.id!==r.target||u.original.unit!=='ml'||!Number.isInteger(u.indexBefore)||!finiteNumber(u.indexBefore,0,100)||!finiteNumber(u.original.amount,0,100000)||!finiteNumber(u.amountBefore,0,100000)||!Array.isArray(u.replacements)||u.replacements.some(id=>typeof id!=='string'||!knownIds.has(id))||!Array.isArray(u.edits)||u.edits.length>100||u.edits.some(e=>!isRecord(e)||typeof e.after!=='string'||e.after.length>10000||e.before!==null&&(typeof e.before!=='string'||e.before.length>10000))||typeof u.nameBefore!=='string'||u.nameBefore.length>200||typeof u.nameAfter!=='string'||u.nameAfter.length>200||!Array.isArray(u.tagsBefore)||!Array.isArray(u.tagsAfter)||[...u.tagsBefore,...u.tagsAfter].some(t=>typeof t!=='string'||t.length>200)||u.specBefore!==undefined&&(typeof u.specBefore!=='string'||u.specBefore.length>2000))throw Error('方案撤销快照无效。');
   const expected=r.id==='milk-oat'?['oat']:r.id==='instant-base'?['instantcoffee','water']:[];
   if(JSON.stringify(u.replacements)!==JSON.stringify(expected)||u.original.optional!==undefined&&typeof u.original.optional!=='boolean')throw Error('方案撤销原料不匹配。');
   const steps=s.steps;if(Array.isArray(steps)&&u.edits.some(e=>!steps.includes(e.after)))throw Error('撤销信息与当前步骤不一致。');
   const allowed=new Set([r.target,...(Array.isArray(s.ingredients)?s.ingredients.map(i=>i.id):[])]);
   if(u.edits.some(e=>e.before!==null&&[...e.before.matchAll(/\{(\w+)\}/g)].some((m:RegExpMatchArray)=>!allowed.has(m[1]))))throw Error('撤销步骤引用了未知原料。');
  }
 }
}
