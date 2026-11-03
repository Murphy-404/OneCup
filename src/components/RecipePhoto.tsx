import {useState} from 'react';
import {Coffee} from 'lucide-react';
import type {Recipe} from '../data';
import {recipePhotoSource,recipePhotoCaption} from '../photo';
export function RecipePhoto({recipe,className=''}:{recipe:Recipe;className?:string}){
 const src=recipePhotoSource(recipe),[failed,setFailed]=useState<string>();
 if(!src||failed===src)return <div className="private-cover"><Coffee size={36}/><span>{src?'图片加载失败':recipePhotoCaption(recipe)}</span></div>;
 return <div className={`drink-photo ${recipe.photo?'user-photo':''} ${className}`}><img src={src} alt={`${recipe.name}，${recipePhotoCaption(recipe)}`} loading="lazy" onError={()=>setFailed(src)}/></div>;
}
