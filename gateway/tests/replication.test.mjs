import test from 'node:test';
import assert from 'node:assert/strict';
import {REPLICATION_GENESIS_UTC,MAX_EPOCH,epochAt,generation,childFromParent,shardPlan,safeExpansionReport} from '../replication.mjs';
const start=Date.parse(REPLICATION_GENESIS_UTC);
test('genesis starts from a single virtual identity',()=>{
  assert.equal(epochAt(new Date(start)),0);
  assert.equal(generation(0).virtual_total,'1');
  assert.equal(generation(0).active_services_verified_by_generator,0);
});
test('one parent produces exactly one deterministic child in each epoch',()=>{
  assert.equal(childFromParent(0n,0).child_id,'1');
  assert.equal(childFromParent(1n,1).child_id,'3');
  assert.equal(childFromParent(3n,2).child_id,'7');
  assert.throws(()=>childFromParent(4n,2),/not in current generation/);
  assert.throws(()=>childFromParent(0n,30),/out of bounds/);
});
test('30 epochs reach above one billion virtual IDs and automatically pause',()=>{
  assert.equal(generation(29).virtual_total,'536870912');
  assert.equal(generation(30).virtual_total,'1073741824');
  assert.equal(generation(30).crossed_one_billion,true);
  assert.equal(epochAt(new Date(start+31*3600000)),30);
  assert.equal(generation(MAX_EPOCH).paused,true);
});
test('all four shards together partition first-hour children without overlap',()=>{
  const shards=Array.from({length:4},(_,i)=>shardPlan(3,i,4,16));
  const children=shards.flatMap(s=>s.sampled_parents.map(x=>x.child_id));
  assert.deepEqual(children.sort(),['4','5','6','7']);
});
test('last epoch works in constant memory, caps samples and never deploys',()=>{
  const a=shardPlan(30,1,4,16);
  assert.equal(a.scheduled_parent_count,'134217728');
  assert.equal(a.sampled_children,16);
  assert.equal(a.actual_deployments,0);
  assert.equal(a.paused,true);
  assert.equal(a.sampled_parents[0].state,'virtual_only');
});
test('invalid shards, limits and clocks fail closed',()=>{
  assert.throws(()=>shardPlan(4,4,4),RangeError);
  assert.throws(()=>shardPlan(4,0,0),RangeError);
  assert.throws(()=>shardPlan(4,0,4,17),RangeError);
  assert.throws(()=>epochAt('not-a-date'),RangeError);
});
test('report never misrepresents virtual IDs as live services or receipts',()=>{
  const r=safeExpansionReport({when:new Date(start+5*3600000),shard:2,shards:4});
  assert.equal(r.projected.virtual_total,'32');
  assert.equal(r.live_service_spawns,0);
  assert.equal(r.wallet_operations,0);
  assert.equal(r.third_party_probes,0);
});
