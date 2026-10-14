import {createHash} from 'node:crypto';

const BASE='eip155:8453';
const USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const HEX40=/^0x[a-f0-9]{40}$/i;
const HEX32=/^0x[a-f0-9]{64}$/i;
const DEC=/^\d{1,24}$/;
const MAX_WINDOW_SECONDS=3600;
const invalid=(message)=>Object.assign(new Error(message),{statusCode:400});
const object=(v)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const lower=(v)=>String(v||'').toLowerCase();
function validUrl(value){
  if(typeof value!=='string'||value.length>2048)return null;
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.hash)return null;
    return u.href;
  }catch{return null;}
}
function authTime(value){
  if(typeof value!=='string'||!DEC.test(value))return null;
  const n=Number(value);
  return Number.isSafeInteger(n)?n:null;
}
function assessPaymentIntent(input,{now=Math.floor(Date.now()/1000)}={}){
  if(!object(input)||!object(input.intent)||!object(input.challenge)||!object(input.payment))
    throw invalid('intent, challenge and payment objects are required');
  const intent=input.intent,challenge=input.challenge,payment=input.payment;
  if(!Number.isSafeInteger(now)||now<0)throw invalid('Invalid clock');
  const target=validUrl(intent.resource_url);
  const allowlist=intent.allowed_payees;
  const cap=String(intent.max_atomic_usdc??'');
  if(!target||!Array.isArray(allowlist)||allowlist.length===0||allowlist.length>20||
    !allowlist.every(x=>typeof x==='string'&&HEX40.test(x))||!DEC.test(cap))
    throw invalid('HTTPS resource_url, approved payees and bounded USDC spending cap are required');
  const issues=[],warnings=[];
  const accepted=payment.accepted,auth=payment.payload?.authorization;
  if(!object(accepted)||!object(auth))throw invalid('Expected EIP-3009 accepted requirements and authorization metadata');
  if(payment.x402Version!==2)issues.push('payment_version_not_v2');
  if(accepted.scheme!=='exact')issues.push('payment_scheme_not_exact');
  if(accepted.network!==BASE)issues.push('payment_network_not_base');
  if(lower(accepted.asset)!==USDC)issues.push('payment_asset_not_base_usdc');
  if(!HEX40.test(String(accepted.payTo||''))||!allowlist.some(a=>lower(a)===lower(accepted.payTo)))issues.push('recipient_not_in_operator_allowlist');
  if(accepted.extra?.assetTransferMethod && accepted.extra.assetTransferMethod!=='eip3009')issues.push('unsupported_transfer_method');
  const requestResource=validUrl(payment.resource?.url);
  const challengeResource=validUrl(challenge.resource?.url);
  if(!requestResource||requestResource!==target)issues.push('payment_resource_missing_or_wrong');
  if(!challengeResource||challengeResource!==target)issues.push('challenge_resource_missing_or_wrong');
  const accepts=Array.isArray(challenge.accepts)&&challenge.accepts.length<=30?challenge.accepts:[];
  const approved=accepts.some(a=>object(a)&&a.scheme===accepted.scheme&&a.network===accepted.network&&
    lower(a.asset)===lower(accepted.asset)&&lower(a.payTo)===lower(accepted.payTo)&&String(a.amount)===String(accepted.amount));
  if(!approved)issues.push('accepted_terms_not_offered_by_challenge');
  const amount=String(accepted.amount??''),authorized=String(auth.value??'');
  if(!DEC.test(amount)||!DEC.test(authorized))issues.push('invalid_payment_amount');
  else {
    if(BigInt(amount)>BigInt(cap))issues.push('exceeds_operator_spending_cap');
    if(amount!==authorized)issues.push('authorization_amount_mismatch');
    if(BigInt(amount)===0n)issues.push('payment_amount_zero');
  }
  if(!HEX40.test(String(auth.to||''))||lower(auth.to)!==lower(accepted.payTo))issues.push('authorization_recipient_mismatch');
  if(!HEX40.test(String(auth.from||'')))issues.push('authorization_payer_invalid');
  if(typeof auth.nonce!=='string'||!HEX32.test(auth.nonce))issues.push('nonce_missing_or_malformed');
  const after=authTime(auth.validAfter),before=authTime(auth.validBefore);
  if(after===null||before===null||before<=after)issues.push('invalid_authorization_time_window');
  else {
    if(!(now>after&&now<before))issues.push('authorization_not_currently_valid');
    if(before-after>MAX_WINDOW_SECONDS)issues.push('authorization_window_exceeds_one_hour');
  }
  // In the exact-EVM scheme, EIP-3009 binds recipient, value, nonce and
  // validity, but does not cryptographically sign the HTTP resource URI.
  warnings.push('Resource URL is compared in supplied envelope metadata only; it is NOT bound by the EIP-3009 transfer signature.');
  warnings.push('Signature, nonce usage state, balance, facilitator, settlement and delivered output were NOT verified.');
  const stable={
    resource_url:target,scheme:accepted.scheme,network:accepted.network,
    asset:lower(accepted.asset),pay_to:lower(accepted.payTo),amount_atomic_usdc:amount,
    payer:lower(auth.from),nonce:typeof auth.nonce==='string'?lower(auth.nonce):null,
    valid_after:after,valid_before:before
  };
  const fingerprint=createHash('sha256').update(JSON.stringify(stable)).digest('hex');
  return {
    status:issues.length===0?'static_checks_passed':'static_checks_failed',
    eligible_for_payment_execution:false,
    issues,warnings,checks_executed:'read_only_untrusted_envelope_consistency',
    intent_fingerprint_sha256:fingerprint,
    cryptographic_signature_verified:false,resource_cryptographically_bound:false,
    nonce_unspent_verified:false,onchain_settlement_verified:false,
    service_delivery_verified:false,transactions_submitted:0,fees_collected_by_analysis:0,
    scope:'Static preflight only. Use independently trusted x402 SDK/facilitator verification and onchain reconciliation before delivery.',
    checked_at:new Date(now*1000).toISOString()
  };
}
const addrSchema={type:'string',pattern:'^0x[a-fA-F0-9]{40}$'};
const assuranceTools=[{
  name:'x402-payment-intent-assurance',
  route:'/commerce/payment-intent-assurance',
  price:'$0.003',priceUsd:0.003,
  description:'Read-only x402 v2 Base USDC EIP-3009 payment-intent safety preflight. Compare offered requirements and payment envelope against buyer-approved payees, request resource and max amount, plus nonce format and time window. Not signature verification, signed URL binding, or settlement proof.',
  tags:['x402','payment-intent','preflight','resource-binding','payee-allowlist','security'],
  inputSchema:{type:'object',properties:{
    intent:{type:'object',properties:{
      resource_url:{type:'string',format:'uri'},
      allowed_payees:{type:'array',items:addrSchema,minItems:1,maxItems:20},
      max_atomic_usdc:{type:'string',pattern:'^\\d{1,24}$'}
    },required:['resource_url','allowed_payees','max_atomic_usdc'],additionalProperties:false},
    challenge:{type:'object'},
    payment:{type:'object'}
  },required:['intent','challenge','payment'],additionalProperties:false},
  example:{
    intent:{resource_url:'https://example.com/api',allowed_payees:['0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E'],max_atomic_usdc:'1000'},
    challenge:{resource:{url:'https://example.com/api'},accepts:[{scheme:'exact',network:BASE,asset:USDC,payTo:'0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E',amount:'1000'}]},
    payment:{x402Version:2,resource:{url:'https://example.com/api'},accepted:{scheme:'exact',network:BASE,asset:USDC,payTo:'0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E',amount:'1000'},payload:{authorization:{from:'0x1111111111111111111111111111111111111111',to:'0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E',value:'1000',nonce:'0x'+'a'.repeat(64),validAfter:'1',validBefore:'1000'}}}
  },
  run:(input)=>assessPaymentIntent(input)
}];
export {assessPaymentIntent,assuranceTools};
