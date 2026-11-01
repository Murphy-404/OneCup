import {ChevronDown,Dices} from 'lucide-react';
import {categories,type Category} from '../data';
import {RandomCategoryFilter} from './RandomCategoryFilter';

export function MobileRandomIntro({count,category,onCategoryChange,onDraw,onBrowse}:{count:number;category:Category;onCategoryChange:(category:Category)=>void;onDraw:()=>void;onBrowse:()=>void}){
 return <section className="mobile-random-intro" aria-labelledby="mobile-random-title">
  <div className="mobile-random-heading"><h1 id="mobile-random-title">今天喝什么？</h1><p>不纠结，先抽一杯喜欢的。</p></div>
  <div className="mobile-random-visual" aria-hidden="true">
   <img className="random-drink random-drink-left" src="/images/recipes/espresso-tonic.webp" alt="" width="240" height="320"/>
   <img className="random-drink random-drink-right" src="/images/recipes/oat-latte.webp" alt="" width="240" height="320"/>
   <img className="random-drink random-drink-center" src="/images/recipes/matcha.webp" alt="" width="240" height="320"/>
   <span>AI 饮品示意</span>
  </div>
  <div className="mobile-random-actions">
   <RandomCategoryFilter value={category} onChange={onCategoryChange}/>
   <button className="primary-button mobile-random-draw" onClick={onDraw}><Dices size={26} strokeWidth={1.7}/>随机一杯</button>
   <p className="mobile-random-hint">{count?`${category==='all'?'全部分类':categories.find(c=>c.id===category)?.name} · ${count} 款可选，每次独立随机`:'当前筛选没有候选，可向下调整条件'}</p>
   <button className="mobile-random-browse" onClick={onBrowse}>自己选，浏览配方<ChevronDown size={17}/></button>
  </div>
 </section>;
}
