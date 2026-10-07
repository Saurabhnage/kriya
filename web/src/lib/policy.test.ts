// Unit tests for the shared mandate policy. These mirror the Foundry tests in
// contracts/test/Kriya.t.sol so the TypeScript copy and KriyaExecutor cannot drift apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth, optimizeAllocation, validateAllocation, type MandateParams, type StrategyView } from "./policy";

const params: MandateParams = {
  maxRisk: 40,
  maxExposureBps: 4000,
  maxDrawdownBps: 500,
  minReserveBps: 2500,
  autoRebalance: true,
  objective: "Maximize risk-adjusted yield",
};
const A = "0xAaAa000000000000000000000000000000000001";
const B = "0xBbBb000000000000000000000000000000000002";
const C = "0xCcCc000000000000000000000000000000000003";
const universe = (riskB = 34): StrategyView[] => [
  { address: A, name: "Strategy A - Stable Lending", apyBps: 840, risk: 21 },
  { address: B, name: "Strategy B - LP Yield", apyBps: 1120, risk: riskB },
  { address: C, name: "Strategy C - T-Bill Vault", apyBps: 680, risk: 15 },
];
const all = [A, B, C];

test("valid demo allocation passes with the contract's portfolio risk", () => {
  const v = validateAllocation(params, all, universe(), [{ strategy: A, bps: 3500 }, { strategy: B, bps: 4000 }]);
  assert.deepEqual(v, { ok: true, portfolioRisk: 21, reserveBps: 2500, expectedApyBps: 742 });
});

test("exposure above the cap is rejected", () => {
  const v = validateAllocation(params, all, universe(), [{ strategy: A, bps: 1500 }, { strategy: B, bps: 6000 }]);
  assert.equal(v.ok, false);
  assert.equal(!v.ok && v.error, "ExposureExceeded");
});

test("reserve below the minimum is rejected", () => {
  const v = validateAllocation(params, all, universe(), [{ strategy: A, bps: 4000 }, { strategy: B, bps: 4000 }]);
  assert.equal(!v.ok && v.error, "ReserveBelowMinimum");
});

test("holding a strategy above max risk is rejected, but a 0 bps entry is fine", () => {
  const held = validateAllocation(params, all, universe(48), [{ strategy: A, bps: 3500 }, { strategy: B, bps: 2000 }]);
  assert.equal(!held.ok && held.error, "StrategyRiskExceeded");
  const zero = validateAllocation(params, all, universe(48), [{ strategy: A, bps: 3500 }, { strategy: B, bps: 0 }]);
  assert.equal(zero.ok, true);
});

test("strategies outside the mandate's allowlist are rejected", () => {
  const v = validateAllocation(params, [A], universe(), [{ strategy: A, bps: 3500 }, { strategy: C, bps: 3000 }]);
  assert.equal(!v.ok && v.error, "StrategyNotAllowed");
});

test("duplicates, fractional and negative bps, overflow and paused mandates are rejected", () => {
  assert.equal((validateAllocation(params, all, universe(), [{ strategy: A, bps: 2000 }, { strategy: A.toLowerCase(), bps: 2000 }]) as { error: string }).error, "DuplicateStrategy");
  assert.equal((validateAllocation(params, all, universe(), [{ strategy: A, bps: 10.5 }]) as { error: string }).error, "InvalidBps");
  assert.equal((validateAllocation(params, all, universe(), [{ strategy: A, bps: -1 }]) as { error: string }).error, "InvalidBps");
  const wide = { ...params, maxExposureBps: 10_000, minReserveBps: 0, maxRisk: 100 };
  assert.equal((validateAllocation(wide, all, universe(), [{ strategy: A, bps: 6000 }, { strategy: B, bps: 6000 }]) as { error: string }).error, "AllocationOverflow");
  assert.equal((validateAllocation(params, all, universe(), [], false) as { error: string }).error, "MandateInactive");
});

test("address matching is case-insensitive", () => {
  const v = validateAllocation(params, all.map((a) => a.toLowerCase()), universe(), [{ strategy: B.toUpperCase().replace("0X", "0x"), bps: 4000 }]);
  assert.equal(v.ok, true);
});

test("an empty allocation keeps everything in reserve", () => {
  assert.deepEqual(validateAllocation(params, all, universe(), []), { ok: true, portfolioRisk: 2, reserveBps: 10000, expectedApyBps: 0 });
});

test("portfolio risk is checked including the reserve (the reserve itself carries risk 2)", () => {
  // Below the reserve's own risk no allocation can pass; KriyaMandate rejects maxRisk < 2 for this reason.
  const v = validateAllocation({ ...params, maxRisk: 1, minReserveBps: 0 }, all, universe(), []);
  assert.equal(!v.ok && v.error, "PortfolioRiskExceeded");
  // At the limit, a portfolio whose weighted risk equals maxRisk passes.
  const flat = universe().map((s) => ({ ...s, risk: 30 }));
  const ok = validateAllocation({ ...params, maxRisk: 30, maxExposureBps: 10_000, minReserveBps: 0 }, all, flat, [{ strategy: A, bps: 10_000 }]);
  assert.deepEqual(ok, { ok: true, portfolioRisk: 30, reserveBps: 0, expectedApyBps: 840 });
});

test("optimizer reproduces the demo: B 40 · A 35 · reserve 25, then A 40 · C 35 after B spikes", () => {
  assert.deepEqual(optimizeAllocation(params, all, universe()), [{ strategy: B, bps: 4000 }, { strategy: A, bps: 3500 }]);
  assert.deepEqual(optimizeAllocation(params, all, universe(48)), [{ strategy: A, bps: 4000 }, { strategy: C, bps: 3500 }]);
});

test("optimizer output always validates, across many random mandates", () => {
  let seed = 7;
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
  for (let i = 0; i < 2000; i++) {
    const p: MandateParams = { ...params, maxRisk: 5 + rnd(96), maxExposureBps: 500 + rnd(9501), minReserveBps: rnd(9001) };
    const u = universe().map((s) => ({ ...s, risk: rnd(101), apyBps: rnd(3000) }));
    const allowed = all.filter(() => rnd(4) > 0);
    const alloc = optimizeAllocation(p, allowed, u);
    const v = validateAllocation(p, allowed, u, alloc);
    assert.equal(v.ok, true, `optimizer produced an invalid allocation: ${JSON.stringify({ p, u, allowed, alloc, v })}`);
  }
});

test("health flags a breached strategy, exposure drift and portfolio risk", () => {
  const positions = [{ strategy: A, amount: 350n }, { strategy: B, amount: 400n }];
  const safe = evaluateHealth(params, all, universe(), positions, 250n);
  assert.equal(safe.violated, false);
  assert.equal(safe.portfolioRisk, 21);
  const spiked = evaluateHealth(params, all, universe(48), positions, 250n);
  assert.equal(spiked.violated, true);
  assert.match(spiked.reasons[0], /risk 48 exceeds mandate max 40/);
  const drift = evaluateHealth(params, all, universe(), [{ strategy: A, amount: 600n }], 400n);
  assert.equal(drift.violated, true);
  assert.ok(drift.reasons.some((r) => r.includes("exposure")));
  const empty = evaluateHealth(params, all, universe(), [], 0n);
  assert.equal(empty.totalValue, 0n);
  assert.equal(empty.violated, false);
});
