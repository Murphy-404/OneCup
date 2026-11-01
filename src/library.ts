import {recipes,type Recipe} from './data';
import {recipeDraft,validateBackup,freshData,type CustomRecipe,type PersonalVersion,type UserData,type RecipeCollection} from './logic';
export function emptyCustom():CustomRecipe{return {id:'custom-'+crypto.randomUUID(),recipe:{id:'',name:'',en:'PRIVATE RECIPE',category:'fruit',description:'',tags:[],minutes:5,image:0,method:'自定义',alcohol:false,ingredients:[],steps:[],story:'',source:'个人自建',toolRequirements:[]},baseServings:1,status:'draft',updatedAt:new Date().toISOString()};}
export function customVersion(c:CustomRecipe):PersonalVersion{
 if(c.status!=='ready')throw Error('请先补全并保存为可制作配方。');
 const recipe:Recipe={...structuredClone(c.recipe),id:c.id,reference:c.recipe.reference??{status:'reference',version:c.updatedAt,timeNote:'私人配方，前置准备与冷却时间另计；尚未记录规格。',specs:{}},ingredients:c.recipe.ingredients.map(i=>({...i,amount:i.amount/c.baseServings}))};
 const v={...recipeDraft(recipe),id:c.id,name:recipe.name,updatedAt:c.updatedAt};validateBackup({...freshData(),versions:[v]});return v;
}
export function currentSource(data:UserData,kind:'reference'|'version'|'custom',id:string):PersonalVersion|undefined{
 if(kind==='reference'){const r=recipes.find(x=>x.id===id);return r?{...recipeDraft(r),id:r.id,updatedAt:'1970-01-01T00:00:00.000Z'}:undefined;}
 if(kind==='version')return data.versions.find(v=>v.id===id);
 const c=data.customRecipes.find(c=>c.id===id&&c.status==='ready');return c?customVersion(c):undefined;
}
export function addCollectionItem(c:RecipeCollection,source:'reference'|'version'|'custom',sourceId:string,snapshot:PersonalVersion):RecipeCollection{
 if(c.items.length>=50)throw Error('每个合集最多 50 条。');
 if(c.items.some(i=>i.source===source&&i.sourceId===sourceId&&i.snapshot.updatedAt===snapshot.updatedAt))throw Error('这个版本已在合集中。');
 return {...c,updatedAt:new Date().toISOString(),items:[...c.items,{id:crypto.randomUUID(),source,sourceId,snapshot:structuredClone(snapshot)}]};
}
export function sourceChanged(a:PersonalVersion,b:PersonalVersion){return JSON.stringify({name:a.name,servings:a.servings,amounts:a.amounts,note:a.note,snapshot:a.snapshot})!==JSON.stringify({name:b.name,servings:b.servings,amounts:b.amounts,note:b.note,snapshot:b.snapshot});}
