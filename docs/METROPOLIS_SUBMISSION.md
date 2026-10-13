# KRIYA — Monad Metropolis submission text

**Track:** Onchain Finance & Trading · **Bounty:** Chainlink — Best workflow with CRE

## Links
- Live app (Monad testnet): https://kriya-monad.vercel.app
- Demo mandate view: https://kriya-monad.vercel.app/?view=0x09855cE865D094F6c2F2B5A13F64FC6F82b3B4C7
- GitHub (public, MIT): https://github.com/Saurabhnage/kriya
- Pitch deck: https://drive.google.com/file/d/1Wi8N8-hT4ULiaE047UMXxihiuMH6-Q26/view?usp=sharing
- Demo video: <add link>

## One-liner
Stop programming transactions. Start programming financial objectives. KRIYA turns a goal plus hard limits into a mandate that an AI agent manages, Chainlink CRE verifies and executes, and Monad smart contracts enforce.

## Description
KRIYA is an autonomous capital protocol. A user doesn't sign swaps or rebalances. They program a mandate: an objective ("maximize risk-adjusted yield") and hard constraints (max risk, max exposure per strategy, min reserve, max drawdown). From then on a loop runs:

1. **Observe:** a Chainlink CRE workflow reads an external risk feed (HTTP, consensus) and the onchain state of every mandate.
2. **Verify:** changed risk scores are written onchain as a signed CRE report (`KriyaExecutor.onReport` → strategy registry).
3. **Detect:** every mandate is re-evaluated against the verified risk view.
4. **Decide:** an AI agent (Claude) proposes a typed allocation, with a deterministic optimizer as fallback.
5. **Constrain:** the same policy engine is compiled into the CRE WASM and re-checks the proposal.
6. **Execute:** a signed rebalance report moves funds. The contracts check the mandate again, so anything outside it reverts.

The thesis is that AI proposes, rules constrain, verifiable infrastructure verifies and smart contracts enforce. Even a wrong or malicious agent cannot move funds outside the user's mandate.

## How it uses Monad
- All six contracts (vault, mandate, executor/CRE receiver, strategy registry, test USDC and three strategy vaults) are deployed on Monad testnet (chain 10143). The full story has run there end to end, and every step is onchain (tx list below).
- **Speed matters for an autonomous risk loop.** In our run the verified risk spike and the rebalance that answered it landed 16 blocks (~6 s) apart, so the mandate spent almost no time outside its limits.
- **Cheap execution makes onchain enforcement viable.** Each allocation re-checks exposure, per-strategy risk, portfolio risk, reserve and drawdown in Solidity. On Monad that costs fractions of a cent, which lets small mandates rebalance often.
- **EVM compatibility.** The same Solidity, 23 Foundry tests (including fuzz properties) and the same Chainlink CRE workflow run unchanged. The CRE CLI targets `monad-testnet` natively.
- **Built for the RPC.** Monad's public RPC caps `eth_getLogs` at 100 blocks, so the app keeps an incremental event-log index (cursor plus stored logs in Redis). After a one-time backfill the dashboard has full history and each poll reads only new blocks. It can also plug into Envio HyperRPC via `LOGS_RPC_URL`.

## Chainlink CRE bounty
- Workflow: `cre/kriya-workflow/main.ts` (TypeScript → WASM). It uses a cron trigger, HTTPClient with `consensusIdenticalAggregation`, EVMClient `callContract` and `writeReport`, and `runtime.report`.
- Receiver: `KriyaExecutor` extends Chainlink's `ReceiverTemplate`, and only the forwarder can call `onReport`. Executions are logged with `source = CRE`.
- The workflow runs a full decision-to-execution loop, not a single price push. It covers external data, onchain verification, an AI decision, an in-WASM policy check and onchain execution with a second, onchain policy check.
- Broadcast simulations on Monad testnet (CLI v1.38, `monad-testnet` forwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192`):
  - Run 1, first allocation: [0x1aacc62c…4079](https://testnet.monadexplorer.com/tx/0x1aacc62c5cc1f8e6a7449a271477406b4ffa383e475848a733129cc18a414079)
  - Run 2, VERIFY B 34 → 48: [0x4789f3eb…97de](https://testnet.monadexplorer.com/tx/0x4789f3eba6f41ebf39320651474d8be54bdb6e5b2c473abdbac4a1fa691997de)
  - Run 2, EXECUTE rebalance: [0x58557a0a…7d0b](https://testnet.monadexplorer.com/tx/0x58557a0a88875b078d240543b88f6fc80d81d6a3df1aee997e328d8565e37d0b)
- Evidence and logs: https://github.com/Saurabhnage/kriya/blob/main/docs/CRE_SIMULATION.md

## Contracts (Monad testnet, 10143)
| Contract | Address |
| --- | --- |
| KriyaExecutor (CRE receiver) | 0x9c5f1A2326Fa1C16e04Ecf32C60091150161656A |
| KriyaVault | 0xd167B393646E39A01bB14A4e0C53A96940C249ee |
| KriyaMandate | 0x97FD1b5af7622377744C8c2F44F4fF3A04a52073 |
| KriyaStrategyRegistry | 0xadAE9Abccf4fE599405C39bC19A4686566dEd7b6 |
| Test USDC | 0x17Be8BA91d0f331B198eFe73Dd272f9C492d471D |

## Demo transactions (Monad testnet)
| Step | Tx |
| --- | --- |
| Open $1,000 mandate | 0x78b36c7e962407dd964d52a683bea2c350039e6a800507e1938d072d51d38fa6 |
| CRE first allocation | 0x1aacc62c5cc1f8e6a7449a271477406b4ffa383e475848a733129cc18a414079 |
| Guardrail: unsafe 60% proposal reverted (`ExposureExceeded`) | 0xe8c15294f562bb813e5a439a74830733cfb73b42d86b1c3be144e59016549466 |
| CRE verify risk B 34 → 48 | 0x4789f3eba6f41ebf39320651474d8be54bdb6e5b2c473abdbac4a1fa691997de |
| CRE rebalance out of B | 0x58557a0a88875b078d240543b88f6fc80d81d6a3df1aee997e328d8565e37d0b |

## Roadmap
Next: cross-chain mandates via Chainlink CCIP. One mandate spans several chains (for example Monad and Ethereum): CRE decides the allocation, CCIP moves the capital and carries the execution instruction, and each chain enforces the mandate onchain before funds move.

## Tech stack
Solidity 0.8.26 · Foundry · OpenZeppelin · Chainlink CRE TypeScript SDK · Next.js 16 · React 19 · wagmi/viem · Anthropic Claude API · Upstash Redis · Vercel · Monad testnet

## Team
Solo builder: Saurabh Nage

## AI disclosure
Built with AI coding assistance (Claude Code). At runtime, the Claude API powers the DECIDE step. See the README's "AI disclosure" section.
