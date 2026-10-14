import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPaymentIntent,assuranceTools} from '../payment-assurance.mjs';
const now=1800000000;
const addr='0xf7eb4b12d673df433d76b2dbd9ca41db3fe1836e';
const payer='0x1111111111111111111111111111111111111111';
const asset='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const url='https://example.com/api';
function input(){
 const terms={scheme:'exact',network:'eip155:8453',asset,payTo:addr,amount:'1000'};
 return {
  intent:{resource_url:url,allowed_payees:[addr],max_atomic_usdc:'1000'},
  challenge:{resource:{url},accepts:[terms]},
  payment:{x402Version:2,resource:{url},accepted:{...terms},payload:{authorization:{
    from:payer,to:addr,value:'1000',nonce:'0x'+'a'.repeat(64),
    validAfter:String(now-60),validBefore:String(now+60)
  }}}
 };
}
const get=(i)=>assessPaymentIntent(i,{now});
test('matching payment envelope is still never approved as a cryptographic signature',()=>{
 const r=get(input());
 assert.equal(r.status,'static_checks_passed');
 assert.equal(r.eligible_for_payment_execution,false);
 assert.equal(r.cryptographic_signature_verified,false);
 assert.equal(r.resource_cryptographically_bound,false);
 assert.equal(r.onchain_settlement_verified,false);
 assert.equal(r.transactions_submitted,0);
 assert.equal(r.issues.length,0);
});
test('recipient swap, payment over ceiling and tampered accepted price all fail',()=>{
 const i=input();i.payment.accepted.payTo='0x2222222222222222222222222222222222222222';
 i.payment.accepted.amount='2000';
 const issues=get(i).issues;
 assert.ok(issues.includes('recipient_not_in_operator_allowlist'));
 assert.ok(issues.includes('authorization_recipient_mismatch'));
 assert.ok(issues.includes('accepted_terms_not_offered_by_challenge'));
 assert.ok(issues.includes('exceeds_operator_spending_cap'));
});
test('resource substitution fails even if token transfer parameters remain unchanged',()=>{
 const i=input();i.payment.resource.url='https://example.com/other';
 assert.ok(get(i).issues.includes('payment_resource_missing_or_wrong'));
});
test('absent resource binding in payment envelope is treated as a problem',()=>{
 const i=input();delete i.payment.resource;
 assert.ok(get(i).issues.includes('payment_resource_missing_or_wrong'));
});
test('malformed nonce and expired timestamps fail',()=>{
 const i=input();i.payment.payload.authorization.nonce='broken';
 i.payment.payload.authorization.validBefore=String(now-1);
 const issues=get(i).issues;
 assert.ok(issues.includes('nonce_missing_or_malformed'));
 assert.ok(issues.includes('authorization_not_currently_valid'));
});
test('excessive time windows and unsupported schemes fail',()=>{
 const i=input();i.payment.payload.authorization.validBefore=String(now+4000);
 i.payment.accepted.scheme='batch-settlement';
 const issues=get(i).issues;
 assert.ok(issues.includes('authorization_window_exceeds_one_hour'));
 assert.ok(issues.includes('payment_scheme_not_exact'));
});
test('invalid buyer constraints fail closed',()=>{
 const i=input();i.intent.allowed_payees=[];
 assert.throws(()=>get(i),/required/);
});
test('tool is separately priced with bounded JSON schema',()=>{
 assert.equal(assuranceTools.length,1);
 assert.equal(assuranceTools[0].route,'/commerce/payment-intent-assurance');
 assert.equal(assuranceTools[0].priceUsd,0.003);
 assert.equal(assuranceTools[0].inputSchema.additionalProperties,false);
});
