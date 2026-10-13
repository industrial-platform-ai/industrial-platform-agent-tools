import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFactoryProducts,KNOWN_FACTORY_PRODUCTS} from '../factory-products.mjs';
const receipt='0x'+'a'.repeat(64),hash='a'.repeat(64);
const calls=[];
const commerceTools=[
  {route:'/commerce/payment-diagnostic',run:async v=>({eligible:true,max:v.max_atomic_usdc})},
  {route:'/commerce/endpoint-health',run:async v=>{calls.push(v);return {status:200};}},
  {route:'/commerce/usdc-receipt',run:async()=>({total_received_atomic_usdc:'1000'})},
  {route:'/commerce/tx-outcome',run:async()=>({terminal:true})}
];
const create=(ids=KNOWN_FACTORY_PRODUCTS)=>buildFactoryProducts({commerceTools,activeIds:ids,runChange:async v=>({url:v.url,changed:true,current_hash:hash,http_status:200,checked_at:'now'})});
test('default factory is fully disabled',()=>assert.equal(create([]).length,0));
test('unapproved products and duplicates fail closed',()=>{
  assert.throws(()=>create(['unknown']),/Unapproved/);
  assert.throws(()=>create(['verification-preflight','verification-preflight']),/Unapproved/);
});
test('every template has a distinct paid execution route and schema',()=>{
  const tools=create();
  assert.equal(tools.length,3);
  assert.equal(new Set(tools.map(x=>x.route)).size,3);
  for(const t of tools){assert.ok(t.priceUsd>0);assert.ok(t.inputSchema.required.length);assert.equal(typeof t.run,'function');}
});
test('verification bundle requires explicit authorization and does no payment signing',async()=>{
  const tool=create().find(t=>t.route==='/factory/verification-preflight');
  await assert.rejects(()=>tool.run({operator_authorized:false}),/authorization/);
  const outcome=await tool.run({operator_authorized:true,url:'https://example.com',max_atomic_usdc:'1000'});
  assert.equal(outcome.transactions_submitted,0);assert.equal(calls.length,1);
});
test('receipt-finality distinguishes onchain receipt from job execution',async()=>{
  const tool=create().find(t=>t.route==='/factory/receipt-finality');
  const result=await tool.run({tx_hash:receipt});
  assert.equal(result.x402_execution_verified,false);
  assert.equal(result.production_intent_verified,false);
});
test('multi-site requires bounded checks and reports two independent results',async()=>{
  const tool=create().find(t=>t.route==='/factory/multi-site-change');
  await assert.rejects(()=>tool.run({checks:[{url:'https://example.com',previous_hash:hash}]}),/Two or three/);
  const checks=['https://example.com','https://example.org'].map(url=>({url,previous_hash:hash}));
  const result=await tool.run({checks});assert.equal(result.succeeded,2);assert.equal(result.results.length,2);
});
