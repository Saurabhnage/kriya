# KRIYA — Autonomous Capital Protocol

> **Stop programming transactions. Start programming financial objectives.**

KRIYA lets a user program a **financial mandate** (objective + hard constraints) instead of individual transactions. An AI agent (Claude) researches strategies and proposes allocations, **Chainlink CRE** verifies external reality and orchestrates the decision-to-execution flow, and **smart contracts enforce** the mandate: any allocation outside it reverts.

**AI proposes · Rules constrain · Verifiable infrastructure verifies · Smart contracts enforce.**

---

## Live on Ethereum Sepolia

**App:** https://kriya-beta.vercel.app (any mandate can be viewed read-only: [demo mandate](https://kriya-beta.vercel.app/?view=0x09855cE865D094F6c2F2B5A13F64FC6F82b3B4C7))

| Contract | Address |
| --- | --- |
| KriyaExecutor (CRE receiver) | [`0x9c5f1A2326Fa1C16e04Ecf32C60091150161656A`](https://sepolia.etherscan.io/address/0x9c5f1A2326Fa1C16e04Ecf32C60091150161656A) |
| KriyaVault | [`0xd167B393646E39A01bB14A4e0C53A96940C249ee`](https://sepolia.etherscan.io/address/0xd167B393646E39A01bB14A4e0C53A96940C249ee) |
| KriyaMandate | [`0x97FD1b5af7622377744C8c2F44F4fF3A04a52073`](https://sepolia.etherscan.io/address/0x97FD1b5af7622377744C8c2F44F4fF3A04a52073) |
| KriyaStrategyRegistry | [`0xadAE9Abccf4fE599405C39bC19A4686566dEd7b6`](https://sepolia.etherscan.io/address/0xadAE9Abccf4fE599405C39bC19A4686566dEd7b6) |
| Test USDC | [`0x17Be8BA91d0f331B198eFe73Dd272f9C492d471D`](https://sepolia.etherscan.io/address/0x17Be8BA91d0f331B198eFe73Dd272f9C492d471D) |
| Strategy A / B / C | [`0xE92168d45CAf4ec291ce78E727e90015D50e2032`](https://sepolia.etherscan.io/address/0xE92168d45CAf4ec291ce78E727e90015D50e2032) / [`0xe62bE538B87fb492FCf977b1Ddf7ee7202148006`](https://sepolia.etherscan.io/address/0xe62bE538B87fb492FCf977b1Ddf7ee7202148006) / [`0x5d59Be06B7518EF3438194226826487d35a5f6fd`](https://sepolia.etherscan.io/address/0x5d59Be06B7518EF3438194226826487d35a5f6fd) |
| Chainlink forwarder (simulation) | [`0x15fC6ae953E024d975e77382eEeC56A9101f9F88`](https://sepolia.etherscan.io/address/0x15fC6ae953E024d975e77382eEeC56A9101f9F88) |

End-to-end loop executed on Sepolia:

| Step | Tx |
| --- | --- |
| Open $1,000 mandate | [`0x7b0fd91d…`](https://sepolia.etherscan.io/tx/0x7b0fd91db394dd1156e0c37d1383eb5752e39e444f4458a822a6e9e4601b554f) |
| Initial allocation (B 40 · A 35 · Reserve 25) | [`0x6a779a47…`](https://sepolia.etherscan.io/tx/0x6a779a47e15b4ce9b1340f3e5d56dc878c128257c3dcb39cdf8b760661f9cd25) |
| Guardrail: unsafe 60% proposal **reverted** (`ExposureExceeded`) | [`0x6eee86fd…`](https://sepolia.etherscan.io/tx/0x6eee86fd1dd39e1c9f939d4e04c92bc1d477eecec828c89553fcfe4eba3077b9) |
| Verified risk change: Strategy B 34 → 48 | [`0x8b7f4aa0…`](https://sepolia.etherscan.io/tx/0x8b7f4aa068c2856977b37168864e2b701ebf5771c9af05c5cf69201ab123dfa4) |
| Autonomous rebalance (A 40 · C 35 · Reserve 25) | [`0x96727352…`](https://sepolia.etherscan.io/tx/0x967273526aeabd1a3a7663ac70cf32c7060110ebc9150529f7b165dd63619d04) |

> **Decision engine:** Claude (`claude-sonnet-5-5`) proposes allocations as schema-bound JSON; the policy engine, the CRE workflow and the executor contract each re-validate it. If Claude is unavailable (or `KRIYA_LLM=off`), the transparent deterministic optimizer takes over.

**Chainlink CRE workflow** (`cre workflow simulate kriya-workflow --broadcast`), reports delivered through the Sepolia Keystone forwarder, decision by Claude (`claude-sonnet-5-5`):

| CRE step | Tx |
| --- | --- |
| VERIFY: risk report, Strategy B 34 → 48 | [`0x66deb846…`](https://sepolia.etherscan.io/tx/0x66deb846f9d9a4d33b2a5a6ff6635a5c1b9692064479274e7eac8cd1498136b9) |
| DETECT → DECIDE (Claude) → CONSTRAIN → EXECUTE: rebalance to A 40 · C 35 · Reserve 25, risk 14/40 (`source = CRE`) | [`0x2d8a4366…`](https://sepolia.etherscan.io/tx/0x2d8a4366bf67a6f5e7a9f7ce6b3aff2556921ba8c22e0c7af91b914a983441d5) |
| VERIFY: risk restored, Strategy B 48 → 34 (mandate safe, no rebalance) | [`0xd4fc8b94…`](https://sepolia.etherscan.io/tx/0xd4fc8b94dba0810391055ffa6fee49c8034c50d26f54b8c66234ba2fe46db59f) |

## The loop

```
User mandate ──► KriyaVault.openMandate (capital + objective + limits, one tx)
                         │
   ┌─────────────── Chainlink CRE workflow (cron) ────────────────┐
   │ OBSERVE   HTTP: external risk feed (DON consensus)            │
   │           EVM read: strategies, mandates, positions           │
   │ VERIFY    risk changed? → signed report → registry update     │
   │ DETECT    mandate health under verified risk                  │
   │ DECIDE    HTTP POST → KRIYA agent (Claude) → allocation JSON  │
   │ CONSTRAIN shared policy re-validates the proposal in-workflow │
   │ EXECUTE   signed report → KriyaExecutor.onReport              │
   └──────────────────────────────┬───────────────────────────────┘
                                  ▼
       KriyaExecutor.validateAllocation (onchain, final authority)
             pass → rebalance vault ⇄ strategies     fail → revert
```

The same rulebook (`web/src/lib/policy.ts`) is used by the agent, by the CRE workflow (imported directly and compiled to WASM), and mirrored in Solidity in `KriyaExecutor.validateAllocation`. The LLM's output is never trusted. It is parsed into a typed allocation, validated three times, and the contract has the final word.

## Repository

| Path | What |
| --- | --- |
| `contracts/` | Foundry. `KriyaVault`, `KriyaMandate`, `KriyaExecutor` (CRE receiver), `KriyaStrategyRegistry`, mock USDC + strategy vaults. 17 tests. |
| `web/` | Next.js dashboard + agent server: Claude decision engine, policy engine, risk feed, keeper fallback, API for CRE. |
| `cre/` | Chainlink CRE project: `kriya-workflow` (TypeScript → WASM). |
| `scripts/deploy-sepolia.sh` | Deploy + wire web and CRE to new addresses. |

### Contracts

- **KriyaMandate** stores each user's `Params { maxRisk, maxExposureBps, maxDrawdownBps, minReserveBps, autoRebalance, objective }` and allowlisted strategies. The user can pause it at any time (human override).
- **KriyaVault** handles custody and per-user accounting. Funds move **only** vault ⇄ registered strategies (executor-only) or back to their owner. `emergencyExit()` pulls everything back to the reserve.
- **KriyaExecutor** is the enforcement layer. It has two entry points that run the *same* validation:
  - `onReport` (Chainlink Keystone forwarder only): report kind `1` = verified risk update, `2` = allocation
  - `executeAllocation` (agent key): a fallback path with no extra powers

  Reverts with typed errors: `ExposureExceeded`, `StrategyRiskExceeded`, `PortfolioRiskExceeded`, `ReserveBelowMinimum`, `StrategyNotAllowed`, `DuplicateStrategy`, `DrawdownExceeded`, `MandateInactive`, `AutoRebalanceDisabled`, `ProtocolPaused`.
- **KriyaStrategyRegistry** holds the allowlisted strategy universe and verified risk scores (written by CRE reports through the executor, or by the owner).

Risk model: a held strategy's risk must be ≤ `maxRisk`, and portfolio risk `Σ(bps·risk) + reserveBps·2` / 10000 must be ≤ `maxRisk`.

### Demo strategies (controlled testnet universe)

| Strategy | APY | Risk |
| --- | --- | --- |
| A, Stable Lending | 8.4% | 21 |
| B, LP Yield | 11.2% | 34 |
| C, T-Bill Vault | 6.8% | 15 |
| USDC Reserve | — | 2 |

These are mock strategy vaults that **really hold the test USDC** (every move is a real ERC-20 transfer). Yields and risk scores are demo parameters and are labelled as such. Nothing is simulated state presented as real.

Demo mandate: $1,000 · max risk 40 · max exposure 40% · min reserve 25% · max drawdown 5% · auto-rebalance on.

| | Allocation | Portfolio risk |
| --- | --- | --- |
| Initial | B 40% · A 35% · Reserve 25% | 21 / 40 |
| B risk 34 → 48 | B now breaches max risk 40 → **MANDATE AT RISK** | — |
| After rebalance | A 40% · C 35% · Reserve 25% | 14 / 40 |
| Unsafe proposal (B 60%) | **reverts onchain** with `ExposureExceeded` | — |

---

## Run locally (Anvil, no testnet funds needed)

```bash
anvil
```

```bash
cd contracts && forge test
```

```bash
cd contracts && PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 AGENT_ADDRESS=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC CRE_FORWARDER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

```bash
cd web && npm install && npm run sync && npm run dev
```

`web/.env.local` for Anvil uses the public Anvil dev keys:

```
NEXT_PUBLIC_CHAIN_ID=31337
ADMIN_PRIVATE_KEY=<anvil account 0>
AGENT_PRIVATE_KEY=<anvil account 2>
ANTHROPIC_API_KEY=<your key>
```

Add the Anvil network to MetaMask (RPC `http://127.0.0.1:8545`, chain id 31337), import an Anvil account, and open http://localhost:3000. Any mandate can be viewed read-only at `/?view=<address>`.

## Deploy to Ethereum Sepolia

1. Create two keys: a funded **deployer** and an **agent** key (fund the agent with a little Sepolia ETH as well).
2. Deploy and wire everything:
   ```bash
   PRIVATE_KEY=0x... AGENT_ADDRESS=0x... ETHERSCAN_API_KEY=... ./scripts/deploy-sepolia.sh
   ```
   The executor trusts the Sepolia **MockKeystoneForwarder** `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` used by `cre workflow simulate --broadcast`. For a production CRE deployment, call `setForwarderAddress` with the production Keystone forwarder.
3. Set `web/.env.local` from `web/.env.example` (`NEXT_PUBLIC_CHAIN_ID=11155111`, `AGENT_PRIVATE_KEY`, `ADMIN_PRIVATE_KEY`, `ANTHROPIC_API_KEY`).

## Run the Chainlink CRE workflow

```bash
cre login
```

```bash
cd cre/kriya-workflow && bun install
```

```bash
cd cre && cp .env.example .env
```

Put a funded Sepolia key (no `0x`) in `cre/.env` as `CRE_ETH_PRIVATE_KEY`. With the web app running on `localhost:3000`:

```bash
cd cre && cre workflow simulate kriya-workflow --target staging-settings --non-interactive --trigger-index 0 --broadcast
```

Each run executes one full loop. Writes go through the MockKeystoneForwarder into `KriyaExecutor.onReport`, and the dashboard tags these executions **CHAINLINK CRE**.

The **Run autonomous loop** button in the dashboard runs the identical loop from the KRIYA server (agent + owner keys) as a fallback when CRE is unavailable. Those executions are tagged **AGENT**.

## Testing

| Layer | What runs | Command |
| --- | --- | --- |
| Contracts | 19 unit tests + 4 fuzz properties (1,000 runs each): funds are always conserved, `validateAllocation` always agrees with execution, every executed allocation leaves the mandate compliant, a strategy above max risk can never be held | `cd contracts && forge test` |
| Policy engine | 12 tests mirroring the contract cases, plus 2,000 random mandates checking the optimizer never produces an invalid allocation | `cd web && npm test` |
| End to end | 15 checks against Anvil + the real API + wallet transactions: open mandate, allocate, guardrail revert, risk spike, verified rebalance, emergency exit, input validation, rate limits | `cd web && npm run e2e` (setup in `web/scripts/e2e.mjs`) |
| CRE workflow | Typecheck + WASM build | `cd cre && cre workflow build kriya-workflow` |

GitHub Actions runs all of it, including the end-to-end suite on a fresh Anvil chain, on every push (`.github/workflows/ci.yml`).

## 3-minute demo script

The dashboard is a one-screen **mission control**: mandate and allocation on the left, the live loop pipeline and Claude's decision in the centre, the activity timeline on the right. The **stage bar** at the bottom shows which act you are in (1 Program → 2 Decide → 3 Guard → 4 Reality → 5 Rebalance → Done) and highlights the next button to press. Judges without a wallet can open the live demo mandate read-only from the landing page.

1. **Program (0:00):** connect wallet → set limits; the live preview shows what KRIYA would allocate before you sign. *Program mandate* walks through mint → approve → `openMandate` with a step checklist.
2. **Decide (0:20):** *Preview decision* fills the decision card with Claude's allocation, rationale and per-strategy assessment. *Run loop* (or the CRE workflow) streams OBSERVE → VERIFY → DETECT → DECIDE → CONSTRAIN → EXECUTE into the pipeline as each step lands: **B 40 · A 35 · Reserve 25** onchain.
3. **Guard (1:00):** *Guardrail test* submits an unsafe 60% allocation from the agent key; it **reverts onchain** with `ExposureExceeded`.
4. **Reality (1:30):** *Spike B → 48*. The status badge flips to **⚠ AT RISK** (external signal) and the gauge shows the unverified reading.
5. **Rebalance (2:00):** *Run loop* again (or CRE): VERIFY writes the risk onchain, DECIDE exits B, EXECUTE rebalances. The risk chart steps down from 21 to 14.
6. **Done (2:30):** A 40 · C 35 · Reserve 25, risk 14/40, **✓ SAFE**. *Reset feed* replays the story.

## Security model

- The AI holds no keys and never controls funds. Its output is schema-constrained JSON, validated offchain, validated in CRE, and validated onchain.
- The agent key can only call `executeAllocation`, which runs the same checks as CRE reports. Funds can only move between the vault and allowlisted strategies.
- Only the configured Keystone forwarder can deliver reports. Workflow ID/owner checks can be enabled via `ReceiverTemplate` setters.
- User override: pause the mandate (`setActive(false)`), `emergencyExit()`, and `withdraw()`. `emergencyExit()` also pauses the mandate, so the agent cannot redeploy capital the user just pulled out (the live Sepolia contracts predate this; the dashboard pauses before exiting there). Owner-level emergency pause: `KriyaExecutor.setPaused`.
- The gas- and credit-spending API routes are rate limited across instances (Redis), so a public demo URL cannot drain the agent wallet.
- Limits enforced: per-strategy exposure caps, per-strategy and portfolio risk caps, minimum liquidity reserve, drawdown floor vs high-water mark, strategy allowlist, auto-rebalance opt-in.
