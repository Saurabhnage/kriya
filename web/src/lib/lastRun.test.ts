import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLastRun } from "./server/lastRun";
import type { LoopStep } from "./client";

const steps: LoopStep[] = [
  { step: "OBSERVE", status: "ok", detail: "o" },
  { step: "EXECUTE", status: "ok", detail: "e", txHash: "0x1" },
];

test("keeper run uses its persisted steps verbatim", () => {
  const r = buildLastRun([{ ts: 10, kind: "run", runId: "run-1", source: "AGENT", title: "run", data: { steps } }], []);
  assert.equal(r?.runId, "run-1");
  assert.equal(r?.source, "AGENT");
  assert.deepEqual(r?.steps, steps);
});

test("CRE run is assembled from its decide entry and onchain events", () => {
  const r = buildLastRun(
    [{ ts: 1000, kind: "decide", runId: "cre-1", source: "CRE", title: "AI decision", detail: "exit B" }],
    [
      { ts: 990, order: 1, portfolioRisk: null, kind: "risk-change", label: "B 34 → 48", txHash: "0xv", source: "CRE" },
      { ts: 1100, order: 3, portfolioRisk: 14, kind: "execution", label: "Allocation #4", txHash: "0xe", source: "CRE" },
    ],
  );
  assert.equal(r?.source, "CRE");
  const by = Object.fromEntries(r!.steps.map((s) => [s.step, s]));
  assert.equal(by.VERIFY.txHash, "0xv");
  assert.equal(by.DECIDE.status, "ok");
  assert.equal(by.DECIDE.detail, "exit B");
  assert.equal(by.EXECUTE.txHash, "0xe");
});

test("CRE nodes without onchain evidence stay idle", () => {
  const r = buildLastRun([{ ts: 1000, kind: "decide", runId: "cre-1", source: "CRE", title: "d" }], []);
  const by = Object.fromEntries(r!.steps.map((s) => [s.step, s]));
  assert.equal(by.VERIFY.status, "skip");
  assert.equal(by.EXECUTE.status, "skip");
});

test("agent executions are not attributed to a CRE run", () => {
  const r = buildLastRun(
    [{ ts: 1000, kind: "decide", runId: "cre-1", source: "CRE", title: "d" }],
    [{ ts: 1050, order: 2, portfolioRisk: 21, kind: "execution", label: "Allocation #2", txHash: "0xa", source: "AGENT" }],
  );
  assert.equal(r!.steps.find((s) => s.step === "EXECUTE")?.status, "skip");
});

test("newest run wins; null when nothing ran", () => {
  assert.equal(buildLastRun([], []), null);
  const r = buildLastRun(
    [
      { ts: 10, kind: "run", runId: "run-1", source: "AGENT", title: "run", data: { steps } },
      { ts: 50, kind: "decide", runId: "cre-2", source: "CRE", title: "AI decision" },
    ],
    [],
  );
  assert.equal(r?.runId, "cre-2");
});
