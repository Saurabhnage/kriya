# KRIYA: one-page write-up (CoinMarketCap × Atlas Challenge, BNB Bangkok 2026)

**Team:** Saurabh Nage · X @saurabhnage624 · `TODO email / Telegram`
**Repo:** https://github.com/Saurabhnage/kriya (branch `bnb-bangkok`) · **Demo video:** `TODO`

## Problem and audience

DeFi and RWA holders are asked to manage transactions, but what they actually have are *objectives and limits* ("best yield, never more than 40% in one place, never above risk 40"). Agents that act for them today either ignore real market conditions or can't be trusted with funds. KRIYA is for retail and treasury users, and for the wallets and RWA platforms that serve them.

## What KRIYA does

The user programs a **mandate** onchain (objective plus hard limits). Each run of the loop works like this:

1. The **KRIYA Market Risk Engine** turns live CoinMarketCap and Atlas data (and Cournot event odds) into a risk score for every strategy, including a tokenized T-bill (RWA) vault.
2. Chainlink CRE (or the keeper) verifies those scores **onchain on BNB Chain**.
3. Claude proposes an allocation, with memory of past regimes from Living Brain.
4. **KriyaExecutor** enforces the mandate onchain: anything outside the limits reverts.

## Endpoints and feeds used, and why

| Source | Endpoint / feed | Why |
|---|---|---|
| CoinMarketCap | `/v2/cryptocurrency/quotes/latest` (BNB, USDT, USDC) | BNB 24h/7d moves drive the LP strategy's volatility risk (impermanent-loss exposure). USDT/USDC quotes are the peg fallback. |
| CoinMarketCap | `/v3/fear-and-greed/latest` | Market regime: extreme fear adds withdrawal and liquidity risk, extreme greed adds reversal risk. |
| Atlas Oracle | AggregatorV3 feeds on BNB Chain: USDT/USD, USDC/USD (`TODO addresses`) | The **onchain** stablecoin peg, the primary source for lending and T-bill (RWA) principal risk. Stale feeds are ignored. |
| Atlas Oracle | BNB/USD (`TODO address`) | Cross-check against CMC: a gap above 2% adds an "oracle disagreement" risk premium. |

**Depth:** these inputs aren't just displayed. They set the verified risk scores that are written onchain and that decide whether capital moves. Example (tested end to end): BNB −6.5% in 24h and −9% over 7d adds +14, taking the LP strategy from 34 to 48. That breaches a max-risk-40 mandate, so the risk is verified onchain and KRIYA exits the LP strategy.

**Verifiability:** CMC usage is in the dashboard's call log (endpoint, HTTP status, credits; `GET /api/market`) and in CMC's own logs for our key. Atlas usage is plain onchain reads from public feed contracts. Keys never reach the frontend or the repository.

## BNB Chain contracts and data

- Network: BNB Chain testnet (97). Contracts: `TODO from contracts/deployments/97.json`
- Market-driven verify tx: `TODO` · rebalance tx: `TODO` · guardrail revert tx: `TODO`

## Safety

- The AI holds no keys and never controls funds. Its output is schema-checked by the policy engine, then by CRE, then by the contract.
- The risk model is deterministic and unit-tested, so every CRE node sees the same scores.
- Rate limits protect gas and API credits. Users can pause the mandate or trigger an emergency exit at any time.

## What we'd build next

Real BNB Chain venues for each strategy (lending, PancakeSwap LP, tokenized T-bill issuers), CMC DEX data for LP pool depth, Atlas RWA feeds for NAV, a production CRE deployment, an audit, and mainnet.
