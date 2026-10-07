// Rebuild the most recent loop run for the pipeline view.
// Pure (no server-only imports) so it is unit-testable.
//
// Keeper runs persist their exact steps. CRE runs execute outside the app, so their pipeline is
// assembled from what is observable: the decide entry CRE's proposal request created, plus the
// onchain RiskUpdated / AllocationExecuted events attributed to CRE near that moment.
import type { LoopStep } from "../client";

export type RunView = { runId: string; source: "AGENT" | "CRE"; ts: number; steps: LoopStep[] };

export type RiskPoint = {
  ts: number;
  /** block number × 1e6 + log index: exact chain order, unlike timestamps */
  order: number;
  portfolioRisk: number | null;
  kind: "execution" | "risk-change";
  label: string;
  txHash?: string;
  source?: "AGENT" | "CRE";
};

export type JournalLike = {
  ts: number;
  kind: string;
  runId?: string;
  source?: "AGENT" | "CRE";
  title: string;
  detail?: string;
  txHash?: string;
  data?: unknown;
};

const WINDOW_MS = 5 * 60_000;

function creRun(decide: JournalLike, history: RiskPoint[]): RunView {
  const near = (p: RiskPoint) => p.source === "CRE" && Math.abs(p.ts - decide.ts) <= WINDOW_MS;
  const verify = history.filter((p) => p.kind === "risk-change" && near(p) && p.ts <= decide.ts).pop();
  const exec = history.find((p) => p.kind === "execution" && near(p) && p.ts >= decide.ts);
  const idle = (step: string): LoopStep => ({ step, status: "skip", detail: "No onchain evidence for this step" });
  return {
    runId: decide.runId!,
    source: "CRE",
    ts: decide.ts,
    steps: [
      { step: "OBSERVE", status: "ok", detail: "Risk feed read via Chainlink CRE HTTP consensus" },
      verify ? { step: "VERIFY", status: "ok", detail: verify.label, txHash: verify.txHash } : idle("VERIFY"),
      { step: "DETECT", status: "warn", detail: "Mandate needed action" },
      { step: "DECIDE", status: "ok", detail: decide.detail ?? decide.title },
      { step: "CONSTRAIN", status: "ok", detail: "Re-validated inside the CRE workflow" },
      exec ? { step: "EXECUTE", status: "ok", detail: exec.label, txHash: exec.txHash } : idle("EXECUTE"),
    ],
  };
}

export function buildLastRun(journal: JournalLike[], history: RiskPoint[]): RunView | null {
  const newestFirst = [...journal].sort((a, b) => b.ts - a.ts);
  const keeper = newestFirst.find((j) => j.kind === "run" && j.runId);
  const creDecide = newestFirst.find((j) => j.kind === "decide" && j.source === "CRE" && j.runId);

  const agent: RunView | null = keeper
    ? { runId: keeper.runId!, source: "AGENT", ts: keeper.ts, steps: (keeper.data as { steps?: LoopStep[] } | undefined)?.steps ?? [] }
    : null;
  const cre = creDecide ? creRun(creDecide, history) : null;

  if (!agent) return cre;
  if (!cre) return agent;
  return cre.ts > agent.ts ? cre : agent;
}
