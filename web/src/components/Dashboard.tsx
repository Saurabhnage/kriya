"use client";

import { useState } from "react";
import type { Address } from "viem";
import { readNdjson } from "@/lib/stream";
import type { Decision, LoopStep, ProposalResponse, StateResponse } from "@/lib/client";
import { api } from "@/lib/client";
import { useToast } from "./Toasts";
import { MandateCard } from "./dashboard/MandateCard";
import { AllocationPanel } from "./dashboard/AllocationPanel";
import { LoopPipeline } from "./dashboard/LoopPipeline";
import { DecisionCard } from "./dashboard/DecisionCard";
import { ActivityTimeline } from "./dashboard/ActivityTimeline";
import { StageBar } from "./dashboard/StageBar";
import { Panel } from "./dashboard/shared";
import { RiskChart } from "./charts/RiskChart";

type Props = {
  state: StateResponse;
  user: Address;
  readOnly?: boolean;
  refresh: () => void;
  onRunningChange?: (running: boolean) => void;
};

/** Mission control: one screen on desktop (≥1100px), stacked in priority order below that. */
export function Dashboard({ state, user, readOnly, refresh, onRunningChange }: Props) {
  const toast = useToast();
  const [live, setLive] = useState<LoopStep[] | null>(null);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<Decision | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // the newest of the server's latest decision and a preview requested from this screen
  const decision = preview && (!state.latestDecision || preview.ts > state.latestDecision.ts) ? preview : state.latestDecision;

  const setRun = (r: boolean) => {
    setRunning(r);
    onRunningChange?.(r);
  };

  async function runLoop() {
    setRun(true);
    setLive([]);
    try {
      const res = await fetch("/api/keeper/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Loop failed (${res.status})`);
      }
      await readNdjson<LoopStep & { done?: boolean }>(res.body, (line) => {
        if (line.done) return;
        setLive((prev) => [...(prev ?? []), line]);
        if (line.txHash) refresh();
        if (line.step === "EXECUTE" && line.status === "ok") toast.success("Allocation executed onchain");
        if (line.status === "error") toast.error(new Error(line.detail));
      });
    } catch (err) {
      toast.error(err);
    } finally {
      setRun(false);
      refresh();
    }
  }

  async function previewDecision() {
    setPreviewing(true);
    try {
      const p = await api<ProposalResponse>("/api/agent/propose", { user });
      setPreview({ ...p, ts: Date.now(), source: "AGENT" });
    } catch (err) {
      toast.error(err);
    } finally {
      setPreviewing(false);
      refresh();
    }
  }

  return (
    <>
      <div className="grid gap-3 pb-20 min-[1100px]:h-[calc(100vh-128px)] min-[1100px]:grid-cols-12 min-[1100px]:pb-0">
        {/* centre first in the DOM so the loop leads on small screens */}
        <div className="flex min-h-0 flex-col gap-3 min-[1100px]:order-2 min-[1100px]:col-span-6">
          <LoopPipeline live={live} running={running} lastRun={state.lastRun} />
          <DecisionCard decision={decision} state={state} previewing={previewing} />
          <Panel title="Portfolio risk over time" right={<span className="text-[11px] text-muted">after each execution · ◆ verified risk change</span>}>
            <div className="h-[132px]">
              <RiskChart points={state.riskHistory} max={state.snapshot.mandate.params.maxRisk} />
            </div>
          </Panel>
        </div>
        <div className="flex min-h-0 flex-col gap-3 min-[1100px]:order-1 min-[1100px]:col-span-3">
          <MandateCard state={state} />
          <AllocationPanel state={state} />
        </div>
        <div className="flex min-h-0 flex-col min-[1100px]:order-3 min-[1100px]:col-span-3 max-[1099px]:h-[520px]">
          <ActivityTimeline items={state.activity} />
        </div>
      </div>
      <StageBar
        state={state}
        readOnly={readOnly}
        running={running}
        previewing={previewing}
        onRun={runLoop}
        onPreview={previewDecision}
        refresh={refresh}
      />
    </>
  );
}
