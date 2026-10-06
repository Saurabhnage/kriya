import "server-only";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { deployment } from "../config";

// Offchain demo state (external risk feed + agent journal).
// - Hosted (Vercel): Upstash Redis over REST, shared by every serverless instance.
// - Local: a JSON file in .data/, with an in-memory fallback.

const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const redisEnabled = !!(REDIS_URL && REDIS_TOKEN);

async function redis<T = unknown>(...command: (string | number)[]): Promise<T> {
  const res = await fetch(REDIS_URL!, {
    method: "POST",
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(`Redis ${command[0]} failed: ${body.error ?? res.status}`);
  return body.result as T;
}

const DIR = join(process.cwd(), ".data");
const memory = new Map<string, unknown>();

function loadLocal<T>(name: string, fallback: () => T): T {
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

function saveLocal(name: string, value: unknown) {
  memory.set(name, value);
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, `${name}.json`), JSON.stringify(value, null, 2));
  } catch {}
}

const ns = (name: string) => `kriya:${deployment.chainId}:${deployment.executor.toLowerCase()}:${name}`;

// ------------------------------------------------------------------ external risk feed

export type RiskFeed = { updatedAt: number; source: string; risks: Record<string, number> };

export const DEFAULT_RISKS: Record<string, number> = {
  [deployment.strategyA.toLowerCase()]: 21,
  [deployment.strategyB.toLowerCase()]: 34,
  [deployment.strategyC.toLowerCase()]: 15,
};

const defaultFeed = (): RiskFeed => ({
  updatedAt: Date.now(),
  source: "KRIYA Risk Oracle (demo feed)",
  risks: { ...DEFAULT_RISKS },
});

export async function getRiskFeed(): Promise<RiskFeed> {
  if (redisEnabled) {
    const raw = await redis<string | null>("GET", ns("risk-feed"));
    return raw ? (JSON.parse(raw) as RiskFeed) : defaultFeed();
  }
  return loadLocal(`risk-feed-${deployment.chainId}`, defaultFeed);
}

async function saveFeed(feed: RiskFeed) {
  if (redisEnabled) await redis("SET", ns("risk-feed"), JSON.stringify(feed));
  else saveLocal(`risk-feed-${deployment.chainId}`, feed);
  return feed;
}

export async function setRisk(strategy: string, risk: number): Promise<RiskFeed> {
  const feed = await getRiskFeed();
  return saveFeed({ ...feed, updatedAt: Date.now(), risks: { ...feed.risks, [strategy.toLowerCase()]: risk } });
}

export async function resetRiskFeed(): Promise<RiskFeed> {
  return saveFeed({ ...(await getRiskFeed()), updatedAt: Date.now(), risks: { ...DEFAULT_RISKS } });
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

const MAX_JOURNAL = 300;

export async function journal(entry: Omit<JournalEntry, "id" | "ts">): Promise<JournalEntry> {
  const e = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now() };
  if (redisEnabled) {
    await redis("RPUSH", ns("journal"), JSON.stringify(e));
    await redis("LTRIM", ns("journal"), -MAX_JOURNAL, -1);
  } else {
    const key = `journal-${deployment.chainId}`;
    const list = loadLocal<JournalEntry[]>(key, () => []);
    list.push(e);
    saveLocal(key, list.slice(-MAX_JOURNAL));
  }
  return e;
}

export async function readJournal(user?: string): Promise<JournalEntry[]> {
  const list = redisEnabled
    ? (await redis<string[]>("LRANGE", ns("journal"), 0, -1)).map((s) => JSON.parse(s) as JournalEntry)
    : loadLocal<JournalEntry[]>(`journal-${deployment.chainId}`, () => []);
  return user ? list.filter((e) => !e.user || e.user.toLowerCase() === user.toLowerCase()) : list;
}
