// KRIYA mandate policy: a dependency-free TypeScript mirror of KriyaExecutor's onchain rules.
// Shared by the web agent and the Chainlink CRE workflow (imported via relative path),
// so every layer — agent, CRE, contract — applies the same constraints.
//
// The contract is the final authority. This mirror lets the agent reject a bad LLM proposal
// before spending gas, and lets CRE verify a proposal before writing a report.

export const BPS = 10_000;
export const RESERVE_RISK = 2;

export type MandateParams = {
  maxRisk: number;
  maxExposureBps: number;
  maxDrawdownBps: number;
  minReserveBps: number;
  autoRebalance: boolean;
  objective: string;
};

export type StrategyView = {
  address: string;
  name: string;
  apyBps: number;
  risk: number;
};

export type Allocation = { strategy: string; bps: number }[];

export type Validation =
  | { ok: true; portfolioRisk: number; reserveBps: number; expectedApyBps: number }
  | { ok: false; error: string; detail: string };

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function validateAllocation(
  params: MandateParams,
  allowed: string[],
  strategies: StrategyView[],
  allocation: Allocation,
  active = true,
): Validation {
  if (!active) return { ok: false, error: "MandateInactive", detail: "Mandate is paused by the user" };
  let total = 0;
  let weighted = 0;
  let apy = 0;
  const seen = new Set<string>();
  for (const { strategy, bps } of allocation) {
    if (!Number.isInteger(bps) || bps < 0) return { ok: false, error: "InvalidBps", detail: `${bps}` };
    const key = strategy.toLowerCase();
    if (seen.has(key)) return { ok: false, error: "DuplicateStrategy", detail: strategy };
    seen.add(key);
    const s = strategies.find((x) => eq(x.address, strategy));
    if (!s || !allowed.some((a) => eq(a, strategy))) {
      return { ok: false, error: "StrategyNotAllowed", detail: strategy };
    }
    if (bps > params.maxExposureBps) {
      return {
        ok: false,
        error: "ExposureExceeded",
        detail: `${s.name}: ${bps / 100}% > max ${params.maxExposureBps / 100}%`,
      };
    }
    if (bps > 0 && s.risk > params.maxRisk) {
      return { ok: false, error: "StrategyRiskExceeded", detail: `${s.name}: risk ${s.risk} > max ${params.maxRisk}` };
    }
    total += bps;
    weighted += bps * s.risk;
    apy += bps * s.apyBps;
  }
  if (total > BPS) return { ok: false, error: "AllocationOverflow", detail: `${total} bps` };
  const reserveBps = BPS - total;
  if (reserveBps < params.minReserveBps) {
    return {
      ok: false,
      error: "ReserveBelowMinimum",
      detail: `reserve ${reserveBps / 100}% < min ${params.minReserveBps / 100}%`,
    };
  }
  weighted += reserveBps * RESERVE_RISK;
  const portfolioRisk = Math.floor(weighted / BPS);
  if (portfolioRisk > params.maxRisk) {
    return { ok: false, error: "PortfolioRiskExceeded", detail: `${portfolioRisk} > ${params.maxRisk}` };
  }
  return { ok: true, portfolioRisk, reserveBps, expectedApyBps: Math.floor(apy / BPS) };
}

export type Health = {
  totalValue: bigint;
  portfolioRisk: number;
  maxHeldRisk: number;
  maxExposureBps: number;
  reserveBps: number;
  allocated: boolean;
  violated: boolean;
  reasons: string[];
};

/** Mandate health for current positions under a given (possibly freshly verified) risk view. */
export function evaluateHealth(
  params: MandateParams,
  allowed: string[],
  strategies: StrategyView[],
  positions: { strategy: string; amount: bigint }[],
  idle: bigint,
): Health {
  let total = idle;
  for (const p of positions) total += p.amount;
  const h: Health = {
    totalValue: total,
    portfolioRisk: 0,
    maxHeldRisk: 0,
    maxExposureBps: 0,
    reserveBps: 0,
    allocated: false,
    violated: false,
    reasons: [],
  };
  if (total === 0n) return h;
  let weighted = idle * BigInt(RESERVE_RISK);
  for (const p of positions) {
    if (p.amount === 0n) continue;
    h.allocated = true;
    const s = strategies.find((x) => eq(x.address, p.strategy));
    const risk = s?.risk ?? 100;
    weighted += p.amount * BigInt(risk);
    h.maxHeldRisk = Math.max(h.maxHeldRisk, risk);
    const share = Number((p.amount * BigInt(BPS)) / total);
    h.maxExposureBps = Math.max(h.maxExposureBps, share);
    if (risk > params.maxRisk) {
      h.violated = true;
      h.reasons.push(`${s?.name ?? p.strategy} risk ${risk} exceeds mandate max ${params.maxRisk}`);
    }
    if (!allowed.some((a) => eq(a, p.strategy))) {
      h.violated = true;
      h.reasons.push(`${s?.name ?? p.strategy} is no longer an allowed strategy`);
    }
  }
  h.portfolioRisk = Number(weighted / total);
  h.reserveBps = Number((idle * BigInt(BPS)) / total);
  if (h.portfolioRisk > params.maxRisk) {
    h.violated = true;
    h.reasons.push(`portfolio risk ${h.portfolioRisk} exceeds max ${params.maxRisk}`);
  }
  if (h.maxExposureBps > params.maxExposureBps) {
    h.violated = true;
    h.reasons.push(`exposure ${h.maxExposureBps / 100}% exceeds max ${params.maxExposureBps / 100}%`);
  }
  return h;
}

/**
 * Deterministic optimizer: the transparent baseline and the safety fallback for the LLM.
 * Keeps the mandated reserve, then fills eligible strategies (risk within mandate) in order of
 * yield, each up to the exposure cap, while portfolio risk stays within the mandate.
 */
export function optimizeAllocation(
  params: MandateParams,
  allowed: string[],
  strategies: StrategyView[],
): Allocation {
  const eligible = strategies
    .filter((s) => allowed.some((a) => eq(a, s.address)) && s.risk <= params.maxRisk)
    .sort((a, b) => b.apyBps - a.apyBps || a.risk - b.risk);
  let budget = BPS - params.minReserveBps;
  const out: Allocation = [];
  for (const s of eligible) {
    if (budget <= 0) break;
    let bps = Math.min(params.maxExposureBps, budget);
    // shrink in 5% steps until the portfolio stays within the risk limit
    while (bps > 0) {
      const v = validateAllocation(params, allowed, strategies, [...out, { strategy: s.address, bps }]);
      if (v.ok || (v.error !== "PortfolioRiskExceeded" && v.error !== "ReserveBelowMinimum")) break;
      bps -= 500;
    }
    if (bps <= 0) continue;
    out.push({ strategy: s.address, bps });
    budget -= bps;
  }
  return out;
}
