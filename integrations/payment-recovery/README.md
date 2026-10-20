# Industrial Payment Recovery — opt-in x402 observer

This is a read-only proof of concept, not a payment recovery engine or a published package. It supports x402 v2 `PAYMENT-REQUIRED` headers; it does not handle every protocol version or client. No wallet access, signing, fee collection, retry, or settlement submission.

## Integration

```js
import {createRecoveryFetch} from './integrations/payment-recovery/adapter.mjs';
const observedFetch = createRecoveryFetch({
  fetchImpl: fetch,
  policy: {allowedNetworks:['eip155:8453'],maxAtomicAmount:5000},
  onDiagnosis: diagnosis => console.log(diagnosis.code)
});
const response = await observedFetch('https://your-authorized-x402-endpoint.example');
```

Default settlement status is unknown, so diagnosis fails closed. `settlementStatus: 'not_submitted'` may only be supplied by a buyer-controlled integration that can actually prove no payment was submitted. Do not send wallet keys, signed payment payloads, or sensitive response bodies to this module. Diagnostic events remain local unless the operator explicitly chooses another destination.

Run `node --test integrations/payment-recovery/*.test.mjs` from repository root. Tests use synthetic responses; no funds are spent. No npm publication, live recovery, external installation, or paid customer is claimed.
