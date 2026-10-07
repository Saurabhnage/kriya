import { readActivity, readSnapshot } from "@/lib/server/state";
import { getRiskFeed, type JournalEntry } from "@/lib/server/store";
import { evaluateHealth } from "@/lib/policy";
import { withRisks } from "@/lib/server/loop";
import { buildLastRun } from "@/lib/server/lastRun";
import type { Proposal } from "@/lib/server/agent";
import { deriveAct, lastBreachAt } from "@/lib/act";
import { fail, json, parseUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";

function toDecision(entry: JournalEntry | undefined) {
  const p = entry?.data as Proposal | undefined;
  if (!entry || !p?.allocation) return null;
  return {
    ts: entry.ts,
    source: entry.source ?? "AGENT",
    strategies: p.allocation.map((a) => a.strategy),
    bps: p.allocation.map((a) => a.bps),
    rationale: p.rationale,
    engine: p.engine,
    model: p.model ?? null,
    trigger: p.trigger,
    validation: p.validation,
    analysis: p.analysis,
    llmRejected: p.llmRejected ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const user = parseUser(new URL(request.url).searchParams.get("user"));
    const snap = await readSnapshot(user);
    const feed = await getRiskFeed();
    const { items: activity, riskHistory, journal } = await readActivity(user, snap.strategies, snap.block);

    // What the mandate looks like against the latest *external* risk view (before CRE writes it onchain)
    const pending = snap.mandate.exists
      ? evaluateHealth(snap.mandate.params, snap.mandate.allowed, withRisks(snap.strategies, feed.risks), snap.positions, snap.idle)
      : null;

    const executions = riskHistory.filter((p) => p.kind === "execution");
    const firstExecutionTs = executions[0]?.ts ?? null;
    const act = deriveAct({
      mandateExists: snap.mandate.exists,
      allocated: snap.health.allocated,
      violated: snap.health.violated,
      pendingViolated: pending?.violated ?? false,
      guardrailShown: firstExecutionTs !== null && journal.some((j) => j.kind === "guardrail" && j.ts >= firstExecutionTs),
      feedMatchesOnchain: snap.strategies.every((s) => (feed.risks[s.address.toLowerCase()] ?? s.risk) === s.risk),
      lastExecutionAt: executions.at(-1)?.order ?? null,
      lastRiskChangeAt: lastBreachAt(riskHistory),
    });

    const latestDecision = toDecision([...journal].reverse().find((j) => j.kind === "decide" && j.data));
    const lastRun = buildLastRun(journal, riskHistory);

    return json({ snapshot: snap, feed, pending, activity, riskHistory, lastRun, latestDecision, act });
  } catch (err) {
    return fail(err, 400);
  }
}
