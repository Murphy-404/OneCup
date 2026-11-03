import {useState} from 'react';
import {X,Expand} from 'lucide-react';
import type {Recipe} from '../data';
import {recipePhotoSource,recipePhotoCaption} from '../photo';
import {RecipePhoto} from './RecipePhoto';
import {Modal} from './Modal';
export function RecipePreview({recipe}:{recipe:Recipe}){
 const [open,setOpen]=useState(false),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 const path=recipePhotoSource(recipe),caption=`${recipe.name} · ${recipePhotoCaption(recipe)}`;
 if(!path)return <RecipePhoto recipe={recipe}/>;
 const src=attempt&&!recipe.photo?`${path}?retry=${attempt}`:path;
 const error=<div className="preview-error" role="status"><p>图片加载失败，请重试。</p><button className="secondary-button" onClick={()=>{setFailed(false);setAttempt(n=>n+1);}}>重新加载图片</button></div>;
 return <><div className="recipe-preview complete-preview single-preview"><button className="preview-image-button" aria-label="查看完整成品图" onClick={()=>setOpen(true)}>{failed?<RecipePhoto recipe={recipe}/>:<img key={attempt} src={src} alt={caption} onError={()=>setFailed(true)}/>}<Expand size={16} aria-hidden="true"/></button>{failed&&error}<button className="preview-zoom text-button" onClick={()=>setOpen(true)}>放大预览</button><p className="single-image-note">{recipePhotoCaption(recipe)}{recipe.resolutions?.length?' · 替代后的颜色与泡沫可能不同':''}</p></div>{open&&<Modal label="完整成品预览" className="image-modal" onClose={()=>setOpen(false)}><div className="dialog-top"><h2>{recipe.name}</h2><button className="icon-button" aria-label="关闭图片预览" onClick={()=>setOpen(false)}><X size={22}/></button></div><div className="image-fit-area">{failed?error:<img key={attempt} src={src} alt={caption} onError={()=>setFailed(true)}/>}</div><div className="image-viewer-footer"><p>{recipePhotoCaption(recipe)} · 成品以实际制作为准</p></div></Modal>}</>;
}
