import {readFileSync} from 'node:fs';
import {recipes} from '../src/data';
import {freshData} from '../src/logic';
import {emptyCustom,customVersion,addCollectionItem} from '../src/library';
export const photoSample='data:image/webp;base64,'+readFileSync(new URL('../public/images/recipes/matcha.webp',import.meta.url)).toString('base64');
export function workspaceWithPhoto(){
 const custom=emptyCustom();custom.recipe={...structuredClone(recipes[0]),id:custom.id,name:'测试图片配方',photo:photoSample};custom.status='ready';
 const version=customVersion(custom),collection=addCollectionItem({id:'photo-collection',name:'图片快照',description:'',items:[],updatedAt:custom.updatedAt},'custom',custom.id,version);
 return {...freshData(),customRecipes:[custom],versions:[version],plan:[{...structuredClone(version),id:'photo-plan'}],collections:[collection]};
}
