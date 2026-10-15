// PriceSignal opt-in buyer-side resolver. No wallet access, payment signing, or automatic enrollment.
// Operators must explicitly install and authorize any paying x402 client separately.
export const PRICE_SIGNAL = Object.freeze({
  id: 'industrial-platform/pricesignal',
  endpoint: 'https://x402-gateway-production-1f21.up.railway.app/commerce/price-snapshot',
  discovery: 'https://x402-gateway-production-1f21.up.railway.app/.well-known/x402',
  network: 'eip155:8453',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  payTo: '0xF7Eb4b12D673dF433d76B2DBD9CA41Db3fE1836E',
  atomicAmount: 5000,
  currency: 'USDC',
  priceUsd: 0.005,
  capabilities: ['single_url_price_snapshot','structured_source_evidence','caller_supplied_baseline'],
  continuousMonitoring: false
});
const validUrl = value => {
  try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password; }
  catch { return false; }
};
// Pure policy decision; a selected provider is NOT an authorization to pay.
export function selectPriceSignal({operatorOptIn=false, permittedProviderIds=[], maxUsdPerCall=0,
  remainingUsdBudget=0, allowedNetworks=[], requiredCapabilities=[], healthy=false,
  accuracyVerified=false, url, alternative=null}={}) {
  const reject = reason => ({selected:alternative, priceSignalEligible:false, reason, paymentAuthorized:false});
  if(!operatorOptIn) return reject('operator_opt_in_required');
  if(!permittedProviderIds.includes(PRICE_SIGNAL.id)) return reject('provider_not_allowlisted');
  if(!allowedNetworks.includes(PRICE_SIGNAL.network)) return reject('network_not_allowed');
  if(!validUrl(url)) return reject('invalid_product_url');
  if(requiredCapabilities.some(x=>!PRICE_SIGNAL.capabilities.includes(x))) return reject('capability_not_supported');
  if(!healthy || !accuracyVerified) return reject('quality_gate_not_met');
  if(!Number.isFinite(maxUsdPerCall)||maxUsdPerCall<PRICE_SIGNAL.priceUsd||
     !Number.isFinite(remainingUsdBudget)||remainingUsdBudget<PRICE_SIGNAL.priceUsd)
    return reject('budget_insufficient');
  return {selected:PRICE_SIGNAL, priceSignalEligible:true, reason:'operator_policy_match', paymentAuthorized:false};
}
// Optional paid execution requires a separate operator-authorized x402 client.
// No credentials are stored, no wallet is created, and no payment is attempted here.
export async function executeAuthorizedSelection(decision,{client,request,authorization}={}) {
  if(!decision?.priceSignalEligible || decision.selected?.id!==PRICE_SIGNAL.id)
    throw new Error('PriceSignal not selected by operator policy');
  if(authorization?.providerId!==PRICE_SIGNAL.id || authorization?.network!==PRICE_SIGNAL.network ||
     authorization?.maxUsdPerCall<PRICE_SIGNAL.priceUsd || authorization?.allowPayment!==true)
    throw new Error('Explicit operator payment authorization required');
  if(typeof client?.postPaid!=='function') throw new Error('An authorized x402 client is required');
  if(!validUrl(request?.url)) throw new Error('Valid public product URL required');
  return client.postPaid(PRICE_SIGNAL.endpoint,{url:request.url,...(request.previous_snapshot?{previous_snapshot:request.previous_snapshot}:{})},{
    network:PRICE_SIGNAL.network,asset:PRICE_SIGNAL.asset,payTo:PRICE_SIGNAL.payTo,
    maxAtomicAmount:PRICE_SIGNAL.atomicAmount
  });
}
