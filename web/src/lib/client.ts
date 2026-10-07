import type { Act } from "./act";
export type { Act } from "./act";

// Client-side shapes of /api responses (bigints arrive as decimal strings).

export type StrategyView = { address: string; name: string; apyBps: number; risk: number };

export type StateResponse = {
  snapshot: {
    user: string;
    strategies: StrategyView[];
    mandate: {
      exists: boolean;
      active: boolean;
      params: {
        maxRisk: number;
        maxExposureBps: number;
        maxDrawdownBps: number;
        minReserveBps: number;
        autoRebalance: boolean;
        objective: string;
      };
      allowed: string[];
      createdAt: number;
    };
    positions: { strategy: string; amount: string }[];
    idle: string;
    total: string;
    highWaterMark: string;
    health: {
      totalValue: string;
      portfolioRisk: number;
      maxHeldRisk: number;
      maxExposureBps: number;
      reserveBps: number;
      allocated: boolean;
      violated: boolean;
    };
    walletUsdc: string;
    allowance: string;
    paused: boolean;
    executionCount: number;
    block: string;
  };
  feed: { updatedAt: number; source: string; risks: Record<string, number> };
  pending: { portfolioRisk: number; violated: boolean; reasons: string[] } | null;
  activity: {
    id: string;
    ts: number;
    kind: string;
    title: string;
    detail?: string;
    txHash?: string;
    onchain: boolean;
    source?: "CRE" | "AGENT";
    runId?: string;
  }[];
  riskHistory: RiskPoint[];
  lastRun: RunView | null;
  latestDecision: Decision | null;
  act: Act;
};

export type RiskPoint = {
  ts: number;
  portfolioRisk: number | null;
  kind: "execution" | "risk-change";
  label: string;
  txHash?: string;
  source?: "AGENT" | "CRE";
};

export type RunView = { runId: string; source: "AGENT" | "CRE"; ts: number; steps: LoopStep[] };

export type Decision = Omit<ProposalResponse, "user"> & { ts: number; source: "AGENT" | "CRE" };

export type ProposalResponse = {
  user: string;
  strategies: string[];
  bps: number[];
  rationale: string;
  engine: "llm" | "deterministic";
  model: string | null;
  trigger: string;
  validation: { ok: true; portfolioRisk: number; reserveBps: number; expectedApyBps: number } | { ok: false; error: string; detail: string };
  analysis: { strategy: string; assessment: string }[];
  llmRejected: { error: string; detail: string } | null;
};

export type LoopStep = { step: string; status: "ok" | "skip" | "warn" | "error"; detail: string; txHash?: string };

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const usd = (v: string | bigint | number) =>
  (Number(v) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
export const shortName = (n: string) => n.split(" - ")[0];
