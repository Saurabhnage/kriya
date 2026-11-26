#!/usr/bin/env bash
# Runs web/scripts/e2e-market.mjs end to end on a fresh local Anvil chain, with no API keys:
# CoinMarketCap and Cournot are served by web/scripts/market-fixtures.mjs, and two Atlas-style
# AggregatorV3 feeds (USDT/USD, BNB/USD) are deployed from contracts/src/mocks/MockAggregatorV3.sol.
# Needs: foundry (anvil, forge, cast) and node. Run from the repo root: ./scripts/e2e-market-local.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
RPC=http://127.0.0.1:8545
MNEMONIC="test test test test test test test test test test test junk"
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

anvil --silent & PIDS+=($!)
for _ in $(seq 1 30); do cast block-number --rpc-url $RPC >/dev/null 2>&1 && break; sleep 1; done

PK0=$(cast wallet private-key "$MNEMONIC" 0)
cd "$ROOT/contracts"
PRIVATE_KEY=$PK0 \
AGENT_ADDRESS=$(cast wallet address "$(cast wallet private-key "$MNEMONIC" 2)") \
CRE_FORWARDER=$(cast wallet address "$(cast wallet private-key "$MNEMONIC" 1)") \
  forge script script/Deploy.s.sol --rpc-url $RPC --broadcast >/dev/null
feed() { forge create src/mocks/MockAggregatorV3.sol:MockAggregatorV3 --rpc-url $RPC --private-key "$PK0" --broadcast --constructor-args 8 "$1" "$2" | awk '/Deployed to/{print $3}'; }
export ATLAS_FEED_USDT_USD=$(feed "USDT / USD" 100020000)
export ATLAS_FEED_BNB_USD=$(feed "BNB / USD" 60000000000)
echo "Atlas mock feeds: USDT $ATLAS_FEED_USDT_USD · BNB $ATLAS_FEED_BNB_USD"

cd "$ROOT/web"
npm run sync >/dev/null
rm -rf .data   # local store: start from a clean state
export MOCK_MODE_FILE="$WORK/mode"
echo calm > "$MOCK_MODE_FILE"
PORT=4010 node scripts/market-fixtures.mjs > "$WORK/fixtures.log" 2>&1 & PIDS+=($!)

export NEXT_PUBLIC_CHAIN_ID=31337 KRIYA_LLM=off
export ADMIN_PRIVATE_KEY=$PK0 AGENT_PRIVATE_KEY=$(cast wallet private-key "$MNEMONIC" 2)
export CMC_API_KEY=fixture CMC_CACHE_MS=0 CMC_API_BASE=http://127.0.0.1:4010 COURNOT_API_BASE=http://127.0.0.1:4010
unset COURNOT_API_KEY LIVING_BRAIN_API_KEY
npx next dev -p 3001 > "$WORK/next.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 90); do curl -sf http://localhost:3001/api/risk-feed >/dev/null && break; sleep 2; done

node scripts/e2e-market.mjs || { tail -60 "$WORK/next.log"; exit 1; }
