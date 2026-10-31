import test from 'node:test';
import assert from 'node:assert/strict';
import {recipes} from '../src/data';
import {applySubstitution,undoSubstitution,candidates,canUndoResolution,batchSteps} from '../src/substitutions';
import {recipeDraft,freshData,shoppingList,stepText,validateBackup} from '../src/logic';
import {toolsFor} from '../src/equipment';
const draft=(id:string)=>recipeDraft(structuredClone(recipes.find(r=>r.id===id)!));
test('milk undo retains current volume, unrelated edits, original order and source immutability',()=>{
 const d=draft('vanilla-latte');d.amounts.milk=145;d.amounts.vanilla=8;const original=structuredClone(d);
 const applied=applySubstitution(d.snapshot,d.amounts,'milk-oat');applied.amounts.oat=123.5;
 const beforeUndo=structuredClone(applied);const result=undoSubstitution(applied.recipe,applied.amounts,'milk-oat');
 assert.equal(result.amounts.milk,123.5);assert.equal(result.amounts.vanilla,8);assert(!('oat'in result.amounts));assert.deepEqual(result.recipe.ingredients,d.snapshot.ingredients);
 assert.deepEqual(result.recipe.steps,d.snapshot.steps);assert.deepEqual(result.recipe.reference,d.snapshot.reference);assert.equal(result.recipe.name,d.snapshot.name);assert.deepEqual(result.recipe.tags,d.snapshot.tags);
 assert.deepEqual(d,original);assert.deepEqual(applied,beforeUndo);assert.equal(candidates(result.recipe,'milk')[0].id,'milk-oat');
});
for(const order of [['milk-oat','espresso-home'],['espresso-home','milk-oat']])for(const removed of ['milk-oat','espresso-home']){
 test(`independent schemes ${order.join(' then ')}: undo ${removed} preserves the other scheme after backup`,()=>{
  const d=draft('vanilla-latte');let current={recipe:d.snapshot,amounts:d.amounts};
  for(const id of order)current=applySubstitution(current.recipe,current.amounts,id,36,18,60);
  const saved={...d,name:'我的自定义名字',note:'保留笔记',servings:2.5,snapshot:current.recipe,amounts:{...current.amounts,vanilla:9}};
  const restored=validateBackup(JSON.parse(JSON.stringify({...freshData(),versions:[saved],plan:[{...saved,id:'plan'}]}))).versions[0];
  const result=undoSubstitution(restored.snapshot,restored.amounts,removed);
  assert.equal(result.recipe.resolutions?.length,1);assert.equal(result.recipe.resolutions![0].id,order.find(id=>id!==removed));assert.equal(result.amounts.vanilla,9);
  assert.equal(restored.name,'我的自定义名字');assert.equal(restored.note,'保留笔记');assert.equal(restored.servings,2.5);
  assert.equal(result.recipe.ingredients.some(i=>i.id==='oat'),removed!=='milk-oat');assert.equal(toolsFor(result.recipe).some(t=>t.id==='espressoMachine'),removed!=='espresso-home');
  assert.doesNotThrow(()=>validateBackup({...freshData(),versions:[{...restored,snapshot:result.recipe,amounts:result.amounts}]}));
 });
}
test('undoing self preparation restores finished-ingredient procurement while retaining the current dose',()=>{
 const d=draft('mojito');const syrup=applySubstitution(d.snapshot,d.amounts,'syrup-home',150);syrup.amounts.syrup=27;
 const result=undoSubstitution(syrup.recipe,syrup.amounts,'syrup-home');assert.equal(result.amounts.syrup,27);assert.equal(batchSteps(result.recipe,2,result.amounts).length,0);
 const rows=shoppingList([{...d,servings:2,snapshot:result.recipe,amounts:result.amounts}]);assert.equal(rows.find(i=>i.id==='syrup')!.amount,54);assert(!rows.some(i=>i.id==='sugar'));
 assert(!toolsFor(result.recipe).some(t=>t.id==='heater'));assert.equal(candidates(result.recipe,'syrup').length,1);
});
test('instant undo restores pre-adoption espresso volume without pretending later powder edits are equivalent',()=>{
 const d=draft('oat-latte');d.amounts.espresso=45;const applied=applySubstitution(d.snapshot,d.amounts,'instant-base');applied.amounts.instantcoffee=4;applied.amounts.water=70;applied.amounts.oat=155;
 const result=undoSubstitution(applied.recipe,applied.amounts,'instant-base');assert.equal(result.amounts.espresso,45);assert.equal(result.amounts.oat,155);assert(!('instantcoffee'in result.amounts));assert(!('water'in result.amounts));
 assert.deepEqual(result.recipe.ingredients,d.snapshot.ingredients);assert.deepEqual(result.recipe.steps,d.snapshot.steps);assert.equal(result.recipe.name,d.snapshot.name);assert(!toolsFor(result.recipe).some(t=>t.id==='heater'));
 for(const step of result.recipe.steps)assert(!stepText(step,result.recipe,result.amounts,2).includes('{'));
});
test('legacy approximation is readable but cannot destructively undo without original data; legacy self preparation can undo',()=>{
 const d=draft('vanilla-latte'),a=applySubstitution(d.snapshot,d.amounts,'milk-oat');delete a.recipe.resolutions![0].undo;
 assert.doesNotThrow(()=>validateBackup({...freshData(),versions:[{...d,snapshot:a.recipe,amounts:a.amounts}]}));assert.equal(canUndoResolution(a.recipe.resolutions![0]),false);assert.throws(()=>undoSubstitution(a.recipe,a.amounts,'milk-oat'));
 const self=applySubstitution(d.snapshot,d.amounts,'espresso-home',30,18,60);delete self.recipe.resolutions![0].undo;assert.doesNotThrow(()=>undoSubstitution(self.recipe,self.amounts,'espresso-home'));
});
test('repeated adoption and undo neither accumulates steps nor mutates saved plans',()=>{
 const d=draft('oat-latte'),plan={...structuredClone(d),id:'old-plan'};let state={recipe:d.snapshot,amounts:d.amounts};
 for(let i=0;i<8;i++){state=applySubstitution(state.recipe,state.amounts,'instant-base');assert.equal(state.recipe.steps.length,d.snapshot.steps.length+1);state=undoSubstitution(state.recipe,state.amounts,'instant-base');assert.deepEqual(state.recipe.steps,d.snapshot.steps);}
 assert.deepEqual(plan.snapshot,d.snapshot);assert.throws(()=>undoSubstitution(state.recipe,state.amounts,'unknown'));
});
test('invalid measurement boundaries reject NaN, infinities, absent data and out-of-range values',()=>{
 const syrup=draft('matcha'),coffee=draft('oat-latte');for(const n of [NaN,Infinity,-1,0,49.9,300.1])assert.throws(()=>applySubstitution(syrup.snapshot,syrup.amounts,'syrup-home',n));
 for(const n of [50,300])assert.doesNotThrow(()=>applySubstitution(syrup.snapshot,syrup.amounts,'syrup-home',n));
 for(const args of [[NaN,18,60],[30,0,60],[30,51,60],[30,18,501],[4,18,60],[201,18,60]])assert.throws(()=>applySubstitution(coffee.snapshot,coffee.amounts,'espresso-home',...args as [number,number,number]));
});
test('malformed undo metadata is rejected before recovery, leaving the current source untouched',()=>{
 const d=draft('oat-latte'),a=applySubstitution(d.snapshot,d.amounts,'instant-base');const saved={...d,snapshot:a.recipe,amounts:a.amounts};
 for(const modify of [(u:any)=>u.replacements=['milk'],(u:any)=>u.original.id='water',(u:any)=>u.indexBefore=-1,(u:any)=>u.edits=[{before:23,after:'bad'}],(u:any)=>u.edits[1].before='加入 {notKnown}',(u:any)=>u.amountBefore=NaN]){const bad=structuredClone(saved);modify(bad.snapshot.resolutions![0].undo);assert.throws(()=>validateBackup({...freshData(),versions:[bad]}));}
 assert.doesNotThrow(()=>validateBackup({...freshData(),versions:[saved]}));
});
