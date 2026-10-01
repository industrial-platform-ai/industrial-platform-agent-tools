# Coinbase AgentKit x402 buyer

This example connects a funded **Base** AgentKit wallet to Industrial Platform using Coinbase AgentKit's own x402 action provider.

It is deliberately seller-independent: it does **not** use Industrial Platform's Python x402 wrapper. This makes it suitable as a clean-room buyer interoperability test.

## Install

```bash
python -m pip install -r requirements.txt
```

Set an external Base wallet private key locally:

```bash
export EVM_PRIVATE_KEY=0x...
```

Do not commit the key.

## Dry-run first

```bash
python clean_room_hash_canary.py
```

The dry run:

1. fetches `/pricing.json`,
2. requires `/hash` to be priced at no more than **1000 atomic USDC units ($0.001)**,
3. sends the unpaid POST,
4. lets AgentKit parse the live x402 v2 challenge,
5. verifies AgentKit sees an acceptable Base/USDC payment option,
6. exits without signing or sending payment.

## Explicit live canary

Only after deliberately funding and authorizing the external wallet:

```bash
python clean_room_hash_canary.py --pay
```

The script has two independent hard ceilings:

- live `/pricing.json` must advertise no more than 1000 atomic units;
- the actual 402 challenge must request no more than 1000 atomic units.

The AgentKit x402 provider is also configured with a per-request ceiling of `0.001` USDC.

A successful run proves this independent buyer path:

```text
AgentKit Base wallet
  -> POST /hash
  -> HTTP 402 + PAYMENT-REQUIRED
  -> AgentKit parses Base USDC requirement
  -> AgentKit signs x402 payment
  -> PAYMENT-SIGNATURE retry
  -> HTTP 200 + PAYMENT-RESPONSE
```

Gateway:

```text
https://x402-gateway-production-1f21.up.railway.app
```
