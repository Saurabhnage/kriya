# Chainlink CRE — simulation evidence

KRIYA's autonomous loop runs as a Chainlink CRE workflow (`cre/kriya-workflow/main.ts`, TypeScript compiled to WASM). It was simulated with the CRE CLI **with `--broadcast`**, so its signed reports were delivered on **Ethereum Sepolia** through the Chainlink `MockKeystoneForwarder` (`0x15fC6ae953E024d975e77382eEeC56A9101f9F88`) into `KriyaExecutor.onReport` (`0x9c5f1A2326Fa1C16e04Ecf32C60091150161656A`).

What one workflow run does:

| Step | CRE capability | What happens |
| --- | --- | --- |
| OBSERVE | HTTP client + `consensusIdenticalAggregation` | Read the external risk feed; read strategies, mandates and positions with EVM `callContract` |
| VERIFY | `runtime.report` + `EVMClient.writeReport` | Changed risk scores → signed report → `KriyaExecutor.onReport` → registry update |
| DETECT | — | Evaluate every active mandate against the verified risk view |
| DECIDE | HTTP POST (single execution via `cacheSettings`) | KRIYA agent (Claude `claude-sonnet-5-5`) returns a typed allocation |
| CONSTRAIN | — | The shared policy (`web/src/lib/policy.ts`, compiled into the WASM) re-validates the proposal |
| EXECUTE | `runtime.report` + `EVMClient.writeReport` | Signed rebalance report → `KriyaExecutor.onReport` → onchain mandate check → funds move |

## 1. Broadcast simulation — 2026-10-07 (writes onchain)

Command (from `cre/`):

```bash
cre workflow simulate kriya-workflow --target staging-settings --non-interactive --trigger-index 0 --broadcast
```

Terminal output (CLI update notices and blank lines omitted):

```text
Initializing...
Loading settings...
Checking RPC connectivity...
Compiling workflow...
✓ Workflow compiled
✓ Simulation limits enabled
  HTTP: req=120kb resp=250kb timeout=10s | ConfHTTP: req=125kb resp=500kb timeout=1m30s | Consensus obs=25kb | ChainWrite report=50kb gas=10000000 | WASM binary=100mb compressed=20mb
  Binary hash: 17c62b43bbee1adc0d03ce99bb9a94244bfb80077a2ee6725a6a2271ff9bd91c
  Config hash: df34a7997ee9973c7fae137e3f35125cfa36f1a0b6a64d307106a0ee4740525f
2026-10-07T16:40:51Z [SIMULATION] Simulator Initialized
2026-10-07T16:40:51Z [SIMULATION] Running trigger trigger=cron-trigger@1.0.0
2026-10-07T16:40:52Z [USER LOG] [OBSERVE] risk feed: 0x5d59be=15, 0xe62be5=48, 0xe92168=21
2026-10-07T16:40:58Z [USER LOG] [VERIFY] risk report written onchain: Strategy B 34->48 tx=0x66deb846f9d9a4d33b2a5a6ff6635a5c1b9692064479274e7eac8cd1498136b9
2026-10-07T16:40:59Z [USER LOG] [DETECT] 0x09855cE865D094F6c2F2B5A13F64FC6F82b3B4C7: MANDATE AT RISK — Strategy B - LP Yield risk 48 exceeds mandate max 40
2026-10-07T16:41:05Z [USER LOG] [DECIDE] llm (claude-sonnet-5-5): 0xE92168=4000, 0x5d59Be=3500 — Strategy B's verified risk of 48 exceeds the mandate max of 40, so its 40% is exited. Strategy A rises to the 40% cap and the rest goes to Strategy C (35%), keeping the 25% USDC reserve.
2026-10-07T16:41:05Z [USER LOG] [CONSTRAIN] passed: portfolio risk 14/40, reserve 25%
2026-10-07T16:41:11Z [USER LOG] [EXECUTE] rebalance written onchain tx=0x2d8a4366bf67a6f5e7a9f7ce6b3aff2556921ba8c22e0c7af91b914a983441d5
✓ Workflow Simulation Result:
"verified Strategy B 34->48 | 0x09855c executed 0x2d8a4366bf67a6f5e7a9f7ce6b3aff2556921ba8c22e0c7af91b914a983441d5"
2026-10-07T16:41:11Z [SIMULATION] Execution finished signal received
2026-10-07T16:41:11Z [SIMULATION] Skipping WorkflowEngineV2
```

### Onchain verification

Both transactions are calls into the Chainlink forwarder, which delivered the reports to `KriyaExecutor.onReport`:

| CRE step | Transaction | Verified onchain |
| --- | --- | --- |
| VERIFY — risk report, Strategy B 34 → 48 | [0x66deb846…36b9](https://sepolia.etherscan.io/tx/0x66deb846f9d9a4d33b2a5a6ff6635a5c1b9692064479274e7eac8cd1498136b9) | status success, `to` = forwarder `0x15fC…9F88`; registry `riskOf(B)` = 48 afterwards |
| EXECUTE — Claude's rebalance A 40 · C 35 · reserve 25 | [0x2d8a4366…41d5](https://sepolia.etherscan.io/tx/0x2d8a4366bf67a6f5e7a9f7ce6b3aff2556921ba8c22e0c7af91b914a983441d5) | status success, `to` = forwarder; vault positions A 400 / B 0 / C 350 USDC, idle 250; `AllocationExecuted` event `source = 1` (**CRE**) |

### Follow-up broadcast run (same day) — restoring baseline risk

```text
[USER LOG] [OBSERVE] risk feed: 0x5d59be=15, 0xe62be5=34, 0xe92168=21
[USER LOG] [VERIFY] risk report written onchain: Strategy B 48->34 tx=0xd4fc8b94dba0810391055ffa6fee49c8034c50d26f54b8c66234ba2fe46db59f
[USER LOG] [DETECT] 0x09855cE865D094F6c2F2B5A13F64FC6F82b3B4C7: mandate safe (risk 14/40)
```

Transaction: [0xd4fc8b94…b59f](https://sepolia.etherscan.io/tx/0xd4fc8b94dba0810391055ffa6fee49c8034c50d26f54b8c66234ba2fe46db59f) — a safe mandate is detected and **no** rebalance is written.

## 2. Simulation — 2026-10-08 (dry run, no broadcast)

Full, unedited output (except CLI update notices): [`docs/cre/simulation-readonly-2026-10-08.log`](cre/simulation-readonly-2026-10-08.log). Without `--broadcast` the simulator dry-runs writes (tx hash `0x00…00`). It shows the workflow evaluating two live mandates in one run: one at risk (Claude decides, the policy check passes) and one safe (no action).

## Reproduce

```bash
cre login
cd cre/kriya-workflow && bun install
cd .. && cp .env.example .env   # funded Sepolia key in CRE_ETH_PRIVATE_KEY (no 0x)
cre workflow simulate kriya-workflow --target staging-settings --non-interactive --trigger-index 0 --broadcast
```

The workflow config (`cre/kriya-workflow/config.staging.json`) points at the live KRIYA agent (`https://kriya-beta.vercel.app`) and the Sepolia deployment in `contracts/deployments/11155111.json`.
