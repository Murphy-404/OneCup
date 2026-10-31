import test from 'node:test';
import assert from 'node:assert/strict';
import {recipes} from '../src/data';
import {freshData,recipeDraft,shoppingList,stepText,validateBackup,missingIngredients} from '../src/logic';
import {applySubstitution,candidates,preparationSteps} from '../src/substitutions';
import {toolsFor,missingTools,toolStatus} from '../src/equipment';
const get=(id:string)=>structuredClone(recipes.find(r=>r.id===id)!);
test('recipe-specific approximations resolve quantities, steps and snapshots without changing the catalogue',()=>{
 const source=get('vanilla-latte');const draft=recipeDraft(source);draft.amounts.milk=150;
 const resolved=applySubstitution(source,draft.amounts,'milk-oat');
 assert(!resolved.recipe.ingredients.some(i=>i.id==='milk'));assert.equal(resolved.amounts.oat,150);
 assert(resolved.recipe.steps.some(s=>s.includes('{oat}')));assert(resolved.recipe.name.includes('燕麦'));
 assert.equal(candidates(get('hot-latte'),'milk').length,0);
 assert.throws(()=>applySubstitution(get('hot-latte'),{},'milk-oat'));
 const saved={...draft,snapshot:resolved.recipe,amounts:resolved.amounts};
 const data={...freshData(),versions:[saved],equipment:{cup:'have' as const}};
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data))),data);
 assert(source.ingredients.some(i=>i.id==='milk'));
});
test('self-made syrup uses measured yield, expands shopping once and follows adjusted dose and servings',()=>{
 const r=get('matcha');const d=recipeDraft(r);d.amounts.syrup=20;
 assert.throws(()=>applySubstitution(r,d.amounts,'syrup-home'));
 const resolved=applySubstitution(r,d.amounts,'syrup-home',150);
 const item={...d,servings:1.5,amounts:resolved.amounts,snapshot:resolved.recipe};
 const other={...structuredClone(item),id:'other',servings:1};
 const list=shoppingList([item,other]);
 assert(!list.some(i=>i.id==='syrup'));assert(Math.abs(list.find(i=>i.id==='sugar')!.amount-100)<1e-8);
 // Drinking water in ml must not merge with syrup input water in g.
 assert.equal(list.filter(i=>i.id==='water').length,2);
 assert(preparationSteps(resolved.recipe,1.5,resolved.amounts)[0].includes('20.0 g'));
 assert.deepEqual(validateBackup({...freshData(),plan:[item]}).plan,[item]);
 assert(!missingIngredients(resolved.recipe,{sugar:'have',water:'have',milk:'have',matcha:'have',ice:'have'}).some(i=>i.id==='syrup'));
});
test('espresso preparation requires actual input and volume, never matches beans alone',()=>{
 const r=get('oat-latte');const d=recipeDraft(r);
 assert.throws(()=>applySubstitution(r,d.amounts,'espresso-home',30));
 const result=applySubstitution(r,d.amounts,'espresso-home',36,18,60);
 assert(missingTools(result.recipe,{}).some(t=>t.id==='espressoMachine'));
 assert(missingIngredients(result.recipe,{coffeebeans:'have'}).some(i=>i.id==='groundcoffee'));
 assert(preparationSteps(result.recipe,2,result.amounts)[0].includes('60.0 ml'));
 assert.doesNotThrow(()=>validateBackup({...freshData(),versions:[{...d,amounts:result.amounts,snapshot:result.recipe}]}));
});
test('instant coffee variant includes a preparation step and no espresso requirement; no tonic-to-soda rule',()=>{
 const r=get('oat-latte'),d=recipeDraft(r);const result=applySubstitution(r,d.amounts,'instant-base');
 assert.equal(result.amounts.instantcoffee,2);assert(result.recipe.steps[0].includes('{instantcoffee}'));
 assert(!result.recipe.ingredients.some(i=>i.id==='espresso'));
 for(const step of result.recipe.steps)assert(!stepText(step,result.recipe,result.amounts,2).includes('{'));
 assert.equal(candidates(get('gin-tonic'),'tonic').length,0);
});
test('required, optional and substitute equipment stay distinct and invalid backups fail',()=>{
 const r=get('daiquiri');const shaker=toolsFor(r).find(t=>t.id==='shaker')!;
 assert.equal(toolStatus(shaker,{sealedjar:'have'}),'alternative');
 assert.equal(missingTools(r,{cup:'have',measure:'have',sealedjar:'have',sieve:'have'}).length,0);
 assert.throws(()=>validateBackup({...freshData(),equipment:{anything:'have'}}));
 const d=recipeDraft(get('matcha'));const result=applySubstitution(d.snapshot,d.amounts,'syrup-home',150);
 result.recipe.preparations![0].inputs[0].unit='ml';
 assert.throws(()=>validateBackup({...freshData(),versions:[{...d,snapshot:result.recipe}]}));
 const {equipment:_,...old}=freshData();assert.deepEqual(validateBackup(old).equipment,{});
});
