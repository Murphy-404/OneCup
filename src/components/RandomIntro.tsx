import {ChevronDown,Dices} from 'lucide-react';
import {categories,type Category} from '../data';
import {RandomCategoryFilter} from './RandomCategoryFilter';

export function RandomIntro({count,category,onCategoryChange,onDraw,onBrowse}:{count:number;category:Category;onCategoryChange:(category:Category)=>void;onDraw:()=>void;onBrowse:()=>void}){
 return <section className="mobile-random-intro" aria-labelledby="random-intro-title">
  <div className="mobile-random-heading"><h1 id="random-intro-title">今天喝什么？</h1><p>给选择一点惊喜，给自己一杯好喝的。</p></div>
  <div className="mobile-random-visual" aria-hidden="true">
   <img src="/images/random-drinks.svg" alt="" width="640" height="480" fetchPriority="high"/>
   <span>饮品插画 · 成品以实际制作为准</span>
  </div>
  <div className="mobile-random-actions">
   <RandomCategoryFilter value={category} onChange={onCategoryChange}/>
   <button className="primary-button mobile-random-draw" onClick={onDraw}><Dices size={26} strokeWidth={1.7}/>随机一杯</button>
   <p className="mobile-random-hint">{count?`${category==='all'?'全部分类':categories.find(c=>c.id===category)?.name} · ${count} 款可选，每次独立随机`:'当前筛选没有候选，可向下调整条件'}</p>
   <button className="mobile-random-browse" onClick={onBrowse}>自己选，浏览配方<ChevronDown size={17}/></button>
  </div>
 </section>;
}
