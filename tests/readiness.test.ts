import test from 'node:test';
import assert from 'node:assert/strict';
import {recipes,type StockStatus} from '../src/data';
import {recipeReadiness,matchesReadiness} from '../src/readiness';
import {toolsFor,type EquipmentStock} from '../src/equipment';
import {applySubstitution} from '../src/substitutions';
import {recipeDraft,validateBackup,freshData} from '../src/logic';
const get=(id:string)=>structuredClone(recipes.find(r=>r.id===id)!);
const materialStock=(id:string):Record<string,StockStatus>=>Object.fromEntries(get(id).ingredients.filter(i=>!i.optional).map(i=>[i.id,'have']));
const toolStock=(id:string):EquipmentStock=>Object.fromEntries(toolsFor(get(id)).filter(t=>!t.optional).map(t=>[t.id,'have']));
test('direct readiness requires both materials and tools; unknown is distinct from absent',()=>{
 const r=get('pineapple-soda'),materials=materialStock(r.id),tools=toolStock(r.id);
 const ready=recipeReadiness(r,materials,tools);assert.equal(ready.label,'原方材料器具齐备');assert(matchesReadiness(ready,'direct'));
 const unknown=recipeReadiness(r,materials,{});assert(!matchesReadiness(unknown,'direct'));assert(unknown.current.tools.every(t=>t.status==='unknown'));assert.equal(unknown.label,'准备条件待登记');
 const absent=recipeReadiness(r,{...materials,soda:'none'},tools);assert.equal(absent.current.materials[0].status,'none');assert.equal(absent.label,'仍有条件缺少');
});
test('optional decorations do not block and low stock still needs a quantity reminder',()=>{
 const r=get('gin-tonic'),stock=materialStock(r.id);stock.gin='low';const status=recipeReadiness(r,stock,toolStock(r.id));
 assert(status.current.conditionsMet);assert.deepEqual(status.current.lowStock,['gin']);assert(!status.current.materials.some(m=>m.id==='limewedge'));
});
test('water and ice are never presumed available; zero configured dose is excluded',()=>{
 const r=get('matcha'),stock=materialStock(r.id);delete stock.water;delete stock.ice;
 const status=recipeReadiness(r,stock,toolStock(r.id));assert.deepEqual(status.current.materials.map(m=>m.id).sort(),['ice','water']);
 const d=recipeDraft(r);d.amounts.ice=0;assert(!recipeReadiness(r,stock,toolStock(r.id),d.amounts).current.materials.some(m=>m.id==='ice'));
});
test('registered tool alternatives satisfy requirements without marking unknown primaries as owned',()=>{
 const r=get('daiquiri'),tools:EquipmentStock={cup:'have',measure:'have',sealedjar:'have',sieve:'have'};const saved=structuredClone(tools);
 const status=recipeReadiness(r,materialStock(r.id),tools);assert(status.current.conditionsMet);assert.equal(status.current.alternativeTools.length,2);assert.deepEqual(tools,saved);
});
test('self-made espresso path requires all extra materials and equipment and leaves measurement pending',()=>{
 const r=get('oat-latte'),stock={...materialStock(r.id),espresso:'none' as const,groundcoffee:'have' as const,water:'have' as const};const tools={...toolStock(r.id),espressoMachine:'have' as const,scale:'have' as const};
 const before=structuredClone({r,stock,tools});const status=recipeReadiness(r,stock,tools);
 assert.equal(status.best.kind,'preparation');assert(status.best.conditionsMet);assert(status.best.parameters.length);assert(matchesReadiness(status,'self'));assert(!matchesReadiness(status,'direct'));assert.equal(status.label,'有自制路径 · 需确认参数');assert.deepEqual({r,stock,tools},before);
});
test('beans alone cannot satisfy an espresso path; missing machine remains explicit',()=>{
 const r=get('oat-latte'),stock={...materialStock(r.id),espresso:'none' as const,coffeebeans:'have' as const,water:'have' as const};
 const status=recipeReadiness(r,stock,toolStock(r.id));const self=status.alternatives.find(p=>p.changes.some(c=>c.id==='espresso-home'))!;
 assert(self.materials.some(m=>m.id==='groundcoffee'));assert(self.tools.some(t=>t.requirement.id==='espressoMachine'));assert(!matchesReadiness(status,'self'));
});
test('instant alternative is conditional, requires heater and scale, and never silently applies',()=>{
 const r=get('oat-latte'),stock={...materialStock(r.id),espresso:'none' as const,instantcoffee:'have' as const,water:'have' as const};const tools={...toolStock(r.id),heater:'have' as const,scale:'have' as const};
 const status=recipeReadiness(r,stock,tools);assert.equal(status.label,'有近似路径 · 待采用');assert(matchesReadiness(status,'approx'));assert(!matchesReadiness(status,'direct'));assert(!r.resolutions?.length);
 const missingScale=recipeReadiness(r,stock,{...tools,scale:'none'});assert(!matchesReadiness(missingScale,'approx'));
 const d=recipeDraft(r),applied=applySubstitution(r,d.amounts,'instant-base');const adopted=recipeReadiness(applied.recipe,stock,{...tools,scale:'none'},applied.amounts);assert(adopted.current.tools.some(t=>t.requirement.id==='scale'));
});
test('two missing ingredients need a combined path; one rule alone cannot claim readiness',()=>{
 const r=get('vanilla-latte'),stock={...materialStock(r.id),espresso:'none' as const,milk:'none' as const,oat:'have' as const,groundcoffee:'have' as const,water:'have' as const};const tools={...toolStock(r.id),espressoMachine:'have' as const,scale:'have' as const};
 const status=recipeReadiness(r,stock,tools);assert.equal(status.best.changes.length,2);assert(status.best.conditionsMet);assert.equal(status.best.kind,'approximation');assert(status.best.parameters.length);assert(!status.alternatives.filter(p=>p.changes.length===1).some(p=>p.conditionsMet));
 assert.equal(status.alternatives.length,3);assert(!matchesReadiness(status,'self'));assert(matchesReadiness(status,'approx'));
});
test('unsupported tonic-to-soda and wrong recipe milk replacements are not invented',()=>{
 const gin=get('gin-tonic'),stock={...materialStock(gin.id),tonic:'none' as const,soda:'have' as const};assert.equal(recipeReadiness(gin,stock,toolStock(gin.id)).alternatives.length,0);
 const latte=get('hot-latte');const status=recipeReadiness(latte,{...materialStock(latte.id),milk:'none',oat:'have'},toolStock(latte.id));assert(!status.alternatives.some(p=>p.changes.some(c=>c.id==='milk-oat')));
});
test('adopted self snapshots evaluate their inputs even when the finished ingredient is marked owned',()=>{
 const d=recipeDraft(get('matcha')),self=applySubstitution(d.snapshot,d.amounts,'syrup-home',150);const saved={...d,snapshot:self.recipe,amounts:self.amounts};const restored=validateBackup(JSON.parse(JSON.stringify({...freshData(),versions:[saved]}))).versions[0];
 const stock=materialStock('matcha');const status=recipeReadiness(restored.snapshot,stock,toolStock('matcha'),restored.amounts);assert(status.current.materials.some(m=>m.id==='sugar'));assert(!status.current.materials.some(m=>m.id==='syrup'));assert.equal(status.current.kind,'preparation');
});
test('path generation is deterministic, honors frozen tools and does not overwrite optional requirements',()=>{
 const r=get('oat-latte'),before=structuredClone(r);const a=recipeReadiness(r,{},{}),b=recipeReadiness(r,{},{});assert.deepEqual(a,b);assert.deepEqual(r,before);assert.equal(a.alternatives.length,2);
 assert(r.toolRequirements!.find(t=>t.id==='scale')!.optional);assert(a.alternatives.find(p=>p.kind==='approximation')!.tools.some(t=>t.requirement.id==='scale'));
});
test('readiness filters and ranking distinguish direct, conditional and still-unprepared paths',()=>{
 const r=get('oat-latte'),direct=recipeReadiness(r,materialStock(r.id),toolStock(r.id));const missing=recipeReadiness(r,{},{});
 assert(direct.rank<missing.rank);assert(matchesReadiness(missing,'needs'));assert(!matchesReadiness(direct,'needs'));assert(matchesReadiness(missing,'all'));
});
