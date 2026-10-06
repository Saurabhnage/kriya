#!/usr/bin/env bash
# Deploy KRIYA to Ethereum Sepolia and wire the web app + CRE workflow to the new addresses.
# Requires: PRIVATE_KEY (funded deployer, 0x-prefixed), AGENT_ADDRESS, optional SEPOLIA_RPC_URL, ETHERSCAN_API_KEY.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PRIVATE_KEY:?set PRIVATE_KEY}"
: "${AGENT_ADDRESS:?set AGENT_ADDRESS (public address of AGENT_PRIVATE_KEY)}"
RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
VERIFY=()
[ -n "${ETHERSCAN_API_KEY:-}" ] && VERIFY=(--verify --etherscan-api-key "$ETHERSCAN_API_KEY")

(cd contracts && forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast "${VERIFY[@]}")
(cd web && npm run sync)
node cre/sync-config.mjs "${AGENT_URL:-http://localhost:3000}"
echo "Done. Addresses: contracts/deployments/11155111.json"
