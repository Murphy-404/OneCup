import test from 'node:test';
import assert from 'node:assert/strict';
import {brewTarget,validCoffeeRecord} from '../src/coffee';
import {freshData,validateBackup} from '../src/logic';
test('coffee ratios calculate mass, and records survive backup with strict numeric validation',()=>{
  assert.equal(brewTarget(18,2),36);assert.equal(brewTarget(15,16.7),250.5);
  const record={id:'coffee-test',method:'espresso' as const,bean:'test',equipment:'machine',grind:'4',roast:'中焙',dose:18,ratio:2,temperature:93,seconds:30,actualYield:36,note:'sweet',updatedAt:new Date().toISOString()};
  assert(validCoffeeRecord(record));const data={...freshData(),coffeeRecords:[record]};assert.deepEqual(validateBackup(data),data);
  assert.throws(()=>validateBackup({...data,coffeeRecords:[{...record,dose:-1}]}));
  assert.throws(()=>validateBackup({...data,coffeeRecords:[{...record,method:'unknown'}]}));
  const {coffeeRecords:_,...old}=freshData();assert.deepEqual(validateBackup(old).coffeeRecords,[]);
});
