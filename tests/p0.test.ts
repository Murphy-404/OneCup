import test from 'node:test';
import assert from 'node:assert/strict';
import {recipes} from '../src/data';
import {freshData,recipeDraft,validateBackup} from '../src/logic';
import {applySubstitution,solutionRequirements} from '../src/substitutions';
import {toolsFor} from '../src/equipment';

test('reference specifications are complete, preserved in snapshots, and updated when adopting a substitute',()=>{
 for(const r of recipes){assert.equal(r.reference?.status,'reference');for(const i of r.ingredients)assert(r.reference!.specs[i.id],`${r.id}/${i.id}`);assert(r.reference!.timeNote.includes('不含'));}
 const r=recipes.find(r=>r.id==='vanilla-latte')!,d=recipeDraft(r),v=applySubstitution(r,d.amounts,'milk-oat');assert(v.recipe.reference!.specs.oat);assert(!v.recipe.reference!.specs.milk);
 const data={...freshData(),versions:[{...d,snapshot:v.recipe,amounts:v.amounts}]};assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data))),data);
 const old=recipeDraft(recipes[0]);delete old.snapshot.reference;assert.doesNotThrow(()=>validateBackup({...freshData(),versions:[old]}));
 assert.deepEqual(solutionRequirements('instant-base').materials,['instantcoffee','water']);
});
test('recovery rejects a tampered self-made batch that would change procurement amounts',()=>{
 const d=recipeDraft(recipes[0]),result=applySubstitution(d.snapshot,d.amounts,'syrup-home',150);const saved={...d,snapshot:result.recipe,amounts:result.amounts};
 const bad=structuredClone(saved);bad.snapshot.preparations![0].batch!.inputs[0].amount=200;assert.throws(()=>validateBackup({...freshData(),plan:[bad]}));
 assert.doesNotThrow(()=>validateBackup({...freshData(),plan:[saved]}));
});
test('saved equipment requirements remain frozen while adopting a rule recomputes its actual tools',()=>{
 const d=recipeDraft(recipes.find(r=>r.id==='oat-latte')!);assert.deepEqual(toolsFor(d.snapshot),d.snapshot.toolRequirements);
 d.snapshot.method='热调';assert(!toolsFor(d.snapshot).some(t=>t.id==='heater'),'saved requirements do not silently follow future inference changes');
 const result=applySubstitution(d.snapshot,d.amounts,'instant-base');assert(toolsFor(result.recipe).some(t=>t.id==='heater'));
 const invalid=recipeDraft(recipes[0]);invalid.snapshot.toolRequirements=[{id:'unknown-machine'}];assert.throws(()=>validateBackup({...freshData(),versions:[invalid]}));
});
