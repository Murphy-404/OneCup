export const brewMethods={
  espresso:{name:'意式浓缩',dose:18,ratio:2,temp:93,seconds:30,equipment:'意式咖啡机、适配粉碗、磨豆机、电子秤',grind:'细研磨；刻度取决于磨豆机',hint:'1:2 指粉重 : 杯中咖啡液重，不是注水量。18 g → 36 g 是调试起点，按粉碗容量与豆子调整。'},
  pour:{name:'手冲 / V60',dose:15,ratio:16.7,temp:93,seconds:180,equipment:'滤杯、滤纸、手冲壶、磨豆机、电子秤',grind:'中细研磨，结合流速调整',hint:'1:16.7 指粉重 : 总注水重。成品会因咖啡粉吸水而少于注水量，不是浓缩咖啡。'},
  immersion:{name:'法压 / 浸泡',dose:15,ratio:15,temp:93,seconds:240,equipment:'法压壶、磨豆机、电子秤',grind:'中粗研磨；过滤前先让粉沉降',hint:'粉水比按总注水计算；浸泡时间为家庭试调起点，过滤后的出液量需实测。'},
  cold:{name:'冷萃',dose:50,ratio:10,temp:4,seconds:43200,equipment:'带盖浸泡容器、滤纸或滤网、冰箱、电子秤',grind:'粗研磨',hint:'这里是冷藏浸泡的试调起点，不是食品保质期建议。过滤后按口味稀释，不与意式浓缩等量互换。'},
  instant:{name:'速溶咖啡',dose:2,ratio:50,temp:80,seconds:0,equipment:'杯子、电子秤、热水',grind:'无需研磨，使用可溶咖啡粉',hint:'这是溶解比例，不是萃取率。优先遵循包装用量；做奶咖时可减少水量，不能标记为意式浓缩。'},
} as const;
export type BrewMethod=keyof typeof brewMethods;
export interface CoffeeRecord {id:string;method:BrewMethod;bean:string;equipment:string;grind:string;roast:string;dose:number;ratio:number;temperature:number;seconds:number;actualYield:number;note:string;updatedAt:string}
export function brewTarget(dose:number,ratio:number){return Math.round(dose*ratio*100)/100;}
export function validCoffeeRecord(v:unknown):v is CoffeeRecord {
  if(!v||typeof v!=='object')return false;
  const r=v as CoffeeRecord;
  return Object.hasOwn(brewMethods,r.method)&&['id','bean','equipment','grind','roast','note','updatedAt'].every(k=>typeof r[k as keyof CoffeeRecord]==='string'&&String(r[k as keyof CoffeeRecord]).length<=2000)&&!!r.id&&Number.isFinite(Date.parse(r.updatedAt))&&
    [[r.dose,.1,200],[r.ratio,.5,100],[r.temperature,0,100],[r.seconds,0,86400],[r.actualYield,0,20000]].every(([n,min,max])=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max);
}
