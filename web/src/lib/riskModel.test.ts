import { test } from "node:test";
import assert from "node:assert/strict";
import { kindOf, scoreAll, scoreStrategy, stressProbability, type MarketInputs } from "./riskModel";

const A = { address: "0xa", name: "Strategy A - Stable Lending", base: 21 };
const B = { address: "0xb", name: "Strategy B - BNB/USDT LP Yield", base: 34 };
const C = { address: "0xc", name: "Strategy C - Tokenized T-Bill (RWA)", base: 15 };

const calm: MarketInputs = {
  bnb: { price: 650, change24h: 0.4, change7d: 1.2, source: "CoinMarketCap" },
  fearGreed: 55,
  stables: [
    { symbol: "USDT", price: 1.0002, source: "Atlas" },
    { symbol: "USDC", price: 0.9999, source: "Atlas" },
  ],
  atlasBnb: 650.5,
};

test("strategy kinds are inferred from names, including legacy names", () => {
  assert.equal(kindOf(A.name), "lending");
  assert.equal(kindOf(B.name), "lp");
  assert.equal(kindOf(C.name), "tbill");
  assert.equal(kindOf("Strategy B - LP Yield"), "lp");
  assert.equal(kindOf("Strategy C - T-Bill Vault"), "tbill");
});

test("calm market keeps every strategy near its base risk", () => {
  const [a, b, c] = scoreAll([A, B, C], calm);
  assert.equal(a.risk, 21);
  assert.ok(b.risk <= 35, `B ${b.risk}`);
  assert.equal(c.risk, 15);
});

test("BNB volatility pushes the LP strategy over a max-risk-40 mandate", () => {
  const b = scoreStrategy(B, { ...calm, bnb: { price: 590, change24h: -6.5, change7d: -9, source: "CoinMarketCap" } });
  assert.equal(b.factors.find((f) => f.name === "BNB volatility")?.points, 14); // 9.75 + 4.5 → 14
  assert.ok(b.risk > 40);
});

test("a stablecoin depeg hits lending fully and T-bills by half", () => {
  const m = { ...calm, stables: [{ symbol: "USDT", price: 0.985, source: "Atlas" as const }] };
  const a = scoreStrategy(A, m);
  const c = scoreStrategy(C, m);
  assert.equal(a.risk, 21 + 30);
  assert.equal(c.risk, 15 + 15);
  assert.equal(a.factors[0].source, "Atlas");
});

test("Cournot stress probability adds a forward-looking premium to LP only", () => {
  const m = { ...calm, cournot: { claim: "BNB below $500 by Dec 31", probability: 0.68, direction: "stress" as const } };
  const b = scoreStrategy(B, m);
  assert.equal(b.factors.find((f) => f.source === "Cournot")?.points, 12); // (0.68-0.2)*25
  assert.equal(scoreStrategy(A, m).risk, 21);
  // a "relief" claim is inverted: 90% relief = 10% stress = no premium
  assert.equal(stressProbability({ claim: "x", probability: 0.9, direction: "relief" }).toFixed(2), "0.10");
});

test("Atlas vs CMC disagreement above 2% is flagged", () => {
  const b = scoreStrategy(B, { ...calm, atlasBnb: 670 });
  assert.ok(b.factors.some((f) => f.name === "Oracle disagreement"));
});

test("scores are clamped and output order is deterministic", () => {
  const extreme: MarketInputs = {
    bnb: { price: 300, change24h: -40, change7d: -60, source: "CoinMarketCap" },
    fearGreed: 5,
    stables: [{ symbol: "USDT", price: 0.8, source: "CoinMarketCap" }],
    cournot: { claim: "crash", probability: 1, direction: "stress" },
  };
  const out = scoreAll([C, B, A], extreme);
  assert.deepEqual(out.map((s) => s.address), ["0xa", "0xb", "0xc"]);
  assert.ok(out.every((s) => s.risk <= 100 && s.risk >= 0));
});
