// End-to-end test of the KRIYA Market Risk Engine (CoinMarketCap + Atlas + Cournot + Living Brain)
// against a local Anvil chain. Live APIs are replaced by a local fixture server whose market can be
// switched between "calm" and "volatile" (MOCK_MODE_FILE); Atlas feeds are AggregatorV3-style
// contracts deployed on Anvil. Assertions check onchain state.
//
//   1. anvil, deploy, `npm run sync`, deploy two AggregatorV3 feeds (USDT/USD, BNB/USD)
//   2. start the fixture server (CMC + Cournot) and the app with CMC_API_BASE / COURNOT_API_BASE
//      pointing at it and ATLAS_FEED_* set, KRIYA_LLM=off
//   3. node scripts/e2e-market.mjs
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const API = process.env.E2E_API ?? "http://localhost:3001";
const MODE_FILE = process.env.MOCK_MODE_FILE;
const RPC = "http://127.0.0.1:8545";
const dep = JSON.parse(readFileSync(new URL("../../contracts/deployments/31337.json", import.meta.url), "utf8"));
const user = mnemonicToAccount("test test test test test test test test test test test junk", { addressIndex: 6 });
const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
const wallet = createWalletClient({ account: user, chain: foundry, transport: http(RPC) });
const usdcAbi = parseAbi(["function faucet(address,uint256)", "function approve(address,uint256) returns (bool)"]);
const vaultAbi = parseAbi([
  "struct Params { uint16 maxRisk; uint16 maxExposureBps; uint16 maxDrawdownBps; uint16 minReserveBps; bool autoRebalance; string objective; }",
  "function openMandate(uint256 amount, Params params, address[] allowed)",
  "function positionOf(address,address) view returns (uint256)",
]);
const registryAbi = parseAbi(["function getAll() view returns (address[], (string name, uint16 apyBps, uint16 risk, uint64 updatedAt, bool active)[])"]);
const usd = (n) => parseUnits(String(n), 6);

let passed = 0;
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  passed++;
  console.log("ok");
};
const api = async (path, body) => {
  const res = await fetch(API + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};
const runLoop = async () => {
  const res = await fetch(API + "/api/keeper/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: user.address }) });
  return (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
};
const send = async (address, abi, functionName, args) => {
  const r = await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address, abi, functionName, args }) });
  assert.equal(r.status, "success");
};
const onchainRisk = async (addr) => {
  const [addrs, infos] = await pub.readContract({ address: dep.registry, abi: registryAbi, functionName: "getAll" });
  return infos[addrs.findIndex((a) => a.toLowerCase() === addr.toLowerCase())].risk;
};
const score = (intel, addr) => intel.scores.find((s) => s.address.toLowerCase() === addr.toLowerCase());
const setMode = (m) => MODE_FILE && writeFileSync(MODE_FILE, m);

await step("market engine is on with CoinMarketCap and Atlas feeds", async () => {
  setMode("calm");
  await api("/api/risk-feed", { reset: true });
  const { data } = await api("/api/market");
  assert.equal(data.enabled.market, true);
  assert.equal(data.enabled.coinmarketcap, true);
  assert.ok(data.enabled.atlasFeeds.length >= 1);
});

await step("calm market: live scores stay inside a max-risk-40 mandate, Atlas prices stablecoins", async () => {
  const { status, data } = await api("/api/market/refresh", {});
  assert.equal(status, 200, JSON.stringify(data));
  assert.ok(score(data.intel, dep.strategyB).risk <= 40);
  assert.equal(data.intel.atlas.length >= 1, true);
  assert.ok(score(data.intel, dep.strategyA).factors.length === 0 || score(data.intel, dep.strategyA).factors.every((f) => f.points < 5));
  assert.equal(data.feed.source.startsWith("KRIYA Market Risk Engine"), true);
  const ev = (await api("/api/market")).data.evidence;
  assert.ok(ev.cmcCalls.some((c) => c.endpoint.includes("quotes/latest") && c.http === 200));
});

await step("user opens a $1,000 mandate and the loop allocates it", async () => {
  await send(dep.usdc, usdcAbi, "faucet", [user.address, usd(1000)]);
  await send(dep.usdc, usdcAbi, "approve", [dep.vault, usd(1000)]);
  await send(dep.vault, vaultAbi, "openMandate", [
    usd(1000),
    { maxRisk: 40, maxExposureBps: 4000, maxDrawdownBps: 500, minReserveBps: 2500, autoRebalance: true, objective: "Maximize risk-adjusted yield" },
    [dep.strategyA, dep.strategyB, dep.strategyC],
  ]);
  const steps = await runLoop();
  assert.ok(steps.some((s) => s.step === "OBSERVE" && s.detail.includes("Market (CMC + Atlas + Cournot)")), JSON.stringify(steps[0]));
  assert.ok(steps.some((s) => s.step === "EXECUTE" && s.status === "ok"), JSON.stringify(steps));
  assert.equal(await pub.readContract({ address: dep.vault, abi: vaultAbi, functionName: "positionOf", args: [user.address, dep.strategyB] }), usd(400));
});

await step("BNB sells off: CoinMarketCap volatility pushes the LP strategy past the mandate", async () => {
  setMode("volatile");
  const { data } = await api("/api/market/refresh", {});
  const b = score(data.intel, dep.strategyB);
  assert.ok(b.risk > 40, `B ${b.risk}`);
  assert.ok(b.factors.some((f) => f.name === "BNB volatility" && f.source === "CoinMarketCap"));
  const st = (await api(`/api/state?user=${user.address}`)).data;
  assert.equal(st.pending.violated, true);
});

await step("loop verifies the market risk onchain and exits the LP strategy", async () => {
  const steps = await runLoop();
  assert.ok(steps.some((s) => s.step === "VERIFY" && s.txHash), JSON.stringify(steps));
  assert.ok(steps.some((s) => s.step === "EXECUTE" && s.status === "ok"), JSON.stringify(steps));
  assert.ok((await onchainRisk(dep.strategyB)) > 40);
  assert.equal(await pub.readContract({ address: dep.vault, abi: vaultAbi, functionName: "positionOf", args: [user.address, dep.strategyB] }), 0n);
});

await step("Living Brain memory: the second decision recalls the first and the market regime", async () => {
  const st = (await api(`/api/state?user=${user.address}`)).data;
  const mem = st.latestDecision.memory;
  assert.ok(mem, "decision carries memory");
  assert.ok(mem.decisions.length >= 1, JSON.stringify(mem));
  assert.ok(st.latestDecision.market.regime.includes("BNB"));
});

await step("Cournot: resolve + assess adds a forward-looking event-risk premium", async () => {
  const claim = "BNB below $500 before December 31, 2026";
  const r = await api("/api/market/cournot", { action: "resolve", claim });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const id = r.data.markets[0].id;
  const a = await api("/api/market/cournot", { action: "assess", claim, marketIds: [id], direction: "stress" });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.equal(typeof a.data.assessment.probability, "number");
  const f = score(a.data.intel, dep.strategyB).factors.find((x) => x.source === "Cournot");
  assert.ok(f && f.points > 0 && f.detail.includes(claim));
  const m = (await api("/api/market")).data;
  assert.ok(m.cournot.basis, "evidence is stored verbatim");
  assert.ok(m.evidence.cournotProofs.some((p) => p.endpoint === "probability" && p.status === 200));
});

await step("scenario override sticks over live data until reset", async () => {
  await api("/api/risk-feed", { strategy: dep.strategyC, risk: 55 });
  const { data } = await api("/api/market/refresh", {});
  assert.equal(data.feed.risks[dep.strategyC.toLowerCase()], 55);
  await api("/api/risk-feed", { reset: true });
  assert.notEqual((await api("/api/risk-feed")).data.strategies.find((s) => s.address.toLowerCase() === dep.strategyC.toLowerCase()).risk, 55);
});

setMode("calm");
console.log(`\n${passed} market end-to-end checks passed`);
