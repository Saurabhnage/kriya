import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAct, type ActInput } from "./act";

const base: ActInput = {
  mandateExists: true,
  allocated: true,
  violated: false,
  pendingViolated: false,
  guardrailShown: true,
  feedMatchesOnchain: true,
  lastExecutionTs: 100,
  lastRiskChangeTs: null,
};

test("1 Program when there is no mandate", () => assert.equal(deriveAct({ ...base, mandateExists: false }), 1));
test("2 Decide when capital is not allocated", () => assert.equal(deriveAct({ ...base, allocated: false }), 2));
test("3 Guard when allocated but guardrail not shown", () => assert.equal(deriveAct({ ...base, guardrailShown: false }), 3));
test("4 Reality when safe, guarded and feed matches", () => assert.equal(deriveAct(base), 4));
test("5 Rebalance when the external feed breaches", () =>
  assert.equal(deriveAct({ ...base, pendingViolated: true, feedMatchesOnchain: false }), 5));
test("5 Rebalance when the onchain view breaches", () => assert.equal(deriveAct({ ...base, violated: true }), 5));
test("done when an execution follows the latest risk change and all is safe", () =>
  assert.equal(deriveAct({ ...base, lastRiskChangeTs: 200, lastExecutionTs: 300 }), "done"));
test("back to 4 when risk changed after the last execution but stayed safe", () =>
  assert.equal(deriveAct({ ...base, lastRiskChangeTs: 400, lastExecutionTs: 300 }), 4));
