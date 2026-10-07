"use client";

import { useState } from "react";
import type { Decision, StateResponse } from "@/lib/client";
import { colorFor, Panel, relTime, strategyName, useNow } from "./shared";

export function DecisionCard({ decision, state, previewing }: { decision: Decision | null; state: StateResponse; previewing: boolean }) {
  const now = useNow();
  const [open, setOpen] = useState(false);

  if (!decision) {
    return (
      <Panel title="Latest decision" className="min-h-0 flex-1">
        <p className="text-sm text-muted">
          {previewing ? "Thinking…" : "No decision yet. Press Preview decision or Run loop: the engine proposes an allocation here, with its reasoning, before anything touches the chain."}
        </p>
      </Panel>
    );
  }

  const v = decision.validation;
  return (
    <Panel
      title="Latest decision"
      className="min-h-0 flex-1"
      right={
        <span className="font-mono text-xs text-muted">
          {decision.engine === "llm" ? `Claude · ${decision.model}` : "Deterministic optimizer"} · {decision.source === "CRE" ? "via Chainlink CRE" : "via KRIYA"} · {relTime(decision.ts, now)}
        </span>
      }
    >
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto pr-1">
        <p className="text-xs text-muted">{decision.trigger}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {decision.strategies.map((s, i) => (
            <span key={s} className="rounded-full border border-line px-2.5 py-0.5 font-mono text-xs">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: colorFor(state, s) }} />
              {strategyName(state, s)} {decision.bps[i] / 100}%
            </span>
          ))}
          {v.ok && <span className="rounded-full border border-line px-2.5 py-0.5 font-mono text-xs text-muted">Reserve {v.reserveBps / 100}%</span>}
          <span className={`ml-auto rounded-full px-2.5 py-0.5 font-mono text-xs ${v.ok ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"}`}>
            {v.ok ? `✓ policy · risk ${v.portfolioRisk} · APY ${(v.expectedApyBps / 100).toFixed(2)}%` : `✗ ${v.error}`}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed">{decision.rationale}</p>
        {decision.llmRejected && decision.llmRejected.error !== "LLMUnavailable" && (
          <p className="mt-2 text-xs text-warn">
            Claude&apos;s first proposal was rejected by the policy engine ({decision.llmRejected.error}); the deterministic optimizer was used.
          </p>
        )}
        {decision.analysis.length > 0 && (
          <div className="mt-3">
            <button className="text-xs text-accent-2 hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? "Hide" : "Show"} per-strategy assessment
            </button>
            {open && (
              <ul className="mt-2 space-y-1.5 text-xs text-muted">
                {decision.analysis.map((a) => (
                  <li key={a.strategy}>
                    <span className="text-ink">{strategyName(state, a.strategy)}:</span> {a.assessment}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
