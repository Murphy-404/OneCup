import {recipePhotoSource,recipePhotoCaption} from '../photo';
import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Check,Timer} from 'lucide-react';
import type {Recipe} from '../data';
import {ingredientName} from '../data';
import {amountText,stepText} from '../logic';
import type {EquipmentStock} from '../equipment';
import {RecipeEquipment} from './EquipmentPanel';
import {BrewTimer} from './BrewTimer';
export function MakingGuide({recipe:r,steps,servings,amounts,equipment,step,setStep,checked,setChecked,onDone}:{recipe:Recipe;steps:string[];servings:number;amounts:Record<string,number>;equipment:EquipmentStock;step:number;setStep:(n:number)=>void;checked:string[];setChecked:(ids:string[])=>void;onDone:()=>void}){
 const [tab,setTab]=useState<'step'|'materials'|'equipment'>('step');const [timerStatus,setTimerStatus]=useState('未启动');const [imageFailed,setImageFailed]=useState(false);const content=useRef<HTMLDivElement>(null);
 useEffect(()=>{content.current?.scrollTo({top:0,behavior:'instant'});},[step,tab]);
 const ids=[...new Set([...steps[step].matchAll(/\{(\w+)\}/g)].map(m=>m[1]))];
 const used=r.ingredients.filter(i=>ids.includes(i.id));
 return <section className="making-guide"><header className="guide-heading"><h2>{r.name}<small>{servings} 份</small></h2><nav className="guide-stepper" aria-label={`第 ${step+1} 步，共 ${steps.length} 步`}>{steps.map((_,i)=><button key={i} className={i===step?'current':i<step?'done':''} aria-label={`跳到第 ${i+1} 步`} aria-current={i===step?'step':undefined} onClick={()=>{setTab('step');setStep(i);}}><span>{i+1}</span><small>{i===step?'当前步骤':i<step?'已完成':'待制作'}</small></button>)}</nav><div className="guide-tabs" role="tablist" aria-label="制作视图">{([{id:'step',name:'当前步骤'},{id:'materials',name:`材料 ${checked.length}/${r.ingredients.length}`},{id:'equipment',name:'器具'}] as const).map(t=><button key={t.id} role="tab" id={`guide-tab-${t.id}`} aria-selected={tab===t.id} aria-controls="guide-panel" onClick={()=>setTab(t.id)}>{t.name}</button>)}</div></header>
 <div className="guide-scroll" id="guide-panel" role="tabpanel" aria-labelledby={`guide-tab-${tab}`} ref={content} tabIndex={0}>
 {tab==='step'?<>{!imageFailed&&recipePhotoSource(r)&&<figure className="guide-visual"><img src={recipePhotoSource(r)} alt={`${r.name}，${recipePhotoCaption(r)}`} onError={()=>setImageFailed(true)}/><figcaption>{recipePhotoCaption(r)}</figcaption></figure>}<p className="step-counter">第 {step+1} / {steps.length} 步{step<(r.preparations?.length??0)&&<span> · 前置准备</span>}</p><h3 className="making-step" aria-live="polite" aria-atomic="true">{stepText(steps[step],r,amounts,servings)}</h3>{used.length>0&&<section className="step-amounts" aria-label="本步用量"><h4>本步用量</h4>{used.map(i=><span key={i.id}>{ingredientName(i.id)} <strong>{amountText((amounts[i.id]??i.amount)*servings,i.unit)}</strong></span>)}</section>}<details className="guide-step-list"><summary>查看全部步骤</summary><ol>{steps.map((text,i)=><li key={i}><button aria-current={step===i?'step':undefined} onClick={()=>setStep(i)}><span>{i+1}</span>{stepText(text,r,amounts,servings)}</button></li>)}</ol></details></>:tab==='materials'?<section className="guide-materials"><h3>确认材料准备</h3><p className="small-muted">勾选只用于本次制作，不扣减库存。</p>{r.ingredients.map(i=><label key={i.id}><input type="checkbox" checked={checked.includes(i.id)} onChange={e=>setChecked(e.target.checked?[...checked,i.id]:checked.filter(id=>id!==i.id))}/><span>{ingredientName(i.id)}{i.optional?'（可选）':''}</span><strong>{amountText((amounts[i.id]??i.amount)*servings,i.unit)}</strong></label>)}</section>:<RecipeEquipment recipe={r} stock={equipment}/>}
 </div>
 <details className="guide-timer"><summary><Timer size={16}/><span>制作计时器</span><strong aria-live="off">{timerStatus}</strong></summary><BrewTimer visible compact onStatus={setTimerStatus}/></details>
 <footer className="guide-actions"><button className="secondary-button" disabled={step===0} onClick={()=>{setTab('step');setStep(step-1);}}><ChevronLeft size={17}/>上一步</button><button className="primary-button" onClick={()=>{if(step===steps.length-1)onDone();else{setTab('step');setStep(step+1);}}}>{step===steps.length-1?'做好了':'下一步'}{step===steps.length-1?<Check size={17}/>:<ChevronRight size={17}/>}</button></footer>
 </section>;
}
