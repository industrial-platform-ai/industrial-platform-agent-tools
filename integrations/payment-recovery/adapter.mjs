import {diagnoseX402Failure} from './diagnose.mjs';

// Opt-in, read-only wrapper. Never consumes a response body, retries, or signs.
export function createRecoveryFetch({fetchImpl=globalThis.fetch,onDiagnosis=()=>{},policy={}}={}) {
  if(typeof fetchImpl!=='function'||typeof onDiagnosis!=='function') throw new TypeError('fetchImpl and onDiagnosis must be functions');
  return async function recoveryFetch(input,init) {
    const response=await fetchImpl(input,init);
    if(response.status!==402) return response;
    let paymentRequired;
    try {
      const encoded=response.headers?.get('payment-required');
      if(encoded && encoded.length<=16384) {
        const decoded=Buffer.from(encoded,'base64').toString('utf8');
        paymentRequired=JSON.parse(decoded);
      }
    } catch { paymentRequired=undefined; }
    const diagnosis=diagnoseX402Failure({
      httpStatus:response.status,paymentRequired,
      allowedNetworks:policy.allowedNetworks??[],maxAtomicAmount:policy.maxAtomicAmount??0,
      requestedNetwork:policy.requestedNetwork,
      // Without explicit caller proof of no submission, fail closed.
      settlementStatus:policy.settlementStatus??'unknown',
      alreadySubmitted:policy.alreadySubmitted??false
    });
    try { await onDiagnosis(diagnosis); } catch { /* Observability cannot break original request. */ }
    return response;
  };
}
