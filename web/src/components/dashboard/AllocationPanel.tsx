"use client";

import { usd, type StateResponse } from "@/lib/client";
import { Donut } from "../charts/Donut";
import { Gauge } from "../charts/Gauge";
import { colorFor, holdings, Panel, RESERVE_COLOR } from "./shared";

export function AllocationPanel({ state }: { state: StateResponse }) {
  const s = state.snapshot;
  const max = s.mandate.params.maxRisk;
  const { rows, reserveShare } = holdings(state);
  const slices = [
    ...rows.filter((r) => r.share > 0).map((r) => ({ label: r.name.split(" - ")[0], value: r.share, color: colorFor(state, r.address) })),
    ...(reserveShare > 0 ? [{ label: "USDC Reserve", value: reserveShare, color: RESERVE_COLOR }] : []),
  ];
  const ghost = state.pending && state.pending.portfolioRisk !== s.health.portfolioRisk ? state.pending.portfolioRisk : null;

  return (
    <Panel title="Allocation & risk" className="min-h-0 flex-1">
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex items-center gap-4">
          <Donut
            slices={slices.length ? slices : [{ label: "Unallocated", value: 1, color: RESERVE_COLOR }]}
            size={124}
            thickness={14}
            center={
              <>
                <span className="font-mono text-lg">{s.health.portfolioRisk}</span>
                <span className="text-[10px] text-muted">risk</span>
              </>
            }
          />
          <ul className="flex-1 space-y-1.5 text-xs">
            {rows.map((r) => {
              const over = r.risk > max;
              return (
                <li key={r.address} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorFor(state, r.address) }} />
                  <span className="flex-1 truncate" title={r.name}>
                    {r.name.split(" - ")[0]}
                  </span>
                  <span className="font-mono">{r.share.toFixed(0)}%</span>
                  <span className={`w-14 text-right font-mono ${over ? "text-danger" : "text-muted"}`} title={over ? `Risk ${r.risk} exceeds the mandate max ${max}` : `Risk ${r.risk}`}>
                    r{r.risk}
                    {r.feedRisk !== r.risk && <span className="text-warn">→{r.feedRisk}?</span>}
                  </span>
                </li>
              );
            })}
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RESERVE_COLOR }} />
              <span className="flex-1">Reserve</span>
              <span className="font-mono">{reserveShare.toFixed(0)}%</span>
              <span className="w-14 text-right font-mono text-muted">${usd(s.idle).split(".")[0]}</span>
            </li>
          </ul>
        </div>
        <div className="mt-3">
          <Gauge value={s.health.portfolioRisk} max={max} ghost={ghost} label="Portfolio risk" />
          <p className="-mt-1 text-center text-xs text-muted">
            Portfolio risk <span className="font-mono text-ink">{s.health.portfolioRisk}</span> / {max}
            {ghost !== null && <span className="text-warn"> · unverified feed {ghost}</span>}
          </p>
        </div>
      </div>
    </Panel>
  );
}
