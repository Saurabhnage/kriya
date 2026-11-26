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
  order: number;
  portfolioRisk: number | null;
  kind: "execution" | "risk-change";
  up?: boolean;
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
  market?: { regime: string; at: number; cournot: { claim: string; probability: number; direction: "stress" | "relief" } | null } | null;
  memory?: { mode: "living-brain" | "local-fallback"; market: MemoryItem[]; decisions: MemoryItem[] } | null;
};

export type MemoryItem = { title: string; summary: string; similarity: number | null; pageType?: string };

export type Factor = { name: string; points: number; detail: string; source: string };

export type MarketResponse = {
  enabled: { market: boolean; coinmarketcap: boolean; atlasFeeds: { symbol: string; feed: string }[]; cournot: string; memory: string; llm: boolean };
  intel: {
    at: number;
    regime: string;
    cmc: { quotes: Record<string, { price: number; change24h: number; change7d: number }>; fearGreed: { value: number; classification: string } | null } | null;
    atlas: { symbol: string; feed: string; description: string; price: number; updatedAt: number; stale: boolean }[];
    cournot: { claim: string; direction: "stress" | "relief"; probability: number; marketIds: string[]; requestId: string | null; proofId: string; at: number } | null;
    scores: { address: string; name: string; kind: string; base: number; risk: number; factors: Factor[] }[];
    overrides: Record<string, number>;
    errors: string[];
  } | null;
  cournot: { claim: string; direction: "stress" | "relief"; probability: number; marketIds: string[]; result: unknown; basis: unknown; requestId: string | null; proofId: string; at: number } | null;
  evidence: {
    cmcCalls: { ts: number; endpoint: string; http: number; credits?: number }[];
    cournotProofs: { id: string; endpoint: string; status: number; requestId: string | null; ts: number }[];
  };
};

export type CournotMarket = { id: string; title: string; endTime?: string; matchingConfidence?: number };

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
