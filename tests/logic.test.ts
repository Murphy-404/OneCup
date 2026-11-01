import test from 'node:test';
import assert from 'node:assert/strict';
import { recipes, ingredients } from '../src/data';
import { freshData, recipeDraft, shoppingList, pickRandom, missingIngredients, stepText, validateBackup, type PersonalVersion } from '../src/logic';

test('catalogue has six recipes in each category, known ingredients and valid step references',()=>{
  assert.equal(recipes.length,24);
  for(const category of ['coffee','tea','fruit','cocktail']) assert.equal(recipes.filter(r=>r.category===category).length,6);
  assert.equal(new Set(recipes.map(r=>r.id)).size,24);
  const known=new Set(ingredients.map(i=>i.id));
  for(const r of recipes){
    for(const i of r.ingredients) assert(known.has(i.id));
    for(const step of r.steps) for(const [,id] of step.matchAll(/\{(\w+)\}/g)) assert(r.ingredients.some(i=>i.id===id),`${r.id}: ${id}`);
    assert.equal(r.alcohol,r.category==='cocktail');
  }
});
test('strict inventory distinguishes optional ingredients and accepts low stock, but never assumes water or ice',()=>{
  const r=recipes.find(r=>r.id==='espresso-tonic')!;
  assert.equal(missingIngredients(r,{}).length,3);
  assert.deepEqual(missingIngredients(r,{espresso:'low',tonic:'have',ice:'have'}),[]);
  assert.deepEqual(missingIngredients(r,{espresso:'have',tonic:'have',ice:'none'}).map(i=>i.id),['ice']);
});
test('step quantities follow edited base amounts and serving scale without cumulative rounding',()=>{
  const r=recipes[0];
  const amounts=Object.fromEntries(r.ingredients.map(i=>[i.id,i.amount]));
  amounts.matcha=2.75;
  const text=stepText(r.steps[0],r,amounts,2);
  assert(text.includes('80 ml'));assert(text.includes('5.5 g'));
  for(let i=0;i<20;i++)stepText(r.steps[0],r,amounts,1.5);
  assert.equal(amounts.matcha,2.75);
});
test('independent random selection handles empty and single candidates without mutating inputs',()=>{
  const ids=['a','b','c'];assert.equal(pickRandom([],()=>0),undefined);assert.equal(pickRandom(['one'],()=>.8),'one');pickRandom(ids,()=>.5);assert.deepEqual(ids,['a','b','c']);
});
test('each eligible item has an equal random interval, including first and last',()=>{
  const ids=recipes.map(r=>r.id);assert.deepEqual(ids.map((_,i)=>pickRandom(ids,()=>(i+.5)/ids.length)),ids);assert.equal(pickRandom(ids,()=>0),ids[0]);assert.equal(pickRandom(ids,()=>.99999999),ids.at(-1));
});
test('every click draws independently and repeated results are allowed without a pool',()=>{
  const ids=['a','b','c'];const values=[0,0,.99,0];assert.deepEqual(values.map(value=>pickRandom(ids,()=>value)),['a','a','c','a']);assert.equal(ids.length,3);
});
function backup(){
  const snapshot=structuredClone(recipes[0]);
  const version:PersonalVersion={id:'test-version',recipeId:snapshot.id,name:'少甜抹茶',servings:2,amounts:Object.fromEntries(snapshot.ingredients.map(i=>[i.id,i.amount])),note:'糖浆减半',snapshot,updatedAt:new Date().toISOString()};
  version.amounts.syrup=5;
  return {...freshData(),favorites:[snapshot.id],stock:{milk:'have' as const},versions:[version]};
}
test('backup round trip preserves personal quantities and full recipe snapshot',()=>{
  const original=backup();assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(original))),original);
});
test('backup rejects malformed snapshots, invalid amounts, unknown materials and duplicated version IDs',()=>{
  assert.throws(()=>validateBackup({schemaVersion:2}));
  const badAmount=backup();badAmount.versions[0].amounts.milk=-1;assert.throws(()=>validateBackup(badAmount));
  const missing=backup();delete missing.versions[0].amounts.milk;assert.throws(()=>validateBackup(missing));
  const badStep=backup();badStep.versions[0].snapshot.steps=['加入 {undefinedIngredient}'];assert.throws(()=>validateBackup(badStep));
  const duplicate=backup();duplicate.versions.push(duplicate.versions[0]);assert.throws(()=>validateBackup(duplicate));
  assert.throws(()=>validateBackup({...freshData(),stock:{anything:'have'}}));
});
test('old v1 backups gain an empty plan; plans preserve custom amounts and reject malformed or excessive entries',()=>{
  const {plan:_plan,...old}=backup();
  assert.deepEqual(validateBackup(old).plan,[]);
  const data=backup();data.plan=[recipeDraft(recipes[0])];data.plan[0].servings=2.5;data.plan[0].amounts.milk=137.5;
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data))),data);
  const broken=structuredClone(data);delete broken.plan[0].amounts.milk;
  assert.throws(()=>validateBackup(broken));
  assert.throws(()=>validateBackup({...data,plan:[data.plan[0],data.plan[0]]}));
  assert.throws(()=>validateBackup({...data,plan:Array.from({length:31},()=>recipeDraft(recipes[0]))}));
});
test('shopping list sums edited quantities by servings, excludes optional ingredients and keeps units separate',()=>{
  const first=recipeDraft(recipes[0]);first.servings=2;first.amounts.milk=125.25;
  const second=structuredClone(first);second.id='second';second.servings=.5;second.amounts.milk=100;
  const rows=shoppingList([first,second]);
  assert.equal(rows.find(row=>row.id==='milk')?.amount,300.5);
  for(const i of first.snapshot.ingredients.filter(i=>i.optional))assert(!rows.some(row=>row.id===i.id));
  const grams=structuredClone(second);grams.snapshot.ingredients.find(i=>i.id==='milk')!.unit='g';
  const units=shoppingList([first,grams]).filter(row=>row.id==='milk');
  assert.equal(units.length,2);assert.deepEqual(units.map(row=>row.unit).sort(),['g','ml']);
  assert.equal(first.amounts.milk,125.25);
});
