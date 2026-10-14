import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeSettlementHeader,correlationRecord} from '../delivery-ledger.mjs';
const receipt={success:true,transaction:'0x'+'A'.repeat(64),network:'eip155:8453',payer:'0x'+'B'.repeat(40),amount:'5000'};
const header=Object=>Buffer.from(JSON.stringify(Object)).toString('base64');
const eligible=()=>({method:'POST',path:'/agent/wallet-monitor',httpStatus:200,hasPayment:true,settlementHeader:header(receipt),observedAt:'2026-10-14T00:01:00Z'});
test('correlates public transaction hash, delivery route and payer WITHOUT revenue assertion',()=>{
 const r=correlationRecord(eligible());
 assert.equal(r.transaction,'0x'+'a'.repeat(64));
 assert.equal(r.payer,'0x'+'b'.repeat(40));
 assert.equal(r.claimed_amount_atomic_usdc,'5000');
 assert.equal(r.http_status,200);
 assert.equal(r.chain_receipt_verified,false);
 assert.equal(r.externally_earned_revenue_verified,false);
 assert.equal(r.production_purpose_verified,false);
 assert.equal(r.observed_at,'2026-10-14T00:01:00Z');
 assert.ok(!('signature' in r));
});
test('no paid/successful HTTP delivery and no valid response => no event',()=>{
 assert.equal(correlationRecord({...eligible(),hasPayment:false}),null);
 assert.equal(correlationRecord({...eligible(),httpStatus:402}),null);
 assert.equal(correlationRecord({...eligible(),httpStatus:500}),null);
 assert.equal(correlationRecord({...eligible(),settlementHeader:null}),null);
 assert.equal(correlationRecord({...eligible(),settlementHeader:'garbage'}),null);
});
test('unsuccessful/fake chain transaction headers cannot create false paid delivery claims',()=>{
 assert.equal(decodeSettlementHeader(header({...receipt,success:false})),null);
 assert.equal(decodeSettlementHeader(header({...receipt,transaction:'not-a-tx'})),null);
 assert.equal(decodeSettlementHeader(header({...receipt,network:'eip155:1'})),null);
 assert.equal(decodeSettlementHeader(header({...receipt,payer:'wrong'})),null);
 assert.equal(decodeSettlementHeader(header({...receipt,amount:'-1'})),null);
 assert.equal(decodeSettlementHeader(header({...receipt,amount:'0'})),null);
 assert.equal(decodeSettlementHeader(header([receipt])),null);
 assert.equal(decodeSettlementHeader('x'.repeat(8193)),null);
});
test('only bounded public paths, not query strings, are logged',()=>{
 assert.equal(correlationRecord({...eligible(),path:'/agent/wallet-monitor?token=secret'}),null);
 assert.equal(correlationRecord({...eligible(),path:'/'+'a'.repeat(300)}),null);
});
