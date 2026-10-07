"use client";

import { usd, type StateResponse } from "@/lib/client";
import { holdings } from "./shared";

function Chip({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${ok ? "border-line" : "border-danger/50 bg-danger/5"}`}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`font-mono text-sm ${ok ? "text-ink" : "text-danger"}`}>
        {ok ? "✓" : "✗"} {value}
      </p>
    </div>
  );
}

export function MandateCard({ state }: { state: StateResponse }) {
  const s = state.snapshot;
  const p = s.mandate.params;
  const h = s.health;
  const { expectedApy } = holdings(state);
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="label">Mandate</h2>
        <span className="font-mono text-xs text-muted">{s.executionCount} executions</span>
      </div>
      <p className="mt-2 font-mono text-2xl">${usd(s.total)}</p>
      <p className="text-sm text-accent">{p.objective}</p>
      <p className="mt-1 text-xs text-muted">Expected yield {expectedApy.toFixed(2)}% · reserve ${usd(s.idle)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Chip label="Max risk" value={String(p.maxRisk)} ok={h.portfolioRisk <= p.maxRisk && h.maxHeldRisk <= p.maxRisk} />
        <Chip label="Max exposure" value={`${p.maxExposureBps / 100}%`} ok={h.maxExposureBps <= p.maxExposureBps} />
        <Chip label="Min reserve" value={`${p.minReserveBps / 100}%`} ok={!h.allocated || h.reserveBps >= p.minReserveBps} />
        <Chip label="Auto rebalance" value={p.autoRebalance ? "ON" : "OFF"} ok />
      </div>
    </section>
  );
}
