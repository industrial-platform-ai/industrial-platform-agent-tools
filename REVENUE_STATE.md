# Industrial Platform Revenue State

Updated: 2026-09-30

## Objective

Obtain the first unsolicited / independently router-selected paid x402 call, then scale from 1 -> 10 -> 100 -> recurring volume without spending to manufacture test demand.

## Production seller

- Origin: https://x402-gateway-production-1f21.up.railway.app
- Network: Base (eip155:8453)
- Asset: USDC
- Seller payTo: 0x1FfD0FE3D4E0e4bA6337231b9a81B6672aED9744
- Railway project: Industrial Platform x402 Gateway
- Gateway service: x402-gateway
- Seed/index worker: x402-seed-buyer

## Independent x402 compatibility proof

Agent402 previously paid the seller from an external Agent402 wallet during a seller-payability validation initiated by Industrial Platform.

- External payer: 0x77065d81e18ad403BCD6e9A0616b288e16744121
- Settlement transaction: 0xfdb6fa8f4c2211f05e75d7a9cc97df831201512b52d6217092fc7c46675bf3e7
- Amount: $0.001 USDC
- Result: HTTP 402 -> external payment -> HTTP 200
- This proves interoperability, not organic demand.

## Direct x402 products

Web products:
- web-metadata-intelligence — POST /metadata — $0.001
- web-change-intelligence — POST /change — $0.001
- web-reader — POST /read — $0.001

Low-cost deterministic utilities are generally $0.0005/call:
- hash — /hash — SHA-256/SHA-512/SHA-1/MD5; hex + Base64 digests
- hmac — /hmac
- base64 — /base64
- base64-encode — /base64/encode
- base64-decode — /base64/decode
- jwt-decode — /jwt/decode
- hex-encode — /hex/encode
- hex-decode — /hex/decode
- url-encode-decode — /url/code
- multi-digest-checksum — /checksum
- json-canonicalize — /json/canonicalize
- querystring — /querystring
- url-inspect — /url/inspect
- text-stats — /text/stats
- text-diff — /text/diff
- text-chunk — /text/chunk
- html-to-text — /html/text
- html-links — /html/links
- html-metadata — /html/meta
- slugify — /text/slugify

The manifest is generated from the live tool definitions; route count should be verified after each Agent402 recrawl.

## Discovery surfaces

- /.well-known/x402
- /.well-known/x402.json
- /openapi.json
- /.well-known/agent.json
- /.well-known/agent-card.json
- /llms.txt
- /skill.md

OpenAPI includes x402 payment metadata. /.well-known/x402 includes compatibility resources. agent.json is dual-compatible with the Open 402 directory schema.

## Agent402

Industrial Platform is registered directly in Agent402.

Confirmed response:
- listed: true
- routable: true
- health: 1
- toolCount reached 14 before the latest expansion
- display name: Industrial Platform Agent Utility Market

Agent402 free resolver diagnostics showed its own Hash/Base64 tools at $0.001. Industrial Platform utilities were lowered to $0.0005 and renamed/described to match exact buyer intents.

The index worker automatically requests a permitted re-read after Agent402's cooldown and runs throttled free /api/find diagnostics. It does not make paid calls.

## x402scan

A plain free registration request returned an authentication-only SIWX challenge with accepts: [].

The index worker now responds to that challenge using the derived seller wallet only when accepts is empty. It refuses to proceed through this path if a monetary payment requirement appears.

## Coinbase Bazaar

The gateway uses the x402 Bazaar discovery extension with Coinbase/CDP facilitator support. Earlier settlement logs showed Bazaar extension processing and Coinbase discovery crawler traffic.

## Apify portfolio

Existing / built actors include:
1. research-brief-agent
2. web-change-intelligence
3. web-metadata-intelligence
4. article-content-intelligence
5. pdf-text-intelligence
6. sitemap-intelligence
7. link-intelligence
8. robots-policy-intelligence

Products 7 and 8 already exist in main. GitHub Actions has APIFY_TOKEN-based deployment/publication automation, but Apify publication quota and potential build compute mean direct x402 distribution is prioritized for the zero-spend first-sale objective.

## Zero-spend rule

Do not:
- buy Agent402 Demand Radar
- buy seller-payability tests
- manufacture self-funded seed sales
- pay directory listing fees
- enable RUN_PAYMENT merely to produce a transaction

Allowed:
- free registry/index submissions
- off-chain SIWX identity signatures
- free resolver/discovery reads
- GitHub/Railway code and deployment work using already-configured infrastructure
- passive receipt of buyer payments

## Definition of first real paid call

A new X402_SETTLED event:
- not from the controlled seed/test payer
- caused by an independent buyer/router task
- paid to the Industrial Platform seller wallet
- accompanied by a successful paid route response

When it occurs, record payer, transaction, route, amount, timestamp, source/referrer if inferable, and replicate the winning product/distribution path.
