// Industrial Payment Recovery v0.1 — read-only, buyer-side payment failure classifier.
// No wallet access, signing, settlement submission, automatic retry or fees.
const knownNetworks = new Set(['eip155:8453','eip155:1','eip155:84532']);
const safeString = x => typeof x === 'string' ? x.slice(0,256) : '';
const positiveInteger = x => Number.isSafeInteger(x) && x >= 0;
export function diagnoseX402Failure({httpStatus, paymentRequired, paymentResponse, requestedNetwork, allowedNetworks=[], maxAtomicAmount=0, alreadySubmitted=false, settlementStatus='unknown'}={}) {
  const result=(code,action,canRetry=false)=>({code,action,canRetry,paymentAuthorized:false,feeAuthorized:false});
  if(alreadySubmitted || paymentResponse || settlementStatus !== 'not_submitted')
    return result('settlement_uncertain','Reconcile facilitator response and on-chain receipt before any retry.');
  if(httpStatus !== 402) return result('not_payment_challenge','Investigate the upstream HTTP error without initiating a payment.');
  if(!paymentRequired || typeof paymentRequired !== 'object')
    return result('missing_challenge','Inspect the server payment challenge; do not send funds.');
  const accepts=Array.isArray(paymentRequired.accepts)?paymentRequired.accepts:[];
  if(!accepts.length) return result('invalid_challenge','No valid payment options advertised.');
  const options=accepts.filter(a=>a&&typeof a==='object'&&knownNetworks.has(safeString(a.network))&&
    allowedNetworks.includes(a.network)&&positiveInteger(Number(a.amount))&&
    Number(a.amount)<=maxAtomicAmount&&safeString(a.payTo)&&safeString(a.asset));
  if(!options.length) return result('no_authorized_payment_option','Check allowed networks, amount cap, asset and payee against operator policy.');
  if(requestedNetwork && !options.some(x=>x.network===requestedNetwork))
    return result('network_mismatch','Requested network is not among allowed challenge options.');
  return result('challenge_compatible','Pass the selected challenge to a separately authorized x402 client. This tool never signs or pays.');
}
export function recoveryOutcome({diagnosis, independentlyVerifiedPaidDelivery=false, authorizedRecoveryFee=false}={}) {
  return {recoveryEligible:diagnosis?.code==='challenge_compatible',
    billable:independentlyVerifiedPaidDelivery===true&&authorizedRecoveryFee===true,
    note:'No recovery fee without explicit buyer authorization and independently verified delivery.'};
}
