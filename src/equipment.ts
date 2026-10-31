import type {Recipe} from './data';
export const equipment=[['cup','饮用杯'],['measure','量杯 / 量酒器'],['spoon','搅拌匙'],['shaker','摇酒壶'],['sealedjar','适合冷饮摇和的密闭容器'],['strainer','滤冰器'],['sieve','食品滤网'],['mixglass','搅拌杯'],['muddler','捣棒'],['whisk','茶筅 / 搅打器'],['frother','奶泡器 / 蒸汽棒'],['heater','加热设备'],['scale','电子秤'],['espressoMachine','意式咖啡机'],['grinder','磨豆机']] .map(([id,name])=>({id,name}));
export type EquipmentStock=Record<string,'have'|'none'|'unknown'>;
export interface ToolRequirement {id:string;optional?:boolean;alternatives?:string[];note?:string}
export const toolName=(id:string)=>equipment.find(t=>t.id===id)?.name??id;
export function toolsFor(r:Recipe):ToolRequirement[]{return r.toolRequirements?structuredClone(r.toolRequirements):inferTools(r);}
export function inferTools(r:Recipe):ToolRequirement[]{
 const result:ToolRequirement[]=[{id:'cup'},{id:'measure'}];
 if(r.method==='摇和')result.push({id:'shaker',alternatives:['sealedjar'],note:'只用于冷饮；替代容器须适合接触食品、牢固密闭并留有空间。'},{id:'strainer',alternatives:['sieve'],note:'滤去冰块，细滤效果随工具变化。'});
 else result.push({id:'spoon'});
 if(r.id==='negroni')result.push({id:'mixglass',alternatives:['cup'],note:'可用容量足够的杯子搅拌后滤冰。'},{id:'strainer',alternatives:['sieve']});
 if(r.id==='mojito')result.push({id:'muddler',alternatives:['spoon'],note:'轻压薄荷；本配方使用青柠汁，避免捣碎叶片。'});
 if(['peach-oolong','grape-jasmine','strawberry-milk','mango-milk'].includes(r.id))result.push({id:'muddler',alternatives:['spoon'],note:'用于轻压果肉；手压版本保留颗粒，追求细腻质地时需另行搅打。'});
 if(r.ingredients.some(i=>i.id==='matcha'||i.id==='hojicha'))result.push({id:'whisk',alternatives:['frother']});
 if(r.method==='热调')result.push({id:'heater'},{id:'frother',note:'细腻奶泡所需；没有时可制作无奶泡家庭版本。'});
 for(const p of r.preparations??[])for(const id of p.tools)result.push({id});
 if(r.resolutions?.some(s=>s.id==='instant-base'))result.push({id:'heater',note:'溶解速溶粉所需的温水；使用前先放凉。'},{id:'scale',note:'按克称量纯速溶粉，不能用勺数代替克数。'});
 if(r.ingredients.some(i=>i.unit==='g')&&!result.some(t=>t.id==='scale'))result.push({id:'scale',optional:true,note:'推荐用于准确称量克数，尤其是粉料与果肉。'});
 if(r.ingredients.some(i=>i.optional))result.push({id:'sieve',optional:true,note:'按装饰或细滤需求使用。'});
 return result.filter((t,i)=>result.findIndex(x=>x.id===t.id)===i);
}
export function toolStatus(t:ToolRequirement,stock:EquipmentStock){return stock[t.id]==='have'?'ready':t.alternatives?.some(id=>stock[id]==='have')?'alternative':stock[t.id]==='none'?'missing':'unknown';}
export function missingTools(r:Recipe,stock:EquipmentStock){return toolsFor(r).filter(t=>!t.optional&&!['ready','alternative'].includes(toolStatus(t,stock)));}
