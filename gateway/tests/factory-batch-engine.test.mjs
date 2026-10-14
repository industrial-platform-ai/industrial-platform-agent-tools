import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {
 BASE_PAYEE,BASE_NETWORK,MAX_VIRTUAL_SLOTS,VETTED_RECIPES,
 canonical,digest,recipeFingerprint,generateInventory,verifyAttestation,
 inspectCandidate,planBatch,validateActiveManifest
} from '../factory-batch-engine.mjs';
const now=Date.parse('2026-10-14T10:00:00Z');
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const key=Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64');
const seal=payload=>({payload,signature:sign(null,Buffer.from(canonical(payload)),privateKey).toString('base64')});
function eligible(recipe=VETTED_RECIPES[0]){
 return seal({
  kind:'candidate',version:1,observed_at:new Date(now-1000).toISOString(),
  candidate_id:recipe.id,recipe_fingerprint:recipeFingerprint(recipe),
  source_routes_digest:digest([...recipe.source_routes].sort()),
  network:BASE_NETWORK,pay_to:BASE_PAYEE,
  evidence_pipeline:'independent_gateway_chain_delivery_reconciliation',
  verified_operator_permission:true,provider_rights_confirmed:true,product_quality_checked:true,
  real_production_purpose_verified:true,non_circular_payment_verified:true,
  settled_successful_calls:3,transaction_receipts_reconciled:3,independent_payers:2,
  repeat_utc_days:2,success_ppm:995000,delivery_errors:0,
  price_atomic:recipe.price_atomic,measured_variable_cost_atomic:'700'
 });
}
const empty={version:1,items:[]};
test('represents one million slots but does NOT fake one million distinct services',()=>{
 const a=generateInventory({virtualSlots:1000000,sampleLimit:4096});
 assert.equal(a.virtual_slots_requested,1000000);
 assert.equal(a.samples_materialized,4096);
 assert.equal(a.distinct_vetted_service_contracts,3);
 assert.equal(a.live_services_created,0);
 assert.equal(a.payment_transactions,0);
 assert.equal(a.samples_deduplicated,4093);
});
test('supports up to billion virtual IDs with bounded materialization and deterministic scanning',()=>{
 const a=generateInventory({virtualSlots:MAX_VIRTUAL_SLOTS,start:0,sampleLimit:30});
 const b=generateInventory({virtualSlots:30,start:0,sampleLimit:30});
 assert.deepEqual(a.candidates,b.candidates);
 assert.equal(a.unsampled_virtual_slots,MAX_VIRTUAL_SLOTS-30);
 assert.throws(()=>generateInventory({virtualSlots:MAX_VIRTUAL_SLOTS+1}),/out of bounds/);
 assert.throws(()=>generateInventory({virtualSlots:10,sampleLimit:10001}),/out of bounds/);
});
test('unsigned or forged demand NEVER promotes service',()=>{
 const inv=generateInventory({virtualSlots:3});
 const p=planBatch({inventory:inv,evidence:{},active:empty,now});
 assert.equal(p.proposed.length,0);
 assert.ok(p.rejected.every(r=>!r.eligible));
 const signed=eligible();
 const bad={...signed,payload:{...signed.payload,independent_payers:3000}};
 assert.equal(inspectCandidate(VETTED_RECIPES[0],bad,key,{now}).eligible,false);
 assert.equal(inspectCandidate(VETTED_RECIPES[0],signed,'',{now}).eligible,false);
});
test('reliability, cost, permission, and production repeats must pass signed checks',()=>{
 const recipe=VETTED_RECIPES[0];
 const failOn=(field,value)=>{
  const proof=seal({...eligible(recipe).payload,[field]:value});
  assert.equal(inspectCandidate(recipe,proof,key,{now}).eligible,false,field);
 };
 failOn('measured_variable_cost_atomic','4000');
 failOn('measured_variable_cost_atomic','3200');
 failOn('repeat_utc_days',1);
 failOn('success_ppm',980000);
 failOn('provider_rights_confirmed',false);
 failOn('real_production_purpose_verified',false);
 failOn('transaction_receipts_reconciled',1);
 failOn('pay_to','0x0000000000000000000000000000000000000000');
 failOn('evidence_pipeline','unverified_metrics_dashboard');
});
test('stale signed evidence is rejected and quality attestations are scope-bound',()=>{
 const recipe=VETTED_RECIPES[0],proof=eligible();
 assert.equal(verifyAttestation(proof,key,{now:now+25*3600000}).ok,false);
 assert.equal(inspectCandidate(VETTED_RECIPES[1],proof,key,{now}).eligible,false);
});
test('bootstrap plan allows only 1 signed vetted product per hour',()=>{
 const inventory=generateInventory({virtualSlots:1000000});
 const evidence=Object.fromEntries(VETTED_RECIPES.map(r=>[r.id,eligible(r)]));
 const p=planBatch({inventory,evidence,active:empty,publicKey:key,now});
 assert.equal(p.quota,1);
 assert.equal(p.proposed.length,1);
 assert.equal(p.tier.level,'bootstrap');
 assert.equal(p.deployment_performed,false);
 assert.equal(p.wallet_spending_performed,false);
 const selected=p.proposed[0];
 const act=validateActiveManifest(p.proposed_manifest,key,{now:now+3600000});
 assert.deepEqual(act,[selected.id]);
 const again=planBatch({inventory,evidence,active:p.proposed_manifest,publicKey:key,now:now+5000});
 assert.equal(again.proposed.length,0);
 assert.equal(again.quota,0);
});
test('tampered on-disk manifest or missing configured verifier fails CLOSED',()=>{
 const inventory=generateInventory({virtualSlots:1});
 const p=planBatch({inventory,evidence:{[VETTED_RECIPES[0].id]:eligible()},publicKey:key,now});
 const altered=structuredClone(p.proposed_manifest);
 altered.items[0].attestation.payload.price_atomic='9000';
 assert.throws(()=>validateActiveManifest(altered,key,{now}),/missing verified signature/);
 assert.throws(()=>validateActiveManifest(p.proposed_manifest,'',{now}),/missing verified signature/);
 assert.throws(()=>validateActiveManifest({version:1,items:[...p.proposed,...p.proposed]},key,{now}),/Duplicate/);
});
test('higher batch limits require separately SIGNED portfolio economics',()=>{
 const inventory=generateInventory({virtualSlots:3});
 const evidence=Object.fromEntries(VETTED_RECIPES.map(r=>[r.id,eligible(r)]));
 const forged={payload:{kind:'portfolio',version:1,observed_at:new Date(now).toISOString(),evidence_pipeline:'independent_gateway_chain_delivery_reconciliation',
  network:BASE_NETWORK,pay_to:BASE_PAYEE,non_circular_payment_verified:true,repeat_buyers:1000,
  qualified_calls_7d:1000000,success_ppm:1000000,margin_ppm:500000},signature:'YmFk'};
 const p1=planBatch({inventory,evidence,portfolio:forged,publicKey:key,now});
 assert.equal(p1.tier.level,'bootstrap');
 const valid=seal(forged.payload);
 const p2=planBatch({inventory,evidence,portfolio:valid,publicKey:key,now});
 assert.equal(p2.tier.level,'network');
 assert.equal(p2.quota,1024);
 assert.equal(p2.proposed.length,3);
 assert.equal(validateActiveManifest(p2.proposed_manifest,key,{now}).length,3);
});
test('duplicate routes, unknown recipes and aliased functional contracts rejected',()=>{
 const wrong={...VETTED_RECIPES[0],id:'unknown-service'};
 assert.throws(()=>generateInventory({recipes:[wrong],virtualSlots:1}),/non-allowlisted/);
 const duplicated=[VETTED_RECIPES[0],{...VETTED_RECIPES[0],id:'receipt-finality-report',route:'/factory/other'}];
 assert.throws(()=>generateInventory({recipes:duplicated,virtualSlots:2}),/Duplicate service/);
});
