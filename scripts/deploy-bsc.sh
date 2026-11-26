#!/usr/bin/env bash
# Deploy KRIYA to BNB Chain testnet (chain 97) and wire the web app + CRE workflow to the new addresses.
# Requires: PRIVATE_KEY (funded deployer, 0x-prefixed, tBNB from https://www.bnbchain.org/en/testnet-faucet),
#           AGENT_ADDRESS (public address of AGENT_PRIVATE_KEY). Optional: BSC_TESTNET_RPC_URL, ETHERSCAN_API_KEY.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PRIVATE_KEY:?set PRIVATE_KEY}"
: "${AGENT_ADDRESS:?set AGENT_ADDRESS (public address of AGENT_PRIVATE_KEY)}"
RPC="${BSC_TESTNET_RPC_URL:-https://data-seed-prebsc-1-s1.bnbchain.org:8545}"
VERIFY=()
[ -n "${ETHERSCAN_API_KEY:-}" ] && VERIFY=(--verify --etherscan-api-key "$ETHERSCAN_API_KEY" --chain 97)

(cd contracts && forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --legacy "${VERIFY[@]}")
(cd web && npm run sync)
node cre/sync-config.mjs "${AGENT_URL:-http://localhost:3000}" 97
echo "Done. Addresses: contracts/deployments/97.json · set NEXT_PUBLIC_CHAIN_ID=97 in web/.env.local"
