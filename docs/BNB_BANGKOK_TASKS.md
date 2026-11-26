# BNB Bangkok: finish-line tasks for Claude Code

Deadline: **27 Nov 2026, 09:00 Bangkok (02:00 UTC)**. Submit by 08:00.
Branch: `bnb-bangkok`. Everything below runs on the developer's machine.

Rules for the agent doing this:
- Never print, commit or paste private keys or API keys. Read them only from `web/.env.local`, `contracts/.env` and `cre/.env` (all gitignored).
- Ask before any step that spends real money. Testnet gas is fine.
- Cournot gives only **3 free probability calls per IP, ever**. Never call `assess` in loops or retries. Prefer the prepaid key.
- After each step, show the result (addresses, tx hashes, errors) before moving on.

## 0. Preflight
1. `git checkout bnb-bangkok && git pull`
2. Check tools: `node -v` (≥ 20), `forge --version`, optional `cre version` and `bun -v` for the CRE run.
3. `cd contracts && forge test`: expect 23 passing.
4. `cd web && npm ci && npm test`: expect 47 passing. `npx tsc --noEmit` and `npx eslint src` should be clean.
5. Optional, no keys needed: `./scripts/e2e-market-local.sh` runs the market risk engine end to end on Anvil (CMC/Cournot fixtures, Atlas mock feeds): expect 8 passing.

## 1. Keys and env (ask the developer for anything missing)
Create `web/.env.local` from `web/.env.example`:
- `NEXT_PUBLIC_CHAIN_ID=97`
- `AGENT_PRIVATE_KEY`, `ADMIN_PRIVATE_KEY`: two testnet wallets, both funded with tBNB (https://www.bnbchain.org/en/testnet-faucet)
- `ANTHROPIC_API_KEY`
- `CMC_API_KEY`, `COURNOT_API_KEY` (prepaid), `LIVING_BRAIN_API_KEY`
- `ATLAS_FEED_BNB_USD`, `ATLAS_FEED_USDT_USD`, `ATLAS_FEED_USDC_USD`: Atlas feed addresses on **BSC testnet** (from docs.atlasoracle.io or the Atlas team). Verify each one with
  `cast call <addr> "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545`
  and drop any address that reverts.

## 2. Deploy to BNB Chain testnet
```bash
PRIVATE_KEY=<deployer, from the developer's env> AGENT_ADDRESS=<address of AGENT_PRIVATE_KEY> ./scripts/deploy-bsc.sh
```
- This writes `contracts/deployments/97.json`, syncs the web app and writes `cre/kriya-workflow/config.bnb.json`.
- If BSC rejects the txs, keep `--legacy`. If the RPC rate-limits, set `BSC_TESTNET_RPC_URL` to another public BSC testnet RPC.
- If `ETHERSCAN_API_KEY` is available, verify the contracts on testnet.bscscan.com.

## 3. Smoke test the live integrations
1. `cd web && npm run dev`
2. `curl localhost:3000/api/market`: `enabled.coinmarketcap` should be true and `atlasFeeds` should list the feeds.
3. `curl -X POST localhost:3000/api/market/refresh -H 'content-type: application/json' -d '{}'`: expect real CMC quotes, Atlas prices and risk scores. Fix any errors in `web/src/lib/server/market/*`.
4. Living Brain: open the dashboard, run one decision, then check that the decision card shows "Recalled from Living Brain" (not "local fallback"). If the SDK returns errors, check them against `node_modules/@living-brain/sdk/reference.md` and fix `web/src/lib/server/memory.ts`.

## 4. Record the live demo flow on BSC testnet
In the browser (MetaMask on BSC testnet), or scripted with viem from a funded test wallet:
1. Open a $1,000 mandate (max risk 40, max exposure 40%, min reserve 25%, auto-rebalance on). Save the tx hash.
2. **Run loop** → initial allocation. Save the tx hash.
3. **Guardrail test** → `ExposureExceeded` revert. Save the tx hash.
4. Cournot: in *Market intelligence → Event risk*, enter a real claim (e.g. "BNB below $500 before December 31, 2026", direction = stress), click **Find markets**, then **Assess** exactly once. Save the proof id and request id from `GET /api/market` → `evidence.cournotProofs`.
5. If live market risk alone doesn't breach the mandate, use **Spike B → 48** (scenario override), then **Run loop** → VERIFY tx + rebalance tx. Save both.
6. Optional: run the CRE workflow on BNB:
   `cd cre && cre workflow simulate kriya-workflow --target bnb-settings --non-interactive --trigger-index 0 --broadcast`
   with the web app reachable at the `agentUrl` in `config.bnb.json`. Save the tx hashes and copy the CLI output to `docs/cre/bnb-simulation.log`.
7. Optional: deploy the web app to Vercel with `NEXT_PUBLIC_CHAIN_ID=97` and the same env (plus Upstash Redis for shared state). Then put the demo mandate address in `DEMO_VIEW_ADDRESS` for chain 97 in `web/src/lib/config.ts`.

## 5. Fill in every TODO
- `README.md` → "BNB Bangkok 2026" section: contract table (from `97.json`, as testnet.bscscan.com links), Atlas feed addresses, the step/tx table, Cournot proof id and request id, live app URL.
- `docs/BNB_BANGKOK_WRITEUP.md`: addresses, tx hashes, demo video link, contact.
- Take a screenshot of the dashboard after the rebalance → `docs/bnb-dashboard.jpg`, and reference it in the README.
- Run `grep -rn "TODO" README.md docs/BNB_BANGKOK_WRITEUP.md` to confirm nothing is left.

## 6. Final checks and push
- `cd contracts && forge test`, `cd web && npm test && npx tsc --noEmit && npx eslint src`
- `git status`: confirm that no `.env*` files (other than `.env.example`), keys, `.data/` or `broadcast/*/31337` are staged.
- Commit ("BNB Bangkok: testnet deployment, live evidence, docs") and push `bnb-bangkok`. Ask the developer whether to merge into `main`, since judges usually open the default branch.

## 7. Submission (the developer does this, Claude Code can draft it)
- HackQuest project: description, public repo link, demo video, and tracks **Developer Track, CoinMarketCap × Atlas, Cournot, ChatAndBuild Living Brain**.
- Videos: a ≤3-minute cut (CMC × Atlas) and a 3–5-minute cut (Living Brain: show remember → retrieve → connect).
- Post on X with the video, tagging @chatandbuild @livingbrain @BNBCHAIN, and share in the ChatAndBuild Slack.
- Ask the organizers whether a pre-existing project is eligible (KRIYA was entered at Monad Metropolis and TOKEN2049 Origins). The README discloses exactly what was built at BNB Bangkok.
