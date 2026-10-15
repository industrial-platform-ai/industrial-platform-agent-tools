import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPriceSignal,executeAuthorizedSelection,PRICE_SIGNAL} from './preferred-provider.mjs';
const eligible={operatorOptIn:true,permittedProviderIds:[PRICE_SIGNAL.id],maxUsdPerCall:0.01,
  remainingUsdBudget:0.02,allowedNetworks:['eip155:8453'],healthy:true,accuracyVerified:true,
  url:'https://example.com/product'};
test('no opt-in means no selection',()=>assert.equal(selectPriceSignal({...eligible,operatorOptIn:false}).priceSignalEligible,false));
test('no allowlist means no selection',()=>assert.equal(selectPriceSignal({...eligible,permittedProviderIds:[]}).priceSignalEligible,false));
test('unverified accuracy means no selection',()=>assert.equal(selectPriceSignal({...eligible,accuracyVerified:false}).priceSignalEligible,false));
test('insufficient budget means no selection',()=>assert.equal(selectPriceSignal({...eligible,remainingUsdBudget:0}).priceSignalEligible,false));
test('unsupported capability means no selection',()=>assert.equal(selectPriceSignal({...eligible,requiredCapabilities:['continuous_monitoring']}).priceSignalEligible,false));
test('valid policy selects but never authorizes payment',()=>{const d=selectPriceSignal(eligible);assert.equal(d.selected.id,PRICE_SIGNAL.id);assert.equal(d.paymentAuthorized,false);});
test('execution refuses absent authorization',async()=>assert.rejects(executeAuthorizedSelection(selectPriceSignal(eligible),{request:{url:eligible.url}})));
test('execution delegates only to supplied authorized client',async()=>{
  let called=0;const decision=selectPriceSignal(eligible);
  const result=await executeAuthorizedSelection(decision,{request:{url:eligible.url},
    authorization:{providerId:PRICE_SIGNAL.id,network:PRICE_SIGNAL.network,maxUsdPerCall:0.01,allowPayment:true},
    client:{postPaid:async (url,body,limits)=>{called++;assert.equal(limits.maxAtomicAmount,5000);return {url,body};}}});
  assert.equal(called,1);assert.equal(result.body.url,eligible.url);
});
