// KRIYA Market Risk Model (pure, deterministic, unit-tested).
// Turns live market data into a verified risk score per strategy:
//   CoinMarketCap  → BNB volatility, Fear & Greed regime, stablecoin prices
//   Atlas Oracle   → onchain stablecoin + BNB prices (preferred over CMC; cross-checked against it)
//   Cournot        → probability of a market-stress event, as a forward-looking risk premium
// The output replaces the demo risk feed, is verified onchain by Chainlink CRE (or the keeper), and
// drives the mandate check that triggers rebalances. Same inputs → same scores on every node.

export type StrategyKind = "lending" | "lp" | "tbill" | "other";

export type MarketInputs = {
  bnb?: { price: number; change24h: number; change7d: number; source: "CoinMarketCap" };
  fearGreed?: number | null;
  /** Stablecoin USD prices: Atlas (onchain) preferred, CMC as fallback. */
  stables: { symbol: string; price: number; source: "Atlas" | "CoinMarketCap" }[];
  /** BNB/USD from an Atlas onchain feed, cross-checked against CMC. */
  atlasBnb?: number | null;
  cournot?: { claim: string; probability: number; direction: "stress" | "relief" } | null;
};

export type Factor = { name: string; points: number; detail: string; source: string };
export type StrategyRisk = { address: string; name: string; kind: StrategyKind; base: number; risk: number; factors: Factor[] };

export const kindOf = (name: string): StrategyKind => {
  const n = name.toLowerCase();
  if (n.includes("t-bill") || n.includes("tbill") || n.includes("treasury")) return "tbill";
  if (n.includes("lp")) return "lp";
  if (n.includes("lending") || n.includes("stable")) return "lending";
  return "other";
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 100) / 100;

/** Largest stablecoin deviation from $1, in percent. */
export function depegPct(stables: MarketInputs["stables"]): { pct: number; worst?: MarketInputs["stables"][number] } {
  let worst: MarketInputs["stables"][number] | undefined;
  let pct = 0;
  for (const s of stables) {
    const d = Math.abs(s.price - 1) * 100;
    if (d > pct) {
      pct = d;
      worst = s;
    }
  }
  return { pct, worst };
}

/** Probability that the market-stress scenario happens (a "relief" claim is inverted). */
export const stressProbability = (c: NonNullable<MarketInputs["cournot"]>) => (c.direction === "stress" ? c.probability : 1 - c.probability);

export function scoreStrategy(s: { address: string; name: string; base: number }, m: MarketInputs): StrategyRisk {
  const kind = kindOf(s.name);
  const factors: Factor[] = [];
  const add = (f: Factor) => f.points !== 0 && factors.push(f);
  const fg = m.fearGreed ?? null;
  const dep = depegPct(m.stables);

  if (kind === "lending" || kind === "tbill") {
    // Collateral/settlement in stablecoins: a depeg is direct principal risk (halved for T-bills, which settle in USDC only).
    const full = Math.min(30, Math.round(dep.pct * 20));
    const pts = kind === "lending" ? full : Math.round(full / 2);
    if (dep.worst) {
      add({ name: "Stablecoin peg", points: pts, detail: `${dep.worst.symbol} at $${dep.worst.price.toFixed(4)} (${r1(dep.pct)}% off peg)`, source: dep.worst.source });
    }
  }

  if (kind === "lending" && fg !== null && fg <= 20) {
    add({ name: "Market regime", points: 3, detail: `Fear & Greed ${fg} (extreme fear): withdrawal pressure`, source: "CoinMarketCap" });
  }

  if (kind === "lp") {
    if (m.bnb) {
      const vol = Math.abs(m.bnb.change24h) * 1.5 + Math.abs(m.bnb.change7d) * 0.5;
      add({
        name: "BNB volatility",
        points: Math.min(25, Math.round(vol)),
        detail: `BNB ${m.bnb.change24h >= 0 ? "+" : ""}${r1(m.bnb.change24h)}% 24h, ${m.bnb.change7d >= 0 ? "+" : ""}${r1(m.bnb.change7d)}% 7d (impermanent-loss exposure)`,
        source: "CoinMarketCap",
      });
      if (m.atlasBnb) {
        const gap = (Math.abs(m.atlasBnb - m.bnb.price) / m.bnb.price) * 100;
        if (gap > 2) add({ name: "Oracle disagreement", points: 5, detail: `Atlas $${m.atlasBnb.toFixed(2)} vs CMC $${m.bnb.price.toFixed(2)} (${r1(gap)}% apart)`, source: "Atlas + CoinMarketCap" });
      }
    }
    if (fg !== null && fg >= 80) add({ name: "Market regime", points: 3, detail: `Fear & Greed ${fg} (extreme greed): reversal risk`, source: "CoinMarketCap" });
    if (fg !== null && fg <= 20) add({ name: "Market regime", points: 5, detail: `Fear & Greed ${fg} (extreme fear): liquidity flight`, source: "CoinMarketCap" });
    if (m.cournot) {
      const p = stressProbability(m.cournot);
      add({
        name: "Event risk (forward-looking)",
        points: Math.round(Math.max(0, p - 0.2) * 25),
        detail: `${(p * 100).toFixed(1)}% probability of stress: "${m.cournot.claim}"`,
        source: "Cournot",
      });
    }
  }

  const risk = clamp(s.base + factors.reduce((a, f) => a + f.points, 0), 0, 100);
  return { address: s.address, name: s.name, kind, base: s.base, risk, factors };
}

export function scoreAll(strategies: { address: string; name: string; base: number }[], m: MarketInputs): StrategyRisk[] {
  return [...strategies].sort((a, b) => a.address.localeCompare(b.address)).map((s) => scoreStrategy(s, m));
}

/** One-line regime label for the UI, the agent and Living Brain. */
export function regime(m: MarketInputs): string {
  const parts: string[] = [];
  if (m.bnb) parts.push(`BNB $${m.bnb.price.toFixed(2)} (${m.bnb.change24h >= 0 ? "+" : ""}${r1(m.bnb.change24h)}% 24h)`);
  if (m.fearGreed != null) parts.push(`Fear & Greed ${m.fearGreed}`);
  const dep = depegPct(m.stables);
  if (dep.worst) parts.push(`max stablecoin depeg ${r1(dep.pct)}% (${dep.worst.symbol})`);
  if (m.cournot) parts.push(`stress odds ${(stressProbability(m.cournot) * 100).toFixed(0)}%`);
  return parts.join(" · ") || "no market data";
}
