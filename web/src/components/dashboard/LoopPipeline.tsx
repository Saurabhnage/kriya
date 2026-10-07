"use client";

import type { LoopStep, RunView } from "@/lib/client";
import { Panel, relTime, TxLink, useNow } from "./shared";

const NODES = ["OBSERVE", "VERIFY", "DETECT", "DECIDE", "CONSTRAIN", "EXECUTE"] as const;
const BLURB: Record<(typeof NODES)[number], string> = {
  OBSERVE: "Read risk feed & chain",
  VERIFY: "Write verified risk onchain",
  DETECT: "Check the mandate",
  DECIDE: "Propose an allocation",
  CONSTRAIN: "Re-validate the proposal",
  EXECUTE: "Contract enforces & moves funds",
};

type NodeState = "idle" | "running" | LoopStep["status"];

const STYLE: Record<NodeState, { box: string; mark: string; text: string }> = {
  idle: { box: "border-line bg-bg/40", mark: "○", text: "text-muted" },
  running: { box: "border-accent-2/70 bg-accent-2/5 node-running", mark: "◌", text: "text-accent-2" },
  ok: { box: "border-accent/50 bg-accent/5 node-in", mark: "✓", text: "text-accent" },
  skip: { box: "border-line bg-bg/40 node-in", mark: "–", text: "text-muted" },
  warn: { box: "border-warn/60 bg-warn/5 node-in", mark: "⚠", text: "text-warn" },
  error: { box: "border-danger/60 bg-danger/5 node-in", mark: "✗", text: "text-danger" },
};

export function LoopPipeline({ live, running, lastRun }: { live: LoopStep[] | null; running: boolean; lastRun: RunView | null }) {
  const now = useNow();
  const steps = live ?? lastRun?.steps ?? [];
  const latest = (node: string) => [...steps].reverse().find((s) => s.step === node);
  const firstMissing = NODES.findIndex((n) => !latest(n));
  const failure = steps.find((s) => s.step === "ERROR");

  const header = running ? (
    <span className="font-mono text-xs text-accent-2">● running now · KRIYA keeper</span>
  ) : live ? (
    <span className="font-mono text-xs text-muted">just ran · KRIYA keeper</span>
  ) : lastRun ? (
    <span className="font-mono text-xs text-muted">
      last run {relTime(lastRun.ts, now)} ·{" "}
      <span className={lastRun.source === "CRE" ? "text-accent-2" : "text-muted"}>{lastRun.source === "CRE" ? "Chainlink CRE" : "KRIYA keeper"}</span>
    </span>
  ) : (
    <span className="text-xs text-muted">no loop has run yet</span>
  );

  return (
    <Panel title="Autonomous loop" right={header}>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Loop pipeline">
        {NODES.map((node, i) => {
          const step = latest(node);
          const state: NodeState = step ? step.status : running && i === firstMissing ? "running" : "idle";
          const st = STYLE[state];
          return (
            <li key={`${node}-${step?.detail ?? state}`} className={`relative flex min-h-[96px] flex-col rounded-xl border p-2.5 transition-colors ${st.box}`}>
              <div className="flex items-center justify-between">
                <span className={`font-mono text-[11px] font-semibold tracking-wide ${st.text}`}>
                  <span className="mr-1 text-muted">{i + 1}</span>
                  {node}
                </span>
                <span className={`text-sm ${st.text}`} aria-label={state}>
                  {st.mark}
                </span>
              </div>
              <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted" title={step?.detail ?? BLURB[node]}>
                {step?.detail ?? BLURB[node]}
              </p>
              {step?.txHash && <TxLink hash={step.txHash} className="mt-auto pt-1 text-[11px]" />}
            </li>
          );
        })}
      </ol>
      {failure && <p className="mt-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">Loop stopped: {failure.detail}</p>}
    </Panel>
  );
}
