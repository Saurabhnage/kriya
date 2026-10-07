"use client";

import { useState } from "react";
import type { StateResponse } from "@/lib/client";
import { Panel, relTime, TxLink, useNow } from "./shared";

type Item = StateResponse["activity"][number];

const ICON: Record<string, [string, string]> = {
  deposit: ["↓", "text-accent"],
  withdraw: ["↑", "text-accent"],
  mandate: ["◆", "text-accent"],
  execute: ["⚡", "text-accent"],
  "risk-up": ["⚠", "text-warn"],
  "risk-down": ["✓", "text-accent"],
  decide: ["✦", "text-accent-2"],
  constrain: ["✓", "text-accent"],
  reject: ["✗", "text-danger"],
  reality: ["◎", "text-warn"],
  guardrail: ["⛨", "text-danger"],
  verify: ["✓", "text-accent"],
  observe: ["⚠", "text-warn"],
  override: ["■", "text-warn"],
};

type Group = { key: string; head: Item; rest: Item[] };

/** Journal entries from one loop run collapse under their most telling entry. */
function group(items: Item[]): Group[] {
  const out: Group[] = [];
  const byRun = new Map<string, Group>();
  for (const it of items) {
    if (it.runId) {
      const g = byRun.get(it.runId);
      if (g) {
        g.rest.push(it);
        continue;
      }
      const ng: Group = { key: it.runId, head: it, rest: [] };
      byRun.set(it.runId, ng);
      out.push(ng);
    } else {
      out.push({ key: it.id, head: it, rest: [] });
    }
  }
  // prefer the decision as the headline of a run
  for (const g of out) {
    const all = [g.head, ...g.rest];
    const best = all.find((i) => i.kind === "decide") ?? all.find((i) => i.kind === "observe") ?? g.head;
    g.head = best;
    g.rest = all.filter((i) => i !== best);
  }
  return out;
}

function Row({ item, now, sub }: { item: Item; now: number; sub?: boolean }) {
  const [icon, tone] = ICON[item.kind] ?? ["•", "text-muted"];
  return (
    <div className={`flex gap-2.5 ${sub ? "pl-7" : ""}`}>
      <span aria-hidden className={`mt-0.5 w-4 shrink-0 text-center text-xs ${tone}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-xs">
        <p className="leading-snug text-ink">
          {item.title}
          {item.source && (
            <span className={`ml-1.5 rounded px-1 py-px font-mono text-[9px] ${item.source === "CRE" ? "bg-accent-2/15 text-accent-2" : "bg-line text-muted"}`}>
              {item.source === "CRE" ? "CRE" : "AGENT"}
            </span>
          )}
        </p>
        {item.detail && !sub && <p className="mt-0.5 line-clamp-2 break-words text-[11px] text-muted">{item.detail}</p>}
        <p className="mt-0.5 font-mono text-[10px] text-muted">
          {relTime(item.ts, now)}
          {item.onchain && " · onchain"}
          {item.txHash && (
            <>
              {" · "}
              <TxLink hash={item.txHash} />
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export function ActivityTimeline({ items }: { items: Item[] }) {
  const now = useNow();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const groups = group(items);
  return (
    <Panel title="Activity" right={<span className="text-[11px] text-muted">onchain + agent journal</span>} className="min-h-0 flex-1">
      <ul className="scroll-slim min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {groups.length === 0 && <li className="text-sm text-muted">No activity yet.</li>}
        {groups.map((g) => (
          <li key={g.key} className="space-y-1.5">
            <Row item={g.head} now={now} />
            {g.rest.length > 0 && (
              <>
                <button className="pl-7 text-[11px] text-accent-2 hover:underline" onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))} aria-expanded={!!open[g.key]}>
                  {open[g.key] ? "Hide" : `+${g.rest.length} more from this run`}
                </button>
                {open[g.key] && g.rest.map((it) => <Row key={it.id} item={it} now={now} sub />)}
              </>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
