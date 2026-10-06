import "server-only";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { deployment } from "../config";

// Small file-backed store for the demo's offchain state (external risk feed + agent journal).
// Falls back to memory when the filesystem is read-only (e.g. serverless hosting).
const DIR = join(process.cwd(), ".data");
const memory = new Map<string, unknown>();

function load<T>(name: string, fallback: () => T): T {
  if (memory.has(name)) return memory.get(name) as T;
  try {
    const p = join(DIR, `${name}.json`);
    if (existsSync(p)) {
      const v = JSON.parse(readFileSync(p, "utf8")) as T;
      memory.set(name, v);
      return v;
    }
  } catch {}
  const v = fallback();
  memory.set(name, v);
  return v;
}

function save(name: string, value: unknown) {
  memory.set(name, value);
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, `${name}.json`), JSON.stringify(value, null, 2));
  } catch {}
}

// ------------------------------------------------------------------ external risk feed

export type RiskFeed = { updatedAt: number; source: string; risks: Record<string, number> };

const feedKey = `risk-feed-${deployment.chainId}`;
export const DEFAULT_RISKS: Record<string, number> = {
  [deployment.strategyA.toLowerCase()]: 21,
  [deployment.strategyB.toLowerCase()]: 34,
  [deployment.strategyC.toLowerCase()]: 15,
};

export function getRiskFeed(): RiskFeed {
  return load<RiskFeed>(feedKey, () => ({
    updatedAt: Date.now(),
    source: "KRIYA Risk Oracle (demo feed)",
    risks: { ...DEFAULT_RISKS },
  }));
}

export function setRisk(strategy: string, risk: number): RiskFeed {
  const feed = getRiskFeed();
  const next = { ...feed, updatedAt: Date.now(), risks: { ...feed.risks, [strategy.toLowerCase()]: risk } };
  save(feedKey, next);
  return next;
}

export function resetRiskFeed(): RiskFeed {
  const next = { ...getRiskFeed(), updatedAt: Date.now(), risks: { ...DEFAULT_RISKS } };
  save(feedKey, next);
  return next;
}

// ------------------------------------------------------------------ agent journal

export type JournalEntry = {
  id: string;
  ts: number;
  user?: string;
  kind: "observe" | "decide" | "verify" | "constrain" | "execute" | "reject" | "reality" | "guardrail";
  title: string;
  detail?: string;
  txHash?: string;
  data?: unknown;
};

const journalKey = `journal-${deployment.chainId}`;

export function journal(entry: Omit<JournalEntry, "id" | "ts">): JournalEntry {
  const list = load<JournalEntry[]>(journalKey, () => []);
  const e = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now() };
  list.push(e);
  save(journalKey, list.slice(-300));
  return e;
}

export function readJournal(user?: string): JournalEntry[] {
  const list = load<JournalEntry[]>(journalKey, () => []);
  return user ? list.filter((e) => !e.user || e.user.toLowerCase() === user.toLowerCase()) : list;
}

export function clearJournal() {
  save(journalKey, []);
}
