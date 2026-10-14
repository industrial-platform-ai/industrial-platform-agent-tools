// Batch factory: O(number of vetted templates) inventory, not O(virtual identity space).
// This file never makes network requests, signs payments, spends USDC or deploys.
import {createHash,createPublicKey,verify} from 'node:crypto';
import {KNOWN_FACTORY_PRODUCTS} from '../gateway/factory-products.mjs';

export const BASE_PAYEE='0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E';
export const BASE_NETWORK='eip155:8453';
export const MAX_VIRTUAL_SLOTS=1073741824;
export const MAX_SAMPLE=10000;
export const MAX_ACTIVE_BATCH=10000;
const MAX_ATTESTATION_AGE_MS=24*3600*1000;
const specs=[
 {id:'verification-preflight',route:'/factory/verification-preflight',source_routes:['/commerce/payment-diagnostic','/commerce/endpoint-health'],price_atomic:'4000',contract:'authorized-health+payment-policy'},
 {id:'receipt-finality-report',route:'/factory/receipt-finality',source_routes:['/commerce/usdc-receipt','/commerce/tx-outcome'],price_atomic:'5000',contract:'onchain-receipt+terminal-status'},
 {id:'multi-site-change-report',route:'/factory/multi-site-change',source_routes:['/change','/commerce/material-web-change'],price_atomic:'9000',contract:'multi-site-comparison+change-baselines'}
];
export const VETTED_RECIPES=Object.freeze(specs.map(x=>Object.freeze({...x,source_routes:Object.freeze(x.source_routes)})));

function fail(message){throw new Error(message);}
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const unsigned=(v)=>typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v)&&v.length<=30;
export function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object'){
  const keys=Object.keys(value).sort();
  return '{'+keys.map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 }
 if(typeof value==='string'||typeof value==='boolean'||value===null||typeof value==='number'&&Number.isFinite(value))
  return JSON.stringify(value);
 return fail('Noncanonical or undefined object value');
}
export const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
export function recipeFingerprint(recipe){
 return digest({id:recipe.id,route:recipe.route,source_routes:[...recipe.source_routes].sort(),contract:recipe.contract,price_atomic:recipe.price_atomic});
}
function validateRecipes(recipes=VETTED_RECIPES){
 if(!Array.isArray(recipes)||recipes.length<1||recipes.length>MAX_ACTIVE_BATCH)fail('Invalid recipe library size');
 const ids=new Set(),routes=new Set(),semantics=new Set();
 for(const r of recipes){
  if(!r||typeof r.id!=='string'||!KNOWN_FACTORY_PRODUCTS.includes(r.id))fail('Unknown or non-allowlisted execution recipe');
  if(!/^\/factory\/[a-z0-9-]+$/.test(r.route)||!unsigned(r.price_atomic)||BigInt(r.price_atomic)<1000n)fail('Invalid paid execution route or price');
  if(!Array.isArray(r.source_routes)||r.source_routes.length===0||r.source_routes.some(x=>typeof x!=='string'||!x.startsWith('/')))fail('Missing declared data provenance');
  if(typeof r.contract!=='string'||r.contract.length<8)fail('Missing semantic output contract');
  const semantic=digest({sources:[...new Set(r.source_routes)].sort(),contract:r.contract});
  if(ids.has(r.id)||routes.has(r.route)||semantics.has(semantic))fail('Duplicate service ID, route or functional contract');
  ids.add(r.id);routes.add(r.route);semantics.add(semantic);
 }
 return recipes;
}
validateRecipes();
export function generateInventory({virtualSlots=1000000,sampleLimit=4096,start=0,recipes=VETTED_RECIPES}={}){
 validateRecipes(recipes);
 if(!int(virtualSlots,0,MAX_VIRTUAL_SLOTS)||!int(start,0,MAX_VIRTUAL_SLOTS)||start+virtualSlots>MAX_VIRTUAL_SLOTS)
  fail('Virtual identity range out of bounds');
 if(!int(sampleLimit,0,MAX_SAMPLE))fail('Sample cap out of bounds');
 const sampled=Math.min(virtualSlots,sampleLimit);
 const byFingerprint=new Map();
 for(let n=0;n<sampled;n++){
  const candidate=recipes[(start+n)%recipes.length];
  const hash=recipeFingerprint(candidate);
  if(!byFingerprint.has(hash))byFingerprint.set(hash,{...candidate,fingerprint:hash});
 }
 return {
  virtual_slots_requested:virtualSlots,
  virtual_start:start,
  samples_materialized:sampled,
  samples_deduplicated:sampled-byFingerprint.size,
  unsampled_virtual_slots:virtualSlots-sampled,
  distinct_vetted_service_contracts:byFingerprint.size,
  candidates:[...byFingerprint.values()],
  live_services_created:0,
  payment_transactions:0,
  warning:'Unmaterialized/duplicate virtual slots are not differentiated services. No paid route is created by generation.'
 };
}
function decodePublicKey(base64){
 if(!base64||typeof base64!=='string')return null;
 try{return createPublicKey(Buffer.from(base64,'base64').toString('utf8'))}catch{return null}
}
export function verifyAttestation(envelope,pubkeyBase64,{now=Date.now(),fresh=true,kind='candidate'}={}){
 const key=decodePublicKey(pubkeyBase64);
 if(!key)return {ok:false,reason:'trusted_evidence_verifier_key_not_configured'};
 if(key.asymmetricKeyType!=='ed25519')return {ok:false,reason:'invalid_verifier_key_type'};
 if(!envelope||!envelope.payload||typeof envelope.signature!=='string'||!/^[a-zA-Z0-9+/]+={0,2}$/.test(envelope.signature))
  return {ok:false,reason:'missing_signed_evidence'};
 let valid=false;
 try{valid=verify(null,Buffer.from(canonical(envelope.payload)),key,Buffer.from(envelope.signature,'base64'))}catch{return {ok:false,reason:'invalid_evidence_encoding'}}
 if(!valid)return {ok:false,reason:'invalid_evidence_signature'};
 const p=envelope.payload;
 if(p.kind!==kind||p.version!==1)return {ok:false,reason:'wrong_evidence_kind'};
 const age=now-Date.parse(p.observed_at||'');
 if(!Number.isFinite(age)||age<0||fresh&&age>MAX_ATTESTATION_AGE_MS)return {ok:false,reason:'stale_or_future_evidence'};
 return {ok:true,payload:p,fingerprint:digest(p)};
}
function eligibleMetrics(p,recipe){
 if(p.candidate_id!==recipe.id||p.recipe_fingerprint!==recipeFingerprint(recipe))return 'attested_recipe_does_not_match';
 if(p.network!==BASE_NETWORK||String(p.pay_to).toLowerCase()!==BASE_PAYEE.toLowerCase())return 'wrong_network_or_recipient';
 if(p.source_routes_digest!==digest([...recipe.source_routes].sort()))return 'source_routes_mismatch';
 if(p.evidence_pipeline!=='independent_gateway_chain_delivery_reconciliation')return 'independent_audit_pipeline_required';
 if(p.verified_operator_permission!==true||p.provider_rights_confirmed!==true||p.product_quality_checked!==true)return 'permissions_or_quality_unverified';
 if(p.real_production_purpose_verified!==true||p.non_circular_payment_verified!==true)return 'production_purpose_or_payer_independence_unverified';
 if(!int(p.settled_successful_calls,2,1000000000)||!int(p.independent_payers,1,1000000000)||!int(p.repeat_utc_days,2,1000000000))return 'insufficient_independent_repeat_paid_usage';
 if(!int(p.success_ppm,990000,1000000))return 'reliability_below_99_percent';
 if(!unsigned(p.measured_variable_cost_atomic)||!unsigned(p.price_atomic)||p.price_atomic!==recipe.price_atomic)return 'missing_actual_cost_or_price';
 const price=BigInt(p.price_atomic),cost=BigInt(p.measured_variable_cost_atomic);
 if(cost>=price||4n*cost>3n*price)return 'contribution_margin_below_25_percent';
 if(p.delivery_errors!==0||!int(p.transaction_receipts_reconciled,p.settled_successful_calls,1000000000))
  return 'settlement_delivery_evidence_incomplete';
 return null;
}
export function inspectCandidate(recipe,attestation,pubkeyBase64,opts={}){
 const checked=verifyAttestation(attestation,pubkeyBase64,{...opts,kind:'candidate'});
 if(!checked.ok)return {id:recipe.id,eligible:false,reason:checked.reason};
 const problem=eligibleMetrics(checked.payload,recipe);
 return {id:recipe.id,eligible:!problem,reason:problem||'verified_signed_production_evidence_and_margin',attestation_digest:checked.fingerprint};
}
function adaptiveTier(portfolio,publicKey,now){
 const result=verifyAttestation(portfolio,publicKey,{now,kind:'portfolio'});
 if(!result.ok)return {hour:1,day:3,week:12,level:'bootstrap'};
 const p=result.payload;
 if(p.evidence_pipeline!=='independent_gateway_chain_delivery_reconciliation'||p.network!==BASE_NETWORK||
  String(p.pay_to).toLowerCase()!==BASE_PAYEE.toLowerCase()||p.non_circular_payment_verified!==true||
  !int(p.repeat_buyers,0,1000000000)||!int(p.qualified_calls_7d,0,1000000000)||
  !int(p.success_ppm,990000,1000000)||!int(p.margin_ppm,250000,1000000))return {hour:1,day:3,week:12,level:'bootstrap'};
 const stages=[
  {buyers:1000,calls:1000000,success:999500,hour:1024,day:2048,week:4096,level:'network'},
  {buyers:100,calls:100000,success:999000,hour:256,day:512,week:1024,level:'large'},
  {buyers:20,calls:10000,success:998000,hour:64,day:128,week:256,level:'expanding'},
  {buyers:5,calls:1000,success:995000,hour:12,day:24,week:48,level:'proven'}
 ];
 return stages.find(s=>p.repeat_buyers>=s.buyers&&p.qualified_calls_7d>=s.calls&&p.success_ppm>=s.success)||
  {hour:1,day:3,week:12,level:'bootstrap'};
}
export function validateActiveManifest(manifest,publicKey,{now=Date.now()}={}){
 if(!manifest||manifest.version!==1||!Array.isArray(manifest.items)||manifest.items.length>MAX_ACTIVE_BATCH)fail('Invalid active batch manifest');
 const ids=new Set(),routeSet=new Set();
 for(const item of manifest.items){
  const recipe=VETTED_RECIPES.find(r=>r.id===item.id);
  if(!recipe||ids.has(item.id)||routeSet.has(recipe.route)||item.recipe_fingerprint!==recipeFingerprint(recipe))fail('Duplicate, stale or unknown active recipe');
  if(!Number.isFinite(Date.parse(item.activated_at||''))||Date.parse(item.activated_at)>now)fail('Invalid activation timestamp');
  // Existing activations may persist beyond the original attestation 24h freshness window.
  const check=inspectCandidate(recipe,item.attestation,publicKey,{now,fresh:false});
  if(!check.eligible)fail('Active recipe missing verified signature and permissions: '+check.reason);
  ids.add(item.id);routeSet.add(recipe.route);
 }
 return [...ids];
}
export function planBatch({inventory,evidence={},portfolio=null,active={version:1,items:[]},publicKey='',now=Date.now(),maxPerRun=1024}={}){
 if(!inventory||!Array.isArray(inventory.candidates)||inventory.candidates.length>MAX_SAMPLE)fail('Invalid candidate sample');
 if(!int(maxPerRun,0,1024)||!Number.isFinite(now))fail('Invalid batch request or clock');
 const activeIds=validateActiveManifest(active,publicKey,{now});
 const tier=adaptiveTier(portfolio,publicKey,now);
 const recent=(delta)=>active.items.filter(x=>Date.parse(x.activated_at)>=now-delta).length;
 const quota=Math.max(0,Math.min(maxPerRun,tier.hour-recent(3600000),tier.day-recent(86400000),tier.week-recent(7*86400000),MAX_ACTIVE_BATCH-active.items.length));
 const seen=new Set(),proposed=[],rejected=[];
 for(const candidate of inventory.candidates){
  const recipe=VETTED_RECIPES.find(r=>r.id===candidate.id);
  if(!recipe||candidate.fingerprint!==recipeFingerprint(recipe)){rejected.push({id:candidate.id,reason:'unknown_or_forged_candidate'});continue}
  if(seen.has(candidate.fingerprint)||activeIds.includes(candidate.id)){rejected.push({id:candidate.id,reason:'duplicate_or_already_active'});continue}
  seen.add(candidate.fingerprint);
  const check=inspectCandidate(recipe,evidence[candidate.id],publicKey,{now});
  if(!check.eligible){rejected.push(check);continue}
  if(proposed.length>=quota){rejected.push({id:candidate.id,reason:'promotion_quota_exhausted'});continue}
  proposed.push({id:candidate.id,recipe_fingerprint:recipeFingerprint(recipe),activated_at:new Date(now).toISOString(),attestation:evidence[candidate.id]});
 }
 const next={version:1,items:[...active.items,...proposed]};
 return {generated_virtual_slots:inventory.virtual_slots_requested,sampled_definitions:inventory.samples_materialized,
  unique_vetted_candidates:inventory.candidates.length,quota,tier,proposed,rejected,active_count_before:active.items.length,
  active_count_after:next.items.length,proposed_manifest:next,
  deployment_performed:false,wallet_spending_performed:false,
  instructions:'Signed evidence is necessary, but publish only after code review, gateway tests and approved deployment of the manifest on the existing HTTP/MCP services.'};
}
