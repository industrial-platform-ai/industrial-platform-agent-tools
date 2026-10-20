import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryFetch} from './adapter.mjs';
const challenge={accepts:[{network:'eip155:8453',amount:'1000',asset:'0x123',payTo:'0x456'}]};
const header=Buffer.from(JSON.stringify(challenge)).toString('base64');
test('opt-in adapter observes 402 without retrying or consuming response',async()=>{
 let calls=0, seen=[];
 const fetchImpl=async()=>{calls++;return new Response('payment required',{status:402,headers:{'payment-required':header}})};
 const fetch=createRecoveryFetch({fetchImpl,onDiagnosis:x=>seen.push(x),policy:{settlementStatus:'not_submitted',allowedNetworks:['eip155:8453'],maxAtomicAmount:1000}});
 const res=await fetch('https://example.org');
 assert.equal(calls,1);assert.equal(await res.text(),'payment required');assert.equal(seen[0].code,'challenge_compatible');assert.equal(seen[0].paymentAuthorized,false);
});
test('unknown settlement defaults to fail closed',async()=>{
 let code;const fetch=createRecoveryFetch({fetchImpl:async()=>new Response('',{status:402,headers:{'payment-required':header}}),onDiagnosis:x=>code=x.code});await fetch('https://example.org');assert.equal(code,'settlement_uncertain');
});
test('malformed challenge is nonfatal',async()=>{
 let code;const fetch=createRecoveryFetch({fetchImpl:async()=>new Response('',{status:402,headers:{'payment-required':'!!!'}}),onDiagnosis:x=>code=x.code,policy:{settlementStatus:'not_submitted'}});await fetch('https://example.org');assert.equal(code,'missing_challenge');
});
test('non-402 response is unchanged',async()=>{
 let called=false;const fetch=createRecoveryFetch({fetchImpl:async()=>new Response('ok',{status:200}),onDiagnosis:()=>called=true});const r=await fetch('https://example.org');assert.equal(await r.text(),'ok');assert.equal(called,false);
});
