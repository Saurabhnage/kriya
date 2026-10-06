# KRIYA — Autonomous Capital Protocol

> **Stop programming transactions. Start programming financial objectives.**

KRIYA lets a user program a **financial mandate** (objective + hard constraints) instead of individual transactions. An AI agent (Claude) researches strategies and proposes allocations, **Chainlink CRE** verifies external reality and orchestrates the decision-to-execution flow, and **smart contracts enforce** the mandate: any allocation outside it reverts.

**AI proposes · Rules constrain · Verifiable infrastructure verifies · Smart contracts enforce.**

---

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

## 3-minute demo script

1. **Objective (0:00):** connect wallet → *Program mandate* ($1,000, max risk 40, exposure 40%, reserve 25%). One wallet flow: faucet → approve → `openMandate`.
2. **KRIYA decides (0:20):** *Preview AI decision* shows Claude's allocation, rationale and per-strategy analysis. Then run the CRE workflow (or *Run autonomous loop*) to execute **B 40 · A 35 · Reserve 25** onchain.
3. **Constraint layer (1:00):** *Guardrail test* submits an unsafe 60% allocation from the agent key. The tx **reverts onchain** with `ExposureExceeded`, and the explorer link proves it.
4. **Change reality (1:30):** *Spike Strategy B risk → 48*. The dashboard flags **⚠ MANDATE AT RISK** (external signal, unverified).
5. **Autonomous rebalance (2:00):** run CRE again. Logs show VERIFY (risk report onchain) → DETECT → DECIDE (Claude) → CONSTRAIN → EXECUTE.
6. **Final state (2:30):** A 40 · C 35 · Reserve 25, risk 14/40, mandate **✓ SAFE**, every step in the activity log with tx hashes.

## Security model

- The AI holds no keys and never controls funds. Its output is schema-constrained JSON, validated offchain, validated in CRE, and validated onchain.
- The agent key can only call `executeAllocation`, which runs the same checks as CRE reports. Funds can only move between the vault and allowlisted strategies.
- Only the configured Keystone forwarder can deliver reports. Workflow ID/owner checks can be enabled via `ReceiverTemplate` setters.
- User override: pause the mandate (`setActive(false)`), `emergencyExit()`, and `withdraw()`. Owner-level emergency pause: `KriyaExecutor.setPaused`.
- Limits enforced: per-strategy exposure caps, per-strategy and portfolio risk caps, minimum liquidity reserve, drawdown floor vs high-water mark, strategy allowlist, auto-rebalance opt-in.
