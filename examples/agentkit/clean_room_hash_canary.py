"""Clean-room Industrial Platform /hash canary using Coinbase AgentKit.

Default: dry-run. It fetches public pricing, hits /hash once without payment, and
prints the live x402 option. It cannot spend unless --pay is supplied.

The paid path uses AgentKit's own x402 implementation, not Industrial Platform's
client wrapper, so it exercises an independent buyer stack.
"""

from __future__ import annotations

import argparse
import json

import requests
from coinbase_agentkit.action_providers.x402.schemas import PaymentOptionSchema

from integration import GATEWAY, build_wallet_provider, build_x402_provider

HASH_URL = f"{GATEWAY}/hash"
EXPECTED_MAX_ATOMIC = 1000


def public_canary_price() -> dict:
    response = requests.get(f"{GATEWAY}/pricing.json", timeout=20)
    response.raise_for_status()
    pricing = response.json()
    row = next(
        (x for x in pricing.get("tools", []) if x.get("route") == "/hash"),
        None,
    )
    if not row:
        raise RuntimeError("/hash is missing from live /pricing.json")
    return row


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--pay",
        action="store_true",
        help="Authorize the live x402 retry. Without this flag the script is dry-run only.",
    )
    args = parser.parse_args()

    row = public_canary_price()
    atomic = int(row["amountAtomic"])
    print("LIVE_PRICING", json.dumps(row, sort_keys=True))

    if atomic > EXPECTED_MAX_ATOMIC:
        raise RuntimeError(
            f"Refusing canary: live /hash price is {atomic} atomic USDC, "
            f"above hard ceiling {EXPECTED_MAX_ATOMIC}."
        )

    request_body = {
        "text": "industrial-platform-clean-room-canary",
        "algo": "sha256",
    }

    # Dry-run intentionally requires no wallet or private key. Validate the live
    # x402 challenge over plain HTTP first, and only construct AgentKit wallet
    # machinery when --pay is explicitly supplied.
    initial = requests.post(HASH_URL, json=request_body, timeout=20)
    print(
        "INITIAL_HTTP",
        json.dumps(
            {
                "status_code": initial.status_code,
                "payment_required": bool(initial.headers.get("PAYMENT-REQUIRED")),
            },
            sort_keys=True,
        ),
    )
    if initial.status_code != 402:
        raise RuntimeError(f"Expected live HTTP 402 from /hash, got {initial.status_code}.")
    if not initial.headers.get("PAYMENT-REQUIRED"):
        raise RuntimeError("Live 402 omitted PAYMENT-REQUIRED.")

    if not args.pay:
        print(
            "DRY_RUN_PASS: live x402 402 is present and machine-readable; "
            "no wallet was loaded and no payment was signed or submitted."
        )
        return

    wallet = build_wallet_provider()
    provider = build_x402_provider(max_payment_usdc=0.001)
    request_args = {
        "url": HASH_URL,
        "method": "POST",
        "body": request_body,
    }
    first = json.loads(provider.make_http_request(wallet, request_args))
    print("AGENTKIT_INITIAL_REQUEST", json.dumps(first, indent=2, sort_keys=True))

    if first.get("status") != "error_402_payment_required":
        raise RuntimeError("AgentKit did not recognize the live HTTP 402.")

    options = first.get("acceptablePaymentOptions") or []
    if not options:
        raise RuntimeError("AgentKit found no acceptable USDC payment option.")

    option = options[0]
    required_atomic = int(
        option.get("amount")
        or option.get("max_amount_required")
        or option.get("maxAmountRequired")
        or 0
    )
    if required_atomic > EXPECTED_MAX_ATOMIC:
        raise RuntimeError(
            f"Refusing payment: challenge requests {required_atomic} atomic USDC."
        )

    selected = PaymentOptionSchema.model_validate(option)
    paid_args = {
        **request_args,
        "selected_payment_option": selected,
    }
    result = json.loads(provider.retry_with_x402(wallet, paid_args))
    print("PAID_RETRY", json.dumps(result, indent=2, sort_keys=True))

    if result.get("status") != "success":
        raise RuntimeError("Paid AgentKit retry did not complete successfully.")

    print("CANARY_SETTLED: external-style AgentKit buyer completed /hash over x402.")


if __name__ == "__main__":
    main()
