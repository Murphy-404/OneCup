import {referenceFor, type RecipeReference} from './content';
import {inferTools,type ToolRequirement} from './equipment';
export type Category = 'all' | 'coffee' | 'tea' | 'fruit' | 'cocktail';
export type StockStatus = 'unknown' | 'have' | 'low' | 'none';
export interface Ingredient { id: string; name: string; group: string }
export interface Amount { id: string; amount: number; unit: string; optional?: boolean }
export interface Recipe {
  preparations?: import('./substitutions').Preparation[]; resolutions?: import('./substitutions').Resolution[];
  id: string; name: string; en: string; category: Exclude<Category, 'all'>;
  description: string; tags: string[]; minutes: number; image: number;
  method: string; alcohol: boolean; ingredients: Amount[]; steps: string[];
  story: string; source: string;
  reference?:RecipeReference;
  toolRequirements?:ToolRequirement[];
}
export const categories = [
  { id: 'all', name: '全部饮品', en: 'ALL' }, { id: 'coffee', name: '咖啡', en: 'COFFEE' },
  { id: 'tea', name: '茶饮', en: 'TEA' }, { id: 'fruit', name: '果饮', en: 'FRUIT' },
  { id: 'cocktail', name: '鸡尾酒', en: 'COCKTAIL' },
] as const;
export const ingredients: Ingredient[] = [
  ['sugar','白砂糖','糖与调味'],
  ['coffeebeans','咖啡豆','咖啡与茶'], ['groundcoffee','研磨咖啡粉','咖啡与茶'],
  ['filtercoffee','手冲咖啡液','咖啡与茶'], ['coldbrew','冷萃咖啡液','咖啡与茶'], ['instantcoffee','速溶咖啡粉','咖啡与茶'],
  ['espresso','浓缩咖啡液','咖啡与茶'], ['matcha','抹茶粉','咖啡与茶'], ['hojicha','焙茶粉','咖啡与茶'],
  ['blacktea','红茶茶汤','咖啡与茶'], ['oolong','乌龙茶汤','咖啡与茶'], ['jasmine','茉莉茶汤','咖啡与茶'],
  ['milk','牛奶','乳品与基底'], ['oat','燕麦奶','乳品与基底'], ['coconut','椰乳','乳品与基底'],
  ['water','饮用水','乳品与基底'], ['soda','苏打水','乳品与基底'], ['tonic','汤力水','乳品与基底'], ['ice','冰块','乳品与基底'],
  ['syrup','原味糖浆','糖与调味'], ['vanilla','香草糖浆','糖与调味'], ['honey','蜂蜜','糖与调味'], ['salt','盐','糖与调味'],
  ['peach','白桃果肉','水果与香草'], ['lemon','柠檬汁','水果与香草'], ['lime','青柠汁','水果与香草'],
  ['limewedge','青柠片','水果与香草'], ['strawberry','草莓','水果与香草'], ['mango','芒果','水果与香草'],
  ['grapefruit','西柚汁','水果与香草'], ['passionfruit','百香果果肉','水果与香草'],
  ['grape','青提','水果与香草'], ['pineapple','菠萝汁','水果与香草'], ['mint','薄荷叶','水果与香草'], ['orange','橙皮','水果与香草'],
  ['gin','金酒','酒类'], ['rum','白朗姆酒','酒类'], ['campari','金巴利','酒类'],
  ['vermouth','甜味美思','酒类'], ['tequila','龙舌兰酒','酒类'], ['triple','橙味利口酒','酒类'], ['whisky','威士忌','酒类'],
].map(([id,name,group]) => ({id,name,group}));
export const ingredientName = (id: string) => ingredients.find(i => i.id === id)?.name ?? id;
const a = (id: string, amount: number, unit = 'ml', optional = false): Amount => ({id,amount,unit,optional});
function recipe(id:string, name:string, en:string, category:Recipe['category'], image:number,
  description:string, tags:string[], minutes:number, amounts:Amount[], steps:string[], story:string, method='兑制', source='家庭调配参考版本，待实际试做。'):Recipe {
  const value:Recipe={id,name,en,category,image,description,tags,minutes,ingredients:amounts,steps,story,method,source,alcohol:category==='cocktail',reference:referenceFor(amounts)};
  value.toolRequirements=inferTools(value);return value;
}
// {ingredientId} placeholders always resolve from the current quantities, including personal edits.
export const recipes: Recipe[] = [
  recipe('matcha','冰抹茶拿铁','ICED MATCHA LATTE','tea',0,'抹茶的清新，遇上牛奶的柔软。给忙碌的日常，留一点绿色。',['清新茶香','绵柔奶感'],5,
    [a('matcha',3,'g'),a('water',40),a('milk',160),a('syrup',10),a('ice',100,'g')],
    ['用 {water} 温水将 {matcha} 抹茶粉搅打至没有结块。','杯中加入 {ice} 冰块、{syrup} 糖浆，倒入 {milk} 牛奶。','沿冰块缓缓倒入抹茶液，欣赏分层后搅匀饮用。'],
    '抹茶以整片茶叶研磨成粉，与牛奶融合后，茶的微苦与奶香形成柔和的平衡。此处是适合家庭制作的冰饮版本。'),
  recipe('espresso-tonic','咖啡汤力','ESPRESSO TONIC','coffee',1,'气泡轻盈，咖啡醇香。一口清爽，唤醒整个午后。',['微苦清爽','细腻气泡'],3,
    [a('espresso',30),a('tonic',150),a('ice',100,'g'),a('orange',1,'片',true)],
    ['杯中加入 {ice} 冰块，倒入 {tonic} 汤力水。','将 {espresso} 浓缩咖啡液沿杯壁缓缓倒入。','可用 {orange} 橙皮轻挤香气点缀；不加也可以。轻轻搅拌后饮用。'],
    '浓缩咖啡与汤力水的组合，将咖啡的烘焙香气和汤力水的微苦气泡相连。不同烘焙的咖啡会带来不同风味。'),
  recipe('oat-latte','冰燕麦拿铁','ICED OAT LATTE','coffee',2,'烘焙香气与谷物甜感，恰好是温柔的一杯。',['谷物香气','柔和顺滑'],3,
    [a('espresso',30),a('oat',180),a('ice',100,'g')],['在杯中加入 {ice} 冰块。','倒入 {oat} 燕麦奶，再缓缓加入 {espresso} 浓缩咖啡液。','轻轻搅匀。燕麦奶的甜度依品牌而异，先品尝再决定是否加糖。'], '以燕麦饮替代牛奶的拿铁版本。燕麦奶不是所有配方中与牛奶完全等效的替代品，风味和质地会有所不同。'),
  recipe('flat-white','馥芮白','FLAT WHITE','coffee',3,'细腻奶泡，浓郁咖啡。属于清晨的小小仪式。',['浓郁咖啡','细腻奶泡'],6,
    [a('espresso',36),a('milk',120)],['准备 {espresso} 浓缩咖啡液。','将 {milk} 牛奶加热并打成细腻薄奶泡，避免沸腾。','把热牛奶缓缓融合进浓缩咖啡中。没有蒸汽棒时，可用奶泡器制作家庭近似版本。'], 'Flat White 常被认为起源于澳大利亚或新西兰，具体起源存在争议。这里采用较小杯量的家庭参考比例。','热调'),
  recipe('vanilla-latte','香草冰拿铁','VANILLA ICED LATTE','coffee',4,'淡淡香草，为熟悉的拿铁加一点甜。',['香草甜香','经典奶咖'],4,
    [a('espresso',30),a('milk',170),a('vanilla',15),a('ice',100,'g')],['将 {vanilla} 香草糖浆与 {espresso} 浓缩咖啡液混合。','杯中放入 {ice} 冰块，倒入 {milk} 牛奶。','加入香草咖啡液，搅匀。先品尝后再调整甜度。'],'香草拿铁是风味拿铁的一种。糖浆浓度与香气随品牌变化，用量仅作为起点。'),
  recipe('coconut-coffee','椰乳冰咖啡','COCONUT ICED COFFEE','coffee',5,'椰香与咖啡相遇，像给自己放了一个短假。',['椰香浓郁','热带风味'],3,
    [a('espresso',30),a('coconut',160),a('ice',100,'g')],['杯中加入 {ice} 冰块。','倒入 {coconut} 椰乳和 {espresso} 浓缩咖啡液。','搅拌均匀，按椰乳本身的甜度决定是否额外加糖。'],'采用可直接饮用的椰乳，不是罐装浓稠椰浆。两者脂肪、浓度和甜度不同，不能直接按同量互换。'),
  recipe('hot-latte','热拿铁','CAFFÈ LATTE','coffee',6,'温热奶香，拥抱一口醇厚的咖啡。',['温暖奶香','柔和醇厚'],5,
    [a('espresso',30),a('milk',180)],['准备 {espresso} 浓缩咖啡液。','将 {milk} 牛奶温热并打成细腻奶泡，不要煮沸。','将牛奶缓缓倒入浓缩咖啡，最后覆盖薄薄的奶泡。'],'拿铁以浓缩咖啡与牛奶调配。相比本目录的馥芮白参考版本，这杯牛奶比例更高。','热调'),
  recipe('peach-oolong','白桃乌龙','PEACH OOLONG TEA','tea',7,'清甜桃香，轻盈茶韵。把夏天装进杯子里。',['白桃清甜','清爽茶韵'],5,
    [a('oolong',180),a('peach',60,'g'),a('syrup',10),a('ice',100,'g')],['将 {peach} 白桃果肉轻压出汁。','加入 {syrup} 糖浆和 {ice} 冰块。','倒入已冷却的 {oolong} 乌龙茶汤，搅匀饮用。'],'以事先泡好、冷却的乌龙茶为基底。页面时间不含茶叶浸泡与冷却；不同茶叶需要分别控制浸泡条件。'),
  recipe('blacktea-latte','红茶拿铁','BLACK TEA LATTE','tea',8,'茶香浓一点，日子慢一点。',['醇厚红茶','丝滑奶香'],4,
    [a('blacktea',100),a('milk',120),a('syrup',12),a('ice',80,'g')],['准备并冷却 {blacktea} 较浓的红茶茶汤。','杯中加入 {ice} 冰块与 {syrup} 糖浆。','倒入 {milk} 牛奶和红茶，搅拌均匀。'],'这里的“拿铁”指牛奶与茶的组合，不含咖啡。使用已备好的茶汤，制作时间不含泡茶与冷却。'),
  recipe('lemon-tea','手作柠檬红茶','LEMON BLACK TEA','tea',9,'明亮柠香，让红茶也轻快起来。',['清新酸甜','解腻清爽'],4,
    [a('blacktea',180),a('lemon',20),a('syrup',20),a('ice',100,'g')],['将 {syrup} 糖浆与 {lemon} 柠檬汁混合。','加入 {ice} 冰块与已冷却的 {blacktea} 红茶茶汤。','充分搅匀，依据柠檬实际酸度小量调整。'],'家庭柠檬茶版本。避免长时间浸泡带皮柠檬造成苦味。参考用量不代表各种柠檬都有相同酸度。'),
  recipe('jasmine-latte','茉莉奶绿','JASMINE MILK TEA','tea',10,'花香轻轻，奶香柔柔。',['茉莉花香','轻盈奶感'],4,
    [a('jasmine',120),a('milk',100),a('syrup',12),a('ice',80,'g')],['准备已冷却的 {jasmine} 茉莉茶汤。','加入 {syrup} 糖浆、{milk} 牛奶与 {ice} 冰块。','充分搅匀，立即饮用。'],'以茉莉茶为底的家庭奶茶版本。过度浸泡可能让奶茶涩口，建议依茶叶包装控制冲泡。'),
  recipe('grape-jasmine','青提茉莉气泡茶','GRAPE JASMINE FIZZ','tea',11,'果香、花香和气泡，刚刚好的轻盈。',['鲜果花香','轻盈气泡'],5,
    [a('grape',60,'g'),a('jasmine',100),a('soda',80),a('syrup',10),a('ice',80,'g')],['将 {grape} 青提洗净去籽后轻压出汁。','加入 {syrup} 糖浆、{ice} 冰块与冷却的 {jasmine} 茉莉茶汤。','最后倒入 {soda} 苏打水，轻轻拌匀。'],'用新鲜青提和现成茶汤调配的果茶。气泡水最后加入，避免剧烈摇晃导致气泡流失。'),
  recipe('strawberry-milk','草莓鲜奶','STRAWBERRY MILK','fruit',12,'一口草莓，一口奶香。简单也能很幸福。',['鲜果甜香','绵柔奶感'],5,
    [a('strawberry',80,'g'),a('milk',180),a('syrup',10),a('ice',60,'g')],['将 {strawberry} 草莓洗净去蒂，加入 {syrup} 糖浆压成小颗粒果泥。','杯底放入果泥与 {ice} 冰块。','缓缓倒入 {milk} 牛奶，饮用前搅匀。'],'以新鲜果泥制作的家庭草莓奶。水果酸度和成熟度不同，建议现做现喝。'),
  recipe('mango-milk','芒果鲜奶','MANGO MILK','fruit',13,'阳光一样的芒果，搭配柔软奶香。',['浓郁果香','柔和香甜'],5,
    [a('mango',100,'g'),a('milk',160),a('ice',60,'g')],['将 {mango} 芒果果肉压泥或搅打细腻。','杯中加入芒果泥与 {ice} 冰块。','倒入 {milk} 牛奶，充分搅匀。'],'选成熟芒果可以减少额外糖的需求。本配方不额外加糖，但不代表成品不含糖。'),
  recipe('grapefruit-soda','西柚气泡饮','GRAPEFRUIT SODA','fruit',14,'微苦的西柚，被气泡轻轻托起。',['果香微苦','清爽气泡'],3,
    [a('grapefruit',80),a('soda',140),a('syrup',15),a('ice',100,'g')],['混合 {grapefruit} 西柚汁与 {syrup} 糖浆。','加入 {ice} 冰块。','沿杯壁倒入 {soda} 苏打水，轻轻搅匀。'],'西柚本身的微苦是这杯饮品的特点。此处采用果汁，不将整果重量等同于果汁体积。'),
  recipe('passionfruit-soda','百香果气泡饮','PASSION FRUIT FIZZ','fruit',15,'热带果香跃进杯子，酸甜明亮。',['热带果香','明亮酸甜'],3,
    [a('passionfruit',30,'g'),a('soda',180),a('syrup',20),a('ice',100,'g')],['杯中加入 {passionfruit} 百香果果肉和 {syrup} 糖浆。','加入 {ice} 冰块。','倒入 {soda} 苏打水，轻轻搅匀。'],'采用含籽的新鲜百香果果肉。浓缩果酱不能按相同重量直接替代。'),
  recipe('lemon-soda','薄荷柠檬气泡饮','MINT LEMON SODA','fruit',16,'柠檬与薄荷，清爽得刚刚好。',['清爽柠香','薄荷气息'],4,
    [a('lemon',20),a('soda',180),a('syrup',20),a('ice',100,'g'),a('mint',4,'片',true)],['混合 {lemon} 柠檬汁与 {syrup} 糖浆。','加入 {ice} 冰块与 {soda} 苏打水。','可轻拍 {mint} 薄荷叶后放入，轻轻搅匀。薄荷可省略。'],'一杯无需酒精的清爽气泡饮。薄荷作为可选香气点缀，不影响严格材料筛选。'),
  recipe('pineapple-soda','菠萝气泡饮','PINEAPPLE FIZZ','fruit',17,'金黄菠萝，把日常调成假日。',['鲜甜果香','轻盈气泡'],3,
    [a('pineapple',100),a('soda',120),a('ice',100,'g')],['在杯中放入 {ice} 冰块。','倒入 {pineapple} 菠萝汁。','加入 {soda} 苏打水并轻轻搅匀，按果汁甜度决定是否另外加糖。'],'本版本用可直接饮用的菠萝汁制作，不是浓缩菠萝汁。'),
  recipe('gin-tonic','金汤力','GIN & TONIC','cocktail',18,'杜松子与气泡，清爽而利落。',['清爽微苦','经典长饮'],3,
    [a('gin',45),a('tonic',120),a('ice',120,'g'),a('limewedge',1,'片',true)],['在高球杯中加入 {ice} 冰块。','倒入 {gin} 金酒与 {tonic} 汤力水。','轻轻搅匀，可用 {limewedge} 青柠片点缀。'],'金酒与汤力水的经典组合。本版本是便于家庭制作的参考比例，品牌与偏好会影响最佳配比。'),
  recipe('mojito','莫吉托','MOJITO','cocktail',19,'薄荷清凉，青柠明亮，气泡轻盈。',['薄荷青柠','清爽气泡'],6,
    [a('rum',45),a('lime',25),a('syrup',20),a('mint',6,'片'),a('soda',80),a('ice',120,'g')],['轻压 {mint} 薄荷叶，与 {lime} 青柠汁、{syrup} 糖浆混合，避免捣碎叶片。','加入 {rum} 白朗姆酒与 {ice} 冰块。','倒入 {soda} 苏打水，轻轻提拉搅匀。'],'经典古巴风格长饮。本家庭版本用糖浆代替砂糖；用量和步骤与经典原方有所不同。','兑制','https://iba-world.com/'),
  recipe('negroni','尼格罗尼','NEGRONI','cocktail',20,'苦甜交织，柑橘香气慢慢展开。',['苦甜浓郁','柑橘香气'],4,
    [a('gin',30),a('campari',30),a('vermouth',30),a('ice',120,'g'),a('orange',1,'片',true)],['杯中加入 {ice} 冰块。','加入 {gin} 金酒、{campari} 金巴利与 {vermouth} 甜味美思。','搅拌至充分冰镇，可用 {orange} 橙皮挤香装饰。'],'经典的等份比例鸡尾酒，以金酒、金巴利和甜味美思调配，具有鲜明苦甜风味。','搅拌','https://iba-world.com/'),
  recipe('daiquiri','代基里','DAIQUIRI','cocktail',21,'朗姆、青柠和糖，简单而平衡。',['明亮酸甜','经典短饮'],5,
    [a('rum',60),a('lime',20),a('syrup',15),a('ice',120,'g')],['摇酒壶中加入 {rum} 白朗姆酒、{lime} 青柠汁和 {syrup} 糖浆。','加入 {ice} 冰块，摇和至充分冰镇。','滤冰倒入预冷的鸡尾酒杯。'],'代基里以朗姆酒、青柠和糖构成基本平衡。本参考版本采用糖浆，比例随糖浆浓度调整。','摇和','https://iba-world.com/'),
  recipe('margarita','玛格丽特','MARGARITA','cocktail',22,'青柠的酸，龙舌兰的香，恰到好处。',['青柠酸香','清冽果香'],5,
    [a('tequila',50),a('triple',20),a('lime',15),a('ice',120,'g'),a('salt',1,'g',true)],['可将杯沿润湿后蘸少许 {salt} 盐，不加盐边也可以。','在摇酒壶中加入 {tequila} 龙舌兰酒、{triple} 橙味利口酒、{lime} 青柠汁与 {ice} 冰块。','充分摇和，滤入预冷的鸡尾酒杯。'],'经典龙舌兰鸡尾酒。这里采用龙舌兰、橙味利口酒与青柠汁的常见参考配比。','摇和','https://iba-world.com/'),
  recipe('whisky-highball','威士忌高球','WHISKY HIGHBALL','cocktail',23,'用气泡打开威士忌的轻盈一面。',['清爽麦香','轻盈长饮'],3,
    [a('whisky',45),a('soda',135),a('ice',120,'g')],['在高球杯中加入 {ice} 冰块，倒入 {whisky} 威士忌。','轻轻搅拌冰镇。','沿杯壁倒入 {soda} 苏打水，轻轻提拉一次即可。'],'Highball 是基酒与大量非酒精饮料调配的长饮类别，此处采用威士忌和苏打水。'),
];
