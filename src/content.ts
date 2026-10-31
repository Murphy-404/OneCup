import type {Recipe} from './data';
export interface RecipeReference {version:string;status:'reference';timeNote:string;specs:Record<string,string>}
export const ingredientSpecs:Record<string,string>={
 sugar:'白砂糖，按质量称量',coffeebeans:'完整咖啡豆，不能直接作咖啡液使用',groundcoffee:'适配所用器具的研磨咖啡粉',filtercoffee:'已经萃取的手冲液，不等同浓缩',coldbrew:'已完成浸泡并过滤的冷萃液，浓度需自行确认',instantcoffee:'无糖、无奶精的纯速溶咖啡粉',
 espresso:'已萃取的意式浓缩；本页按体积量取，不把出液克数当毫升',matcha:'纯抹茶粉，不是含糖抹茶饮料粉',hojicha:'纯焙茶粉',blacktea:'按茶叶包装冲泡、过滤并冷却的红茶茶汤；浓度未实测',oolong:'按包装冲泡、过滤并冷却的乌龙茶汤；浓度未实测',jasmine:'按包装冲泡、过滤并冷却的茉莉茶汤；浓度未实测',
 milk:'可直接饮用的原味牛奶',oat:'可直接饮用的燕麦饮；品牌甜度与起泡性有差异',coconut:'可直接饮用的椰乳，不是浓稠椰浆',water:'饮用水；按本页标注分别量取 ml 或称量 g',soda:'无糖原味苏打气泡水，不是汤力水',tonic:'可直接饮用的汤力水，含甜味和苦味',ice:'食用冰块，按质量称量，不按杯中体积推算',
 syrup:'白砂糖:水按质量 1:1 的原味糖浆；冷却后按体积量取',vanilla:'可直接调饮的香草糖浆；浓度与甜度随品牌变化',honey:'纯蜂蜜，按配方单位量取',salt:'食用盐，盐边可省略',
 peach:'去核白桃果肉，按可食部分称量',lemon:'柠檬汁，按体积量取；酸度依水果变化',lime:'青柠汁，按体积量取；酸度依水果变化',limewedge:'洗净青柠切片，装饰可选',strawberry:'洗净去蒂的草莓，按可食部分称量',mango:'去皮去核的成熟芒果果肉',grapefruit:'可直接饮用的西柚汁，不是浓缩汁',passionfruit:'含籽新鲜百香果果肉，不是浓缩果酱',grape:'洗净去籽的青提可食部分',pineapple:'可直接饮用的菠萝汁，不是浓缩汁',mint:'洗净的新鲜薄荷叶，按叶片计数',orange:'洗净橙子的橙皮，装饰可选',
 gin:'金酒，按体积量取',rum:'白朗姆酒，按体积量取',campari:'金巴利苦味利口酒',vermouth:'甜味美思，不使用干味美思等量替换',tequila:'龙舌兰酒，按体积量取',triple:'橙味利口酒，按体积量取',whisky:'威士忌，按体积量取',
};
export function referenceFor(ingredients:Recipe['ingredients']):RecipeReference{
 const excluded=['材料称量与清洗','制冰','杯子预冷'];
 if(ingredients.some(i=>i.id==='espresso'))excluded.push('咖啡萃取');
 if(ingredients.some(i=>['blacktea','oolong','jasmine'].includes(i.id)))excluded.push('泡茶、过滤与冷却');
 if(ingredients.some(i=>['syrup','vanilla'].includes(i.id)))excluded.push('糖浆制作与冷却');
 return {version:'2026-10-29.2',status:'reference',timeNote:`标注为调配参考时间，不含${excluded.join('、')}；实际耗时依设备和熟练度变化。`,specs:Object.fromEntries(ingredients.map(i=>[i.id,ingredientSpecs[i.id]]))};
}
export function referenceTime(r:Recipe){return r.reference?.timeNote??'此为旧版个人快照，调配时间不含萃取、泡茶、自制与冷却；原料规格请自行复核。';}
