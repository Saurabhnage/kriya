// End-to-end test of the KRIYA stack against a local Anvil chain.
//
//   1. anvil, then deploy to it (README "Run locally")
//   2. in web/: npm run sync, then start the server on :3001 with
//      NEXT_PUBLIC_CHAIN_ID=31337 KRIYA_LLM=off ADMIN_PRIVATE_KEY=<anvil #0> AGENT_PRIVATE_KEY=<anvil #2>
//      npx next dev -p 3001
//   3. npm run e2e
// CI runs exactly this (.github/workflows/ci.yml).
//
// A fresh Anvil account plays the user (real wallet transactions); the API is driven exactly
// as the dashboard drives it. Every assertion checks onchain state, not API responses alone.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const API = process.env.E2E_API ?? "http://localhost:3001";
const RPC = "http://127.0.0.1:8545";
const dep = JSON.parse(readFileSync(new URL("../../contracts/deployments/31337.json", import.meta.url), "utf8"));
const user = mnemonicToAccount("test test test test test test test test test test test junk", { addressIndex: 5 });

const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
const wallet = createWalletClient({ account: user, chain: foundry, transport: http(RPC) });
const usdcAbi = parseAbi(["function faucet(address,uint256)", "function approve(address,uint256) returns (bool)"]);
const vaultAbi = parseAbi([
  "struct Params { uint16 maxRisk; uint16 maxExposureBps; uint16 maxDrawdownBps; uint16 minReserveBps; bool autoRebalance; string objective; }",
  "function openMandate(uint256 amount, Params params, address[] allowed)",
  "function emergencyExit()",
  "function positionOf(address,address) view returns (uint256)",
  "function idleOf(address) view returns (uint256)",
]);
const mandateAbi = parseAbi(["function isActive(address) view returns (bool)"]);

let passed = 0;
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  passed++;
  console.log("ok");
};
const api = async (path, body) => {
  const res = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
};
const ORDER = ["OBSERVE", "VERIFY", "DETECT", "DECIDE", "CONSTRAIN", "EXECUTE"];
// The keeper streams NDJSON: one step per line as it completes, then {"done":true}.
const runLoop = async (who) => {
  const res = await fetch(API + "/api/keeper/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: who }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /ndjson/);
  const lines = (await res.text()).split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const done = lines.at(-1);
  assert.equal(done.done, true, `stream must end with done: ${JSON.stringify(done)}`);
  const steps = lines.slice(0, -1);
  const idx = steps.map((s) => ORDER.indexOf(s.step)).filter((i) => i >= 0);
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), `steps out of order: ${steps.map((s) => s.step)}`);
  return { status: res.status, data: { steps } };
};
const state = async () => (await api(`/api/state?user=${user.address}`)).data;
const send = async (address, abi, functionName, args = []) => {
  const hash = await wallet.writeContract({ address, abi, functionName, args });
  const r = await pub.waitForTransactionReceipt({ hash });
  assert.equal(r.status, "success", `${functionName} reverted`);
};
const pos = async (s) => pub.readContract({ address: dep.vault, abi: vaultAbi, functionName: "positionOf", args: [user.address, s] });
const idle = async () => pub.readContract({ address: dep.vault, abi: vaultAbi, functionName: "idleOf", args: [user.address] });
const usd = (n) => parseUnits(String(n), 6);

await step("risk feed resets to baseline", async () => {
  const { status } = await api("/api/risk-feed", { reset: true });
  assert.equal(status, 200);
  const feed = (await api("/api/risk-feed")).data.strategies;
  assert.deepEqual(feed.map((s) => s.risk).sort((a, b) => a - b), [15, 21, 34]);
});

await step("state API serves a wallet with no mandate", async () => {
  const { status, data } = await api(`/api/state?user=${user.address}`);
  assert.equal(status, 200);
  assert.equal(data.snapshot.mandate.exists, false);
});

await step("state API rejects a malformed address", async () => {
  assert.equal((await api("/api/state?user=0x123")).status, 400);
});

await step("user opens a $1,000 mandate from their own wallet", async () => {
  await send(dep.usdc, usdcAbi, "faucet", [user.address, usd(1000)]);
  await send(dep.usdc, usdcAbi, "approve", [dep.vault, usd(1000)]);
  await send(dep.vault, vaultAbi, "openMandate", [
    usd(1000),
    { maxRisk: 40, maxExposureBps: 4000, maxDrawdownBps: 500, minReserveBps: 2500, autoRebalance: true, objective: "Maximize risk-adjusted yield" },
    [dep.strategyA, dep.strategyB, dep.strategyC],
  ]);
  assert.equal(await idle(), usd(1000));
});

await step("decision preview returns a valid, mandate-compliant proposal", async () => {
  const { status, data } = await api("/api/agent/propose", { user: user.address, journal: false });
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.validation.ok, true);
  assert.equal(data.validation.reserveBps >= 2500, true);
});

await step("loop allocates idle capital onchain: B 40 · A 35 · reserve 25", async () => {
  const { status, data } = await runLoop(user.address);
  assert.equal(status, 200, JSON.stringify(data));
  assert.ok(data.steps.some((s) => s.step === "EXECUTE" && s.status === "ok"), JSON.stringify(data.steps));
  assert.equal(await pos(dep.strategyB), usd(400));
  assert.equal(await pos(dep.strategyA), usd(350));
  assert.equal(await idle(), usd(250));
  const st = await state();
  assert.equal(st.act, 3, "after allocation the next act is Guard");
  assert.equal(st.lastRun?.source, "AGENT");
  assert.ok(st.lastRun.steps.some((s) => s.step === "EXECUTE" && s.txHash), "lastRun must carry the execution tx");
  assert.equal(st.latestDecision?.validation.ok, true);
  assert.ok(st.riskHistory.some((p) => p.kind === "execution" && p.portfolioRisk === 21));
});

await step("a second loop on a safe mandate changes nothing", async () => {
  const { data } = await runLoop(user.address);
  assert.ok(!data.steps.some((s) => s.step === "EXECUTE"), JSON.stringify(data.steps));
  assert.equal(await pos(dep.strategyB), usd(400));
});

await step("guardrail: an unsafe 60% proposal reverts onchain with ExposureExceeded", async () => {
  const { status, data } = await api("/api/agent/guardrail", { user: user.address });
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.status, "reverted");
  assert.match(data.reason, /ExposureExceeded/);
  assert.equal(await pos(dep.strategyB), usd(400), "revert must leave funds untouched");
  assert.equal((await state()).act, 4, "after the guardrail the next act is Reality");
});

await step("changing reality flags the mandate before anything is written onchain", async () => {
  await api("/api/risk-feed", { strategy: dep.strategyB, risk: 48 });
  const { data } = await api(`/api/state?user=${user.address}`);
  assert.equal(data.snapshot.health.violated, false, "onchain view is still the old risk");
  assert.equal(data.pending.violated, true, "external view must already flag the breach");
  assert.equal(data.act, 5, "a pending breach puts the demo in Rebalance");
});

await step("loop verifies the risk onchain and rebalances to A 40 · C 35 · reserve 25", async () => {
  const { data } = await runLoop(user.address);
  assert.ok(data.steps.some((s) => s.step === "VERIFY" && s.status === "ok"), JSON.stringify(data.steps));
  assert.equal(await pos(dep.strategyB), 0n);
  assert.equal(await pos(dep.strategyA), usd(400));
  assert.equal(await pos(dep.strategyC), usd(350));
  const { data: st } = await api(`/api/state?user=${user.address}`);
  assert.equal(st.snapshot.health.violated, false);
  assert.equal(st.snapshot.health.portfolioRisk, 14);
  assert.equal(st.act, "done");
  assert.ok(st.riskHistory.some((p) => p.kind === "risk-change" && p.label.includes("34 → 48")));
  assert.ok(st.riskHistory.some((p) => p.kind === "execution" && p.portfolioRisk === 14));
});

await step("activity log carries the onchain events in order", async () => {
  const { data } = await api(`/api/state?user=${user.address}`);
  const titles = data.activity.filter((a) => a.onchain).map((a) => a.title);
  assert.ok(titles.some((t) => t.startsWith("Allocation #")), titles.join(" | "));
  assert.ok(titles.some((t) => t.includes("34 → 48")), titles.join(" | "));
  assert.ok(titles.some((t) => t.startsWith("Deposited")), titles.join(" | "));
});

await step("emergency exit pauses the agent and the loop does NOT redeploy the capital", async () => {
  await send(dep.vault, vaultAbi, "emergencyExit");
  assert.equal(await pub.readContract({ address: dep.mandate, abi: mandateAbi, functionName: "isActive", args: [user.address] }), false);
  assert.equal(await idle(), usd(1000));
  const { data } = await runLoop(user.address);
  assert.ok(!data.steps.some((s) => s.step === "EXECUTE"), JSON.stringify(data.steps));
  assert.equal(await idle(), usd(1000), "capital must stay in reserve after a human override");
});

await step("risk feed rejects out-of-range and unknown inputs", async () => {
  assert.equal((await api("/api/risk-feed", { strategy: dep.strategyB, risk: 101 })).status, 400);
  assert.equal((await api("/api/risk-feed", { strategy: "0x0000000000000000000000000000000000000001", risk: 10 })).status, 400);
});

await step("rate limit caps the gas-spending endpoints", async () => {
  let limited = 0;
  for (let i = 0; i < 4; i++) if ((await api("/api/agent/guardrail", { user: user.address })).status === 429) limited++;
  assert.ok(limited >= 1, "guardrail should be rate limited after 3 calls per minute");
});

await step("reset feed", async () => assert.equal((await api("/api/risk-feed", { reset: true })).status, 200));

console.log(`\n${passed} end-to-end checks passed`);
