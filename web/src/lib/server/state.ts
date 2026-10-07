import "server-only";
import { parseAbiItem, type Address, type Log } from "viem";
import { publicClient } from "./chain";
import { deployment } from "../config";
import {
  KriyaExecutorAbi,
  KriyaMandateAbi,
  KriyaStrategyRegistryAbi,
  KriyaVaultAbi,
  MockUSDCAbi,
} from "../generated/abis";
import type { MandateParams, StrategyView } from "../policy";
import { readJournal, type JournalEntry } from "./store";
import type { RiskPoint } from "./lastRun";

export type Snapshot = {
  user: Address;
  strategies: StrategyView[];
  mandate: { exists: boolean; active: boolean; params: MandateParams; allowed: Address[]; createdAt: number };
  positions: { strategy: Address; amount: bigint }[];
  idle: bigint;
  total: bigint;
  highWaterMark: bigint;
  health: {
    totalValue: bigint;
    portfolioRisk: number;
    maxHeldRisk: number;
    maxExposureBps: number;
    reserveBps: number;
    allocated: boolean;
    violated: boolean;
  };
  walletUsdc: bigint;
  allowance: bigint;
  paused: boolean;
  executionCount: number;
  block: bigint;
};

export async function readStrategies(): Promise<StrategyView[]> {
  const [addrs, infos] = await publicClient.readContract({
    address: deployment.registry,
    abi: KriyaStrategyRegistryAbi,
    functionName: "getAll",
  });
  return addrs.map((address, i) => ({
    address,
    name: infos[i].name,
    apyBps: infos[i].apyBps,
    risk: infos[i].risk,
  }));
}

export async function readSnapshot(user: Address): Promise<Snapshot> {
  const v = { address: deployment.vault, abi: KriyaVaultAbi } as const;
  const e = { address: deployment.executor, abi: KriyaExecutorAbi } as const;
  const [strategies, m, pos, health, hwm, walletUsdc, allowance, paused, executionCount, block] = await Promise.all([
    readStrategies(),
    publicClient.readContract({ address: deployment.mandate, abi: KriyaMandateAbi, functionName: "getMandate", args: [user] }),
    publicClient.readContract({ ...v, functionName: "positionsOf", args: [user] }),
    publicClient.readContract({ ...e, functionName: "mandateHealth", args: [user] }),
    publicClient.readContract({ ...v, functionName: "highWaterMark", args: [user] }),
    publicClient.readContract({ address: deployment.usdc, abi: MockUSDCAbi, functionName: "balanceOf", args: [user] }),
    publicClient.readContract({
      address: deployment.usdc,
      abi: MockUSDCAbi,
      functionName: "allowance",
      args: [user, deployment.vault],
    }),
    publicClient.readContract({ ...e, functionName: "paused" }),
    publicClient.readContract({ ...e, functionName: "executionCount" }),
    publicClient.getBlockNumber({ cacheTime: 0 }),
  ]);
  const [list, amounts, idle, total] = pos;
  return {
    user,
    strategies,
    mandate: {
      exists: m.createdAt > 0n,
      active: m.active,
      params: { ...m.params },
      allowed: [...m.allowedStrategies],
      createdAt: Number(m.createdAt),
    },
    positions: list.map((strategy, i) => ({ strategy, amount: amounts[i] })),
    idle,
    total,
    highWaterMark: hwm,
    health: { ...health },
    walletUsdc,
    allowance,
    paused,
    executionCount: Number(executionCount),
    block,
  };
}

export async function listMandateUsers(): Promise<Address[]> {
  return [
    ...(await publicClient.readContract({ address: deployment.mandate, abi: KriyaMandateAbi, functionName: "users" })),
  ];
}

// ------------------------------------------------------------------ activity (onchain events + agent journal)

export type ActivityItem = {
  runId?: string;
  id: string;
  ts: number;
  kind: string;
  title: string;
  detail?: string;
  txHash?: string;
  onchain: boolean;
  source?: "CRE" | "AGENT";
};

const EVENTS = {
  deposited: parseAbiItem("event Deposited(address indexed user, uint256 amount)"),
  withdrawn: parseAbiItem("event Withdrawn(address indexed user, uint256 amount)"),
  exit: parseAbiItem("event EmergencyExit(address indexed user, uint256 recovered)"),
  mandateStatus: parseAbiItem("event MandateStatusChanged(address indexed user, bool active)"),
  risk: parseAbiItem("event RiskUpdated(address indexed strategy, uint16 oldRisk, uint16 newRisk, address indexed updater)"),
  executed: parseAbiItem(
    "event AllocationExecuted(address indexed user, uint256 indexed executionId, uint8 source, address[] strategies, uint16[] bps, uint16 reserveBps, uint16 portfolioRisk, uint256 totalValue, string rationale)",
  ),
};

const CHUNK = 9_000n;
// keyed by block hash: block numbers repeat across chain resets and reorgs, hashes do not
const blockTimes = new Map<string, number>();

async function logsInChunks<T>(fetcher: (from: bigint, to: bigint) => Promise<T[]>, latest: bigint): Promise<T[]> {
  const out: T[] = [];
  const start = BigInt(deployment.deployBlock);
  for (let from = start; from <= latest; from += CHUNK + 1n) {
    const to = from + CHUNK > latest ? latest : from + CHUNK;
    out.push(...(await fetcher(from, to)));
  }
  return out;
}

const fmtUsdc = (v: bigint) => (Number(v) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });

export type ActivityResult = { items: ActivityItem[]; riskHistory: RiskPoint[]; journal: JournalEntry[] };

export async function readActivity(user: Address, strategies: StrategyView[], latest: bigint): Promise<ActivityResult> {
  const name = (a: string) => strategies.find((s) => s.address.toLowerCase() === a.toLowerCase())?.name ?? a.slice(0, 8);
  const get = (address: Address, event: (typeof EVENTS)[keyof typeof EVENTS], args?: Record<string, unknown>) =>
    logsInChunks(
      (fromBlock, toBlock) =>
        publicClient.getLogs({ address, event, args, fromBlock, toBlock } as Parameters<typeof publicClient.getLogs>[0]),
      latest,
    );

  // sequential on purpose: public RPCs rate-limit parallel eth_getLogs bursts
  const dep = await get(deployment.vault, EVENTS.deposited, { user });
  const wd = await get(deployment.vault, EVENTS.withdrawn, { user });
  const ex = await get(deployment.vault, EVENTS.exit, { user });
  const ms = await get(deployment.mandate, EVENTS.mandateStatus, { user });
  const risk = await get(deployment.registry, EVENTS.risk);
  const exec = await get(deployment.executor, EVENTS.executed, { user });

  type AnyLog = Log & { args: Record<string, unknown> };
  const items: {
    log: AnyLog;
    kind: string;
    title: string;
    detail?: string;
    source?: "CRE" | "AGENT";
    point?: Omit<RiskPoint, "ts" | "txHash" | "order">;
  }[] = [];
  for (const l of dep as AnyLog[]) items.push({ log: l, kind: "deposit", title: `Deposited ${fmtUsdc(l.args.amount as bigint)} USDC` });
  for (const l of wd as AnyLog[]) items.push({ log: l, kind: "withdraw", title: `Withdrew ${fmtUsdc(l.args.amount as bigint)} USDC` });
  for (const l of ex as AnyLog[])
    items.push({ log: l, kind: "override", title: "Human override: emergency exit to reserve", detail: `${fmtUsdc(l.args.recovered as bigint)} USDC recovered` });
  for (const l of ms as AnyLog[])
    items.push({ log: l, kind: "mandate", title: l.args.active ? "Mandate active: KRIYA authorized" : "Mandate paused by user" });
  for (const l of risk as AnyLog[]) {
    const up = (l.args.newRisk as number) > (l.args.oldRisk as number);
    items.push({
      log: l,
      kind: up ? "risk-up" : "risk-down",
      title: `Verified risk ${up ? "increase" : "change"}: ${name(l.args.strategy as string)} ${l.args.oldRisk} → ${l.args.newRisk}`,
      detail: (l.args.updater as string).toLowerCase() === deployment.executor.toLowerCase() ? "Written by Chainlink CRE report" : "Written by protocol keeper",
      source: (l.args.updater as string).toLowerCase() === deployment.executor.toLowerCase() ? "CRE" : "AGENT",
      point: {
        portfolioRisk: null,
        kind: "risk-change",
        label: `${name(l.args.strategy as string).split(" - ")[0]} ${l.args.oldRisk} → ${l.args.newRisk}`,
        source: (l.args.updater as string).toLowerCase() === deployment.executor.toLowerCase() ? "CRE" : "AGENT",
      },
    });
  }
  for (const l of exec as AnyLog[]) {
    const a = l.args as { executionId: bigint; source: number; strategies: string[]; bps: number[]; reserveBps: number; portfolioRisk: number; rationale: string };
    const parts = a.strategies.map((s, i) => `${name(s).split(" - ")[0]} ${a.bps[i] / 100}%`);
    parts.push(`Reserve ${a.reserveBps / 100}%`);
    items.push({
      log: l,
      kind: "execute",
      title: `Allocation #${a.executionId} executed via ${a.source === 1 ? "Chainlink CRE" : "KRIYA agent"} · risk ${a.portfolioRisk}`,
      detail: `${parts.join(" · ")}${a.rationale ? ` — ${a.rationale}` : ""}`,
      source: a.source === 1 ? "CRE" : "AGENT",
      point: { portfolioRisk: a.portfolioRisk, kind: "execution", label: `Allocation #${a.executionId}`, source: a.source === 1 ? "CRE" : "AGENT" },
    });
  }

  const blocks = [...new Set(items.map((i) => i.log.blockHash!))].filter((h) => !blockTimes.has(h));
  for (const b of blocks) {
    blockTimes.set(b, Number((await publicClient.getBlock({ blockHash: b })).timestamp) * 1000);
  }

  const onchain: ActivityItem[] = items.map((i) => ({
    id: `${i.log.transactionHash}-${i.log.logIndex}`,
    ts: blockTimes.get(i.log.blockHash!) ?? 0,
    kind: i.kind,
    title: i.title,
    detail: i.detail,
    txHash: i.log.transactionHash ?? undefined,
    onchain: true,
    source: i.source,
  }));
  const riskHistory: RiskPoint[] = items
    .filter((i) => i.point)
    .map((i) => ({
      ...i.point!,
      ts: blockTimes.get(i.log.blockHash!) ?? 0,
      order: Number(i.log.blockNumber!) * 1e6 + (i.log.logIndex ?? 0),
      txHash: i.log.transactionHash ?? undefined,
    }))
    .sort((a, b) => a.order - b.order);
  const journal = await readJournal(user);
  const offchain: (ActivityItem & { seq: number })[] = journal
    .filter((j) => j.kind !== "run")
    .map((j: JournalEntry, seq) => ({
    seq,
    runId: j.runId,
    id: j.id,
    ts: j.ts,
    kind: j.kind,
    title: j.title,
    detail: j.detail,
    txHash: j.txHash,
    onchain: false,
  }));
  // newest first; journal entries written in the same millisecond keep their write order
  const sorted = [...onchain.map((o) => ({ ...o, seq: -1 })), ...offchain]
    .sort((a, b) => b.ts - a.ts || b.seq - a.seq)
    .map((item) => ({ ...item, seq: undefined }));
  return { items: sorted, riskHistory, journal };
}
