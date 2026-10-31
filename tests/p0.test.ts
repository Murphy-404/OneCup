import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {scryptSync} from 'node:crypto';
import {recipes} from '../src/data';
import {freshData,recipeDraft,validateBackup} from '../src/logic';
import {mergeGuestRecords} from '../src/workspace';
import {applySubstitution,solutionRequirements} from '../src/substitutions';
import {inspectRestoredDatabase} from '../scripts/recovery';
import {credentialMigration} from '../scripts/prepare-auth-migration';
import {toolsFor} from '../src/equipment';

test('guest merge preserves conflicting plan snapshots and rejects exceeding capacity without mutating originals',()=>{
 const account=freshData(),guest=freshData();const d=recipeDraft(recipes[0]);account.plan=[d];guest.plan=[{...structuredClone(d),note:'guest edit'}];
 const merged=mergeGuestRecords(account,guest);assert.equal(merged.plan.length,2);assert.notEqual(merged.plan[0].id,merged.plan[1].id);assert.equal(merged.plan[1].note,'guest edit');assert.equal(account.plan.length,1);
 assert.equal(mergeGuestRecords(merged,guest).plan.length,2,'repeated explicit merge must not duplicate the copied conflict');
 account.plan=Array.from({length:30},()=>recipeDraft(recipes[0]));assert.throws(()=>mergeGuestRecords(account,guest));assert.equal(account.plan.length,30);
});
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
async function fixture(){const db=new DatabaseSync(':memory:');db.exec(await readFile('cloudflare/migrations/0001_schema.sql','utf8'));db.exec(await readFile('cloudflare/migrations/0002_plaintext_test_credentials.sql','utf8'));return db;}
test('offline credential migration removes plaintext, preserves owned data, revokes sessions and guards concurrent changes',async()=>{
 const db=await fixture();try{
  const password='temporary-test-password';db.prepare("INSERT INTO users(id,email,name,password_hash,salt,password_scheme,password_plaintext,created_at) VALUES ('a','a@example.test','a','','','plaintext-functional-test-v1',?,0)").run(password);
  db.prepare("INSERT INTO user_data VALUES ('a',?,3,0)").run(JSON.stringify({...freshData(),favorites:['matcha']}));db.exec("INSERT INTO sessions VALUES ('token','a',0,1000,0)");
  const migration=credentialMigration(db);assert.equal(migration.count,1);assert(!migration.sql.includes(password));
  db.exec(migration.sql);const row=db.prepare("SELECT * FROM users WHERE id='a'").get()!;
  assert.equal(row.password_plaintext,null);assert.equal(row.auth_version,1);assert.equal(row.password_hash,scryptSync(password,String(row.salt),32,{N:16384,r:8,p:5,maxmem:32*1024*1024}).toString('hex'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get()!.n,0);assert.equal(db.prepare('SELECT revision FROM user_data').get()!.revision,3);assert.equal(inspectRestoredDatabase(db).counts.user_data,1);
  const hash=row.password_hash;db.exec(migration.sql);assert.equal(db.prepare('SELECT password_hash FROM users').get()!.password_hash,hash);
  db.exec("UPDATE users SET password_scheme='plaintext-functional-test-v1',password_plaintext='new-test-password',credential_nonce='changed'");db.exec(migration.sql);assert.equal(db.prepare('SELECT password_plaintext FROM users').get()!.password_plaintext,'new-test-password');
 }finally{db.close();}
});
