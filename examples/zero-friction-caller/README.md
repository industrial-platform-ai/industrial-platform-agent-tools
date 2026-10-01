# Zero-friction x402 caller

Minimal official-client example for Industrial Platform's direct Base x402 gateway.

Install:

```bash
pip install "x402[requests]" eth-account
```

Provide a caller-owned EVM wallet through your runtime environment. The wallet needs enough USDC on Base for the selected route.

Run:

```bash
python examples/zero-friction-caller/industrial_paid_call.py
```

The official x402 client handles the protocol flow automatically:

```text
POST -> 402 PAYMENT-REQUIRED -> sign -> PAYMENT-SIGNATURE retry -> 200 + PAYMENT-RESPONSE
```

The example enforces a hard `$0.005` maximum per payment before signing.
