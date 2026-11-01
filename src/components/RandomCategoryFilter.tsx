import {categories,type Category} from '../data';

export function RandomCategoryFilter({value,onChange,label='随机分类'}:{value:Category;onChange:(category:Category)=>void;label?:string}){
 return <div className="random-category-filter" role="group" aria-label={label}>{categories.map(c=><button key={c.id} type="button" aria-pressed={value===c.id} onClick={()=>onChange(c.id)}>{c.id==='all'?'不限':c.name}</button>)}</div>;
}
