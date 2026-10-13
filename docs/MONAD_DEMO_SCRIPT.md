# KRIYA — Monad demo video script (~2:15)

Casual and simple. Each scene says what's on screen, then what to say.

**Open:** https://kriya-monad.vercel.app/?view=0x09855cE865D094F6c2F2B5A13F64FC6F82b3B4C7

---

### 1. Landing page (0:00–0:12)
*Screen: kriya-monad.vercel.app home page.*

> Hi, I'm Saurabh, and this is KRIYA, an autonomous capital protocol, live on Monad testnet. The idea is simple: stop programming transactions, start programming financial objectives.

### 2. The mandate (0:12–0:30)
*Screen: demo dashboard, point at the Mandate card.*

> Here's a live demo mandate: a thousand test USDC with one objective, maximize risk-adjusted yield, and hard limits. Max risk forty, at most forty percent in any one strategy, and at least twenty-five percent kept in reserve. Those limits are enforced by a smart contract on Monad.

### 3. The loop (0:30–0:50)
*Screen: point at the Autonomous Loop panel, steps 1 to 6.*

> KRIYA runs one loop. Chainlink CRE observes an external risk feed, verifies changes onchain, and detects mandates at risk. Claude decides a new allocation, the policy engine checks it inside the CRE workflow, and CRE executes it onchain.

### 4. What happened (0:50–1:10)
*Screen: Activity feed, the risk-increase and "Allocation #2 executed via Chainlink CRE" items.*

> Here's what happened. The risk feed flagged Strategy B, jumping from thirty-four to forty-eight, above this mandate's limit. CRE wrote that verified risk onchain, and just sixteen blocks later, about five seconds on Monad, it moved the money out of B and into A and C, keeping the reserve.

### 5. The guardrail (1:10–1:25)
*Screen: the red "Guardrail test … REVERTED" item.*

> And this is the important part. When the agent tried an unsafe allocation, sixty percent into one strategy, the contract reverted it. The AI proposes, but the contract has the final say.

### 6. Claude's decision, live (1:25–1:45)
*Screen: click **Preview decision** and wait for the Latest Decision card.*

> Decisions come from Claude. Here's a live one: it sees B is over the risk limit, keeps A and C, and explains why. If Claude is unavailable, a deterministic optimizer takes over, and both go through the same checks.

### 7. Onchain proof (1:45–1:58)
*Screen: click the `0x5855…7d0b` link on the "Allocation #2 executed via Chainlink CRE" item. It opens the Monad explorer (complete the browser check if one appears).*

> Every step is a real Monad transaction. This is the CRE rebalance, delivered through the Chainlink forwarder into KRIYA's executor.

### 8. Why Monad + close (1:58–2:15)
*Screen: back to the dashboard.*

> Why Monad? An autonomous risk loop needs fast, cheap blocks, so a mandate spends almost no time outside its limits, and checking every rule onchain costs fractions of a cent. Next up: cross-chain mandates with Chainlink CCIP. It's all open source on GitHub. Thanks for watching!
