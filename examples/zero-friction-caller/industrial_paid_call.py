import os
from eth_account import Account
from x402 import x402ClientSync
from x402.http.clients import x402_requests
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client

GATEWAY = "https://x402-gateway-production-1f21.up.railway.app"

account = Account.from_key(os.environ["EVM_PRIVATE_KEY"])

client = x402ClientSync().set_spend_controls({
    "max_amount_per_payment": "$0.005"
})

register_exact_evm_client(client, EthAccountSigner(account))

with x402_requests(client) as session:
    response = session.post(
        GATEWAY + "/crypto/price",
        json={"product_id": "BTC-USD"},
        timeout=30,
    )

response.raise_for_status()
print(response.json())
