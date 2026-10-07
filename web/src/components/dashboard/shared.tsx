"use client";

import { useEffect, useState, type ReactNode } from "react";
import { txUrl } from "@/lib/config";
import { short, type StateResponse } from "@/lib/client";

export const COLORS = ["#7cf7c4", "#5aa8ff", "#c38bff", "#ffb547", "#ff7aa8"];
export const RESERVE_COLOR = "#3a4658";

export function colorFor(state: StateResponse, address: string) {
  const i = state.snapshot.strategies.findIndex((s) => s.address.toLowerCase() === address.toLowerCase());
  return COLORS[(i < 0 ? 0 : i) % COLORS.length];
}

export function strategyName(state: StateResponse, address: string) {
  return state.snapshot.strategies.find((s) => s.address.toLowerCase() === address.toLowerCase())?.name.split(" - ")[0] ?? short(address);
}

export function TxLink({ hash, className = "" }: { hash: string; className?: string }) {
  const url = txUrl(hash);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className={`font-mono text-accent-2 underline-offset-2 hover:underline ${className}`}>
      {short(hash)} ↗
    </a>
  ) : (
    <span className={`font-mono text-muted ${className}`}>{short(hash)}</span>
  );
}

export function Panel({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card flex min-h-0 flex-col p-4 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="label">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Wall clock that re-renders every `ms`, so relative times stay fresh without impure renders. */
export function useNow(ms = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function relTime(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export type Status = { key: "safe" | "risk-verified" | "risk-pending" | "paused"; label: string; sub: string; tone: string };

export function statusOf(state: StateResponse): Status {
  const s = state.snapshot;
  if (!s.mandate.active) return { key: "paused", label: "⏸ PAUSED", sub: "Agent authority suspended by you", tone: "text-muted border-line" };
  if (s.health.violated) return { key: "risk-verified", label: "⚠ AT RISK", sub: "Verified onchain — rebalance required", tone: "text-warn border-warn/50" };
  if (state.pending?.violated) return { key: "risk-pending", label: "⚠ AT RISK", sub: "External signal — awaiting verification", tone: "text-warn border-warn/50" };
  return { key: "safe", label: "✓ SAFE", sub: "All constraints satisfied", tone: "text-accent border-accent/40" };
}

export function holdings(state: StateResponse) {
  const s = state.snapshot;
  const total = BigInt(s.total);
  const rows = s.strategies.map((st) => {
    const amount = BigInt(s.positions.find((x) => x.strategy === st.address)?.amount ?? "0");
    return {
      ...st,
      amount,
      share: total ? Number((amount * 10000n) / total) / 100 : 0,
      feedRisk: state.feed.risks[st.address.toLowerCase()] ?? st.risk,
    };
  });
  const reserveShare = total ? Number((BigInt(s.idle) * 10000n) / total) / 100 : 0;
  const expectedApy = rows.reduce((a, r) => a + (r.share * r.apyBps) / 10000, 0);
  return { rows, reserveShare, expectedApy, total };
}
