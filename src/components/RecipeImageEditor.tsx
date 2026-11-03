import {useEffect,useRef,useState} from 'react';
import {ImagePlus,Trash2} from 'lucide-react';
import {prepareRecipePhoto} from '../photo-upload';
export function RecipeImageEditor({photo,onChange,onBusyChange,disabled=false}:{photo?:string;onChange:(photo:string|undefined)=>void;onBusyChange:(busy:boolean)=>void;disabled?:boolean}){
 const input=useRef<HTMLInputElement>(null),generation=useRef(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>{generation.current++;},[]);
 async function select(file?:File){
  if(!file)return;const ticket=++generation.current;setBusy(true);onBusyChange(true);setError('');
  try{const next=await prepareRecipePhoto(file);if(ticket===generation.current)onChange(next);}catch(e){if(ticket===generation.current)setError((e as Error).message);}
  finally{if(ticket===generation.current){setBusy(false);onBusyChange(false);if(input.current)input.current.value='';}}
 }
 return <section className="recipe-image-editor" aria-label="配方图片"><h3>配方图片</h3>{photo?<img className="editor-photo-preview" src={photo} alt="当前配方图片"/>:<div className="editor-photo-empty"><ImagePlus size={28}/><span>添加一张自己的饮品照片</span></div>}<div className="library-actions"><button type="button" disabled={disabled||busy} className="secondary-button" onClick={()=>input.current?.click()}><ImagePlus size={16}/>{busy?'正在处理图片…':photo?'更换图片':'上传图片'}</button>{photo&&<button type="button" disabled={disabled||busy} className="text-button" onClick={()=>{onChange(undefined);setError('');}}><Trash2 size={16}/>移除图片</button>}</div><input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择配方图片" disabled={disabled||busy} onChange={e=>void select(e.target.files?.[0])}/><p className="small-muted">JPG、PNG、WebP，原图不超过 10 MB。自动缩小并压缩，保存配方后写入数据库，备份也包含图片。</p>{busy&&<p role="status">正在处理图片，请完成后再保存配方。</p>}{error&&<p className="editor-error" role="alert">{error} 原有图片未修改。</p>}</section>;
}
