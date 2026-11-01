import {useState} from 'react';
import {X,Expand} from 'lucide-react';
import type {Recipe} from '../data';
import {Modal} from './Modal';
const variants:Record<string,string[]>={matcha:['高直杯','矮口杯','玻璃马克杯'],'espresso-tonic':['高球杯','古典杯','无脚酒杯'],'oat-latte':['高直杯','矮口杯','玻璃马克杯'],'hot-latte':['陶瓷杯碟','玻璃马克杯','宽口马克杯'],mojito:['高球杯','竖纹高杯','玻璃马克杯'],'whisky-highball':['高球杯','竖纹高杯','无脚高杯']};
export function VesselPreview({recipe,fallback}:{recipe:Recipe;fallback:React.ReactNode}){
 const [index,setIndex]=useState(0);const [open,setOpen]=useState(false);const [failed,setFailed]=useState(false);const [attempt,setAttempt]=useState(0);const names=variants[recipe.id];
 const path=names?`/images/vessels/${recipe.id}-${index}.webp`:`/images/recipes/${recipe.id}.webp`;
 const src=attempt?`${path}?retry=${attempt}`:path;
 const error=<div className="preview-error" role="status"><p>图片加载失败，请检查网络后重试。</p><button className="secondary-button" onClick={()=>{setFailed(false);setAttempt(n=>n+1);}}>重新加载图片</button></div>;
 const caption=`${recipe.name}${names?' · '+names[index]:''} · AI 呈现示意`;
 const controls=names&&<div className="vessel-controls" role="group" aria-label="预览杯型">{names.map((name,i)=><button key={name} aria-pressed={index===i} onClick={()=>{setIndex(i);setFailed(false);}}>{name}</button>)}</div>;
 if(recipe.id.startsWith('custom-'))return <div className="private-cover"><span>私人配方 · 暂无成品图</span><p>按材料和步骤制作，不借用其他饮品图片。</p></div>;
 return <><div className={`vessel-preview complete-preview ${names?'':'single-preview'}`}><button className="preview-image-button" aria-label="查看完整成品图" onClick={()=>setOpen(true)}>{failed?fallback:<img src={src} alt={caption} onError={()=>setFailed(true)}/>}<Expand size={16} aria-hidden="true"/></button>{failed&&error}{controls}<button className="preview-zoom text-button" onClick={()=>setOpen(true)}>放大预览</button><details className="vessel-help"><summary>AI 示意 · 杯型与容量说明</summary><p className="vessel-note">切换杯型不改变份数。请选择足够容纳饮品与冰块、并留有空间的杯子。{recipe.resolutions?.length?'当前图片为原版，替代后颜色与泡沫可能不同。':''}</p></details></div>{open&&<Modal label="完整成品预览" className="image-modal" onClose={()=>setOpen(false)}><div className="dialog-top"><h2>{recipe.name}</h2><button className="icon-button" aria-label="关闭图片预览" onClick={()=>setOpen(false)}><X size={22}/></button></div><div className="image-fit-area">{failed?error:<img src={src} alt={caption} onError={()=>setFailed(true)}/>}</div><div className="image-viewer-footer">{controls}<p>AI 呈现示意 · 杯型切换不改变用量{recipe.resolutions?.length?' · 当前为原版图':''}</p></div></Modal>}</>;
}
