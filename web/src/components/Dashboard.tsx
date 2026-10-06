"use client";

import { useState } from "react";
import type { Abi, Address } from "viem";
import { deployment, txUrl, addressUrl } from "@/lib/config";
import { KriyaMandateAbi, KriyaVaultAbi } from "@/lib/generated/abis";
import { api, short, shortName, usd, type LoopStep, type ProposalResponse, type StateResponse } from "@/lib/client";
import { useTx } from "./useTx";

const COLORS = ["#7cf7c4", "#5aa8ff", "#c38bff", "#ffb547", "#ff7aa8"];
const RESERVE_COLOR = "#3a4658";

type Props = { state: StateResponse; user: Address; refresh: () => void };

export function Dashboard({ state, user, refresh }: Props) {
  const { snapshot: s, feed, pending, activity } = state;
  const p = s.mandate.params;
  const total = BigInt(s.total);
  const colorOf = (addr: string) => COLORS[s.strategies.findIndex((x) => x.address === addr) % COLORS.length];

  const rows = s.strategies.map((st) => {
    const amount = BigInt(s.positions.find((x) => x.strategy === st.address)?.amount ?? "0");
    const feedRisk = feed.risks[st.address.toLowerCase()] ?? st.risk;
    return { ...st, amount, share: total ? Number((amount * 10000n) / total) / 100 : 0, feedRisk };
  });
  const reserveShare = total ? Number((BigInt(s.idle) * 10000n) / total) / 100 : 0;
  const expectedApy = rows.reduce((a, r) => a + (r.share * r.apyBps) / 10000, 0);

  const status = !s.mandate.active
    ? { label: "PAUSED", tone: "text-muted border-line", sub: "Agent authority suspended by user" }
    : s.health.violated
      ? { label: "⚠ MANDATE AT RISK", tone: "text-warn border-warn/40 pulse-warn", sub: "Verified onchain — rebalance required" }
      : pending?.violated
        ? { label: "⚠ MANDATE AT RISK", tone: "text-warn border-warn/40 pulse-warn", sub: "External risk signal — awaiting verification" }
        : { label: "✓ SAFE", tone: "text-accent border-accent/30", sub: "All constraints satisfied" };

  return (
    <div className="space-y-6">
      {/* Top line */}
      <section className="grid gap-4 md:grid-cols-4">
        <Stat label="Capital" value={`$${usd(s.total)}`} sub={`USDC · ${s.executionCount} executions`} />
        <Stat label="Expected yield" value={`${expectedApy.toFixed(2)}%`} sub="weighted APY of allocation" />
        <Stat
          label="Risk"
          value={
            <span>
              {s.health.portfolioRisk}
              <span className="text-muted"> / {p.maxRisk}</span>
            </span>
          }
          sub={pending && pending.portfolioRisk !== s.health.portfolioRisk ? `unverified feed view: ${pending.portfolioRisk}` : "portfolio, verified scores"}
        />
        <div className={`card flex flex-col justify-center border px-5 py-4 ${status.tone}`}>
          <p className="label">Mandate</p>
          <p className="mt-1 text-xl font-bold">{status.label}</p>
          <p className="text-xs text-muted">{status.sub}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-5">
        {/* Allocation */}
        <div className="card p-6 lg:col-span-3">
          <div className="flex items-baseline justify-between">
            <p className="label">Allocation</p>
            <p className="text-xs text-muted">{p.objective}</p>
          </div>
          <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-bg">
            {rows.filter((r) => r.share > 0).map((r) => (
              <div key={r.address} style={{ width: `${r.share}%`, background: colorOf(r.address) }} className="transition-all duration-700" title={`${r.name} ${r.share}%`} />
            ))}
            {reserveShare > 0 && <div style={{ width: `${reserveShare}%`, background: RESERVE_COLOR }} className="transition-all duration-700" />}
          </div>
          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="label text-left">
                <th className="pb-2 font-normal">Strategy</th>
                <th className="pb-2 text-right font-normal">APY</th>
                <th className="pb-2 text-right font-normal">Risk</th>
                <th className="pb-2 text-right font-normal">Weight</th>
                <th className="pb-2 text-right font-normal">USDC</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map((r) => {
                const over = r.risk > p.maxRisk;
                return (
                  <tr key={r.address} className="border-t border-line">
                    <td className="py-2.5 font-sans">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorOf(r.address) }} />
                      {r.name}
                      {!s.mandate.allowed.includes(r.address) && <span className="ml-2 text-xs text-muted">(not allowed)</span>}
                    </td>
                    <td className="text-right">{(r.apyBps / 100).toFixed(1)}%</td>
                    <td className={`text-right ${over ? "text-danger" : ""}`}>
                      {r.risk}
                      {r.feedRisk !== r.risk && <span className="text-warn"> → {r.feedRisk}?</span>}
                    </td>
                    <td className="text-right">{r.share.toFixed(1)}%</td>
                    <td className="text-right">{usd(r.amount)}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-line">
                <td className="py-2.5 font-sans">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: RESERVE_COLOR }} />
                  USDC Reserve
                </td>
                <td className="text-right text-muted">—</td>
                <td className="text-right">2</td>
                <td className="text-right">{reserveShare.toFixed(1)}%</td>
                <td className="text-right">{usd(s.idle)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-muted md:grid-cols-4">
            <Constraint label="Max risk" value={`${p.maxRisk}`} ok={s.health.portfolioRisk <= p.maxRisk && s.health.maxHeldRisk <= p.maxRisk} />
            <Constraint label="Max exposure" value={`${p.maxExposureBps / 100}%`} ok={s.health.maxExposureBps <= p.maxExposureBps} />
            <Constraint label="Min reserve" value={`${p.minReserveBps / 100}%`} ok={!s.health.allocated || s.health.reserveBps >= p.minReserveBps} />
            <Constraint label="Auto rebalance" value={p.autoRebalance ? "ON" : "OFF"} ok />
          </div>
          {pending?.violated && (
            <p className="mt-4 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">{pending.reasons.join(" · ")}</p>
          )}
        </div>

        {/* Agent */}
        <AgentPanel user={user} hasCapital={total > 0n} refresh={refresh} state={state} />
      </section>

      <section className="grid gap-6 lg:grid-cols-5">
        <RealityConsole state={state} refresh={refresh} />
        <Activity items={activity} />
      </section>

      <Override user={user} state={state} refresh={refresh} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="card px-5 py-4">
      <p className="label">{label}</p>
      <p className="mt-1 font-mono text-2xl">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

function Constraint({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p>{label}</p>
      <p className={`font-mono text-sm ${ok ? "text-ink" : "text-danger"}`}>
        {ok ? "✓" : "✗"} {value}
      </p>
    </div>
  );
}

const LOOP = ["OBSERVE", "DETECT", "VERIFY", "DECIDE", "CONSTRAIN", "EXECUTE"];

function AgentPanel({ user, hasCapital, refresh, state }: { user: Address; hasCapital: boolean; refresh: () => void; state: StateResponse }) {
  const [proposal, setProposal] = useState<ProposalResponse | null>(null);
  const [steps, setSteps] = useState<LoopStep[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (a: string) => shortName(state.snapshot.strategies.find((s) => s.address.toLowerCase() === a.toLowerCase())?.name ?? a);

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      refresh();
    }
  }

  const done = new Set(steps?.map((x) => x.step));
  return (
    <div className="card flex flex-col p-6 lg:col-span-2">
      <p className="label">KRIYA agent · decision loop</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {LOOP.map((l) => {
          const st = steps?.find((x) => x.step === l);
          const tone = !st ? "border-line text-muted" : st.status === "error" ? "border-danger/50 text-danger" : st.status === "warn" ? "border-warn/50 text-warn" : st.status === "skip" ? "border-line text-muted" : "border-accent/40 text-accent";
          return (
            <span key={l} className={`rounded-md border px-2 py-1 font-mono text-[10px] ${tone}`}>
              {done.has(l) && st?.status !== "skip" ? "● " : ""}
              {l}
            </span>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="btn"
          disabled={!!busy || !hasCapital}
          onClick={() => run("Thinking…", async () => setProposal(await api<ProposalResponse>("/api/agent/propose", { user })))}
        >
          {busy === "Thinking…" ? busy : "Preview decision"}
        </button>
        <button
          className="btn btn-primary"
          disabled={!!busy || !hasCapital}
          onClick={() =>
            run("Running loop…", async () => {
              const r = await api<{ steps: LoopStep[] }>("/api/keeper/run", { user });
              setSteps(r.steps);
            })
          }
        >
          {busy === "Running loop…" ? busy : "Run autonomous loop"}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Primary path: Chainlink CRE workflow (<code>cre workflow simulate kriya-workflow --broadcast</code>). This button runs the identical loop from the KRIYA server as a fallback.
      </p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {steps && (
        <ol className="mt-4 space-y-1.5 text-xs">
          {steps.map((st, i) => (
            <li key={i} className="flex gap-2">
              <span className={`w-20 shrink-0 font-mono ${st.status === "error" ? "text-danger" : st.status === "warn" ? "text-warn" : st.status === "skip" ? "text-muted" : "text-accent"}`}>{st.step}</span>
              <span className="text-muted">
                {st.detail}
                {st.txHash && <TxLink hash={st.txHash} />}
              </span>
            </li>
          ))}
        </ol>
      )}

      {proposal && (
        <div className="mt-4 rounded-xl border border-line bg-bg/50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="label">{proposal.engine === "llm" ? `AI · ${proposal.model}` : "Deterministic optimizer"}</span>
            <span className={`font-mono text-xs ${proposal.validation.ok ? "text-accent" : "text-danger"}`}>
              {proposal.validation.ok ? `✓ valid · risk ${proposal.validation.portfolioRisk} · APY ${(proposal.validation.expectedApyBps / 100).toFixed(2)}%` : `✗ ${proposal.validation.error}`}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">{proposal.trigger}</p>
          <p className="mt-3 font-mono">
            {proposal.strategies.map((a, i) => `${name(a)} ${proposal.bps[i] / 100}%`).join(" · ")}
            {proposal.validation.ok && ` · Reserve ${proposal.validation.reserveBps / 100}%`}
          </p>
          <p className="mt-2">{proposal.rationale}</p>
          {proposal.llmRejected && (
            <p className="mt-2 text-xs text-warn">
              LLM output rejected ({proposal.llmRejected.error}: {proposal.llmRejected.detail}) → deterministic fallback used
            </p>
          )}
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {proposal.analysis.map((a) => (
              <li key={a.strategy}>
                <span className="text-ink">{name(a.strategy)}:</span> {a.assessment}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RealityConsole({ state, refresh }: { state: StateResponse; refresh: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const strategies = state.snapshot.strategies;
  const b = strategies.find((x) => x.name.startsWith("Strategy B"));

  async function setRisk(strategy: string, risk: number) {
    setBusy(strategy);
    try {
      await api("/api/risk-feed", { strategy, risk });
    } finally {
      setBusy(null);
      refresh();
    }
  }

  async function guardrail() {
    setBusy("guardrail");
    setResult(null);
    try {
      const r = await api<{ hash: string; status: string; reason: string }>("/api/agent/guardrail", { user: state.snapshot.user });
      setResult(`${r.status === "reverted" ? "Reverted onchain" : r.status}: ${r.reason}|${r.hash}`);
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      refresh();
    }
  }

  const [msg, hash] = (result ?? "").split("|");
  return (
    <div className="card p-6 lg:col-span-2">
      <p className="label">Demo console · change reality</p>
      <p className="mt-1 text-xs text-muted">
        Edits the external risk feed at <code>/api/risk-feed</code>. Nothing changes onchain until CRE (or the keeper) verifies it.
      </p>
      <div className="mt-4 space-y-3">
        {strategies.map((st) => {
          const v = state.feed.risks[st.address.toLowerCase()] ?? st.risk;
          return (
            <div key={st.address} className="flex items-center gap-3">
              <span className="w-24 text-sm">{shortName(st.name)}</span>
              <input
                type="range"
                min={0}
                max={100}
                defaultValue={v}
                key={`${st.address}-${v}`}
                className="flex-1"
                onMouseUp={(e) => setRisk(st.address, Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => setRisk(st.address, Number((e.target as HTMLInputElement).value))}
              />
              <span className="w-8 text-right font-mono text-sm">{v}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {b && (
          <button className="btn btn-warn" disabled={!!busy} onClick={() => setRisk(b.address, 48)}>
            Spike Strategy B risk → 48
          </button>
        )}
        <button className="btn" disabled={!!busy} onClick={() => api("/api/risk-feed", { reset: true }).finally(refresh)}>
          Reset feed
        </button>
        <button className="btn btn-danger" disabled={!!busy || !state.snapshot.mandate.exists} onClick={guardrail}>
          {busy === "guardrail" ? "Submitting…" : "Guardrail test: submit unsafe proposal"}
        </button>
      </div>
      {result && (
        <p className="mt-3 text-xs text-muted">
          {msg}
          {hash && <TxLink hash={hash} />}
        </p>
      )}
    </div>
  );
}

const ICON: Record<string, string> = {
  deposit: "↓",
  withdraw: "↑",
  mandate: "◆",
  execute: "⚡",
  "risk-up": "⚠",
  "risk-down": "✓",
  decide: "✦",
  constrain: "✓",
  reject: "✗",
  reality: "◎",
  guardrail: "⛨",
  verify: "✓",
  observe: "⚠",
  override: "■",
};

function Activity({ items }: { items: StateResponse["activity"] }) {
  return (
    <div className="card p-6 lg:col-span-3">
      <div className="flex items-baseline justify-between">
        <p className="label">KRIYA activity</p>
        <p className="text-xs text-muted">onchain events + agent journal</p>
      </div>
      <ul className="mt-4 max-h-[460px] space-y-3 overflow-y-auto pr-2">
        {items.length === 0 && <li className="text-sm text-muted">No activity yet.</li>}
        {items.map((i) => (
          <li key={i.id} className="flex gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                ["risk-up", "observe", "reality"].includes(i.kind) ? "border-warn/40 text-warn" : ["reject", "guardrail"].includes(i.kind) ? "border-danger/40 text-danger" : "border-accent/30 text-accent"
              }`}
            >
              {ICON[i.kind] ?? "•"}
            </span>
            <div className="min-w-0 text-sm">
              <p>
                {i.title}
                {i.source && (
                  <span className={`ml-2 rounded px-1.5 py-0.5 font-mono text-[10px] ${i.source === "CRE" ? "bg-accent-2/15 text-accent-2" : "bg-line text-muted"}`}>
                    {i.source === "CRE" ? "CHAINLINK CRE" : "AGENT"}
                  </span>
                )}
                {i.onchain && <span className="ml-1 font-mono text-[10px] text-muted">onchain</span>}
              </p>
              {i.detail && <p className="break-words text-xs text-muted">{i.detail}</p>}
              <p className="font-mono text-[10px] text-muted">
                {new Date(i.ts).toLocaleTimeString()}
                {i.txHash && <TxLink hash={i.txHash} />}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Override({ user, state, refresh }: { user: Address; state: StateResponse; refresh: () => void }) {
  const { send, busy, error } = useTx();
  const s = state.snapshot;
  const act = (label: string, req: Parameters<typeof send>[1]) => send(label, req).catch(() => {}).finally(refresh);
  return (
    <section className="card flex flex-wrap items-center justify-between gap-4 p-6">
      <div>
        <p className="label">Human override</p>
        <p className="text-sm text-muted">
          You keep final authority. The agent can never withdraw: funds move only between the vault and allowlisted strategies.
        </p>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn"
          disabled={!!busy}
          onClick={() => act("Updating mandate", { address: deployment.mandate, abi: KriyaMandateAbi as Abi, functionName: "setActive", args: [!s.mandate.active] })}
        >
          {s.mandate.active ? "Pause agent" : "Resume agent"}
        </button>
        <button className="btn btn-warn" disabled={!!busy} onClick={() => act("Exiting", { address: deployment.vault, abi: KriyaVaultAbi as Abi, functionName: "emergencyExit" })}>
          Emergency exit to reserve
        </button>
        <button
          className="btn btn-danger"
          disabled={!!busy || BigInt(s.idle) === 0n}
          onClick={() => act("Withdrawing", { address: deployment.vault, abi: KriyaVaultAbi as Abi, functionName: "withdraw", args: [BigInt(s.idle)] })}
        >
          Withdraw reserve (${usd(s.idle)})
        </button>
        {busy && <span className="self-center text-xs text-muted">{busy}…</span>}
      </div>
      <p className="w-full font-mono text-[10px] text-muted">
        user {short(user)} · executor{" "}
        {addressUrl(deployment.executor) ? (
          <a className="underline" href={addressUrl(deployment.executor)!} target="_blank">
            {short(deployment.executor)}
          </a>
        ) : (
          short(deployment.executor)
        )}{" "}
        · vault {short(deployment.vault)} · block {s.block}
      </p>
    </section>
  );
}

function TxLink({ hash }: { hash: string }) {
  const url = txUrl(hash);
  return url ? (
    <a href={url} target="_blank" className="ml-2 font-mono text-accent-2 underline">
      {short(hash)}
    </a>
  ) : (
    <span className="ml-2 font-mono">{short(hash)}</span>
  );
}
