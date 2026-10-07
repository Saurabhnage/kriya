"use client";

import { useMemo, useState } from "react";
import { parseUnits, type Abi, type Address } from "viem";
import { DEMO_MANDATE, deployment } from "@/lib/config";
import { KriyaVaultAbi, MockUSDCAbi } from "@/lib/generated/abis";
import { optimizeAllocation, validateAllocation, type MandateParams } from "@/lib/policy";
import { usd, type StateResponse } from "@/lib/client";
import { useTx } from "./useTx";
import { useToast } from "./Toasts";
import { Donut } from "./charts/Donut";
import { COLORS, RESERVE_COLOR, TxLink } from "./dashboard/shared";

const FAUCET_LIMIT = 10_000;

type Props = { state: StateResponse; user: Address; readOnly?: boolean; onDone: () => void };

type SliderProps = { label: string; value: number; set: (n: number) => void; min: number; max: number; unit?: string; hint: string };

function Slider(p: SliderProps) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="label">{p.label}</span>
        <span className="font-mono text-lg">
          {p.value}
          {p.unit}
        </span>
      </span>
      <input type="range" className="w-full" min={p.min} max={p.max} value={p.value} onChange={(e) => p.set(Number(e.target.value))} />
      <span className="text-xs text-muted">{p.hint}</span>
    </label>
  );
}

type StepId = "mint" | "approve" | "open";
type StepState = { status: "idle" | "pending" | "done" | "skipped" | "error"; hash?: string };
const STEP_LABEL: Record<StepId, string> = { mint: "Mint test USDC", approve: "Approve the vault", open: "Open the mandate" };

export function MandateBuilder({ state, user, readOnly, onDone }: Props) {
  const toast = useToast();
  const { strategies } = state.snapshot;
  const [capital, setCapital] = useState(DEMO_MANDATE.capital);
  const [objective, setObjective] = useState(DEMO_MANDATE.objective);
  const [maxRisk, setMaxRisk] = useState(DEMO_MANDATE.maxRisk);
  const [maxExposure, setMaxExposure] = useState(DEMO_MANDATE.maxExposureBps / 100);
  const [maxDrawdown, setMaxDrawdown] = useState(DEMO_MANDATE.maxDrawdownBps / 100);
  const [minReserve, setMinReserve] = useState(DEMO_MANDATE.minReserveBps / 100);
  const [autoRebalance, setAutoRebalance] = useState(true);
  const [allowed, setAllowed] = useState<string[]>(strategies.map((s) => s.address));
  const [steps, setSteps] = useState<Record<StepId, StepState>>({ mint: { status: "idle" }, approve: { status: "idle" }, open: { status: "idle" } });
  const [working, setWorking] = useState(false);
  const { send } = useTx();

  const params: MandateParams = useMemo(
    () => ({
      maxRisk,
      maxExposureBps: Math.round(maxExposure * 100),
      maxDrawdownBps: Math.round(maxDrawdown * 100),
      minReserveBps: Math.round(minReserve * 100),
      autoRebalance,
      objective,
    }),
    [maxRisk, maxExposure, maxDrawdown, minReserve, autoRebalance, objective],
  );

  // What KRIYA would do with these limits, computed in the browser by the same policy engine
  const preview = useMemo(() => {
    const allocation = optimizeAllocation(params, allowed, strategies);
    return { allocation, validation: validateAllocation(params, allowed, strategies, allocation) };
  }, [params, allowed, strategies]);

  const capitalError =
    !Number.isFinite(capital) || capital <= 0
      ? "Enter an amount above 0"
      : capital - Number(state.snapshot.walletUsdc) / 1e6 > FAUCET_LIMIT
        ? `The test USDC faucet mints at most ${FAUCET_LIMIT.toLocaleString()} at a time`
        : !/^\d+(\.\d{1,6})?$/.test(String(capital))
          ? "USDC has at most 6 decimals"
          : null;

  const setStep = (id: StepId, s: StepState) => setSteps((prev) => ({ ...prev, [id]: s }));

  async function program() {
    setWorking(true);
    const amount = parseUnits(String(capital), 6);
    const balance = BigInt(state.snapshot.walletUsdc);
    const plan: { id: StepId; needed: boolean; run: () => Promise<`0x${string}`> }[] = [
      {
        id: "mint",
        needed: balance < amount && steps.mint.status !== "done",
        run: () => send("Minting test USDC", { address: deployment.usdc, abi: MockUSDCAbi as Abi, functionName: "faucet", args: [user, amount - balance] }),
      },
      {
        id: "approve",
        needed: BigInt(state.snapshot.allowance) < amount && steps.approve.status !== "done",
        run: () => send("Approving vault", { address: deployment.usdc, abi: MockUSDCAbi as Abi, functionName: "approve", args: [deployment.vault, amount] }),
      },
      {
        id: "open",
        needed: true,
        run: () => send("Programming mandate", { address: deployment.vault, abi: KriyaVaultAbi as Abi, functionName: "openMandate", args: [amount, params, allowed] }),
      },
    ];
    try {
      for (const step of plan) {
        if (!step.needed) {
          if (steps[step.id].status !== "done") setStep(step.id, { status: "skipped" });
          continue;
        }
        setStep(step.id, { status: "pending" });
        try {
          const hash = await step.run();
          setStep(step.id, { status: "done", hash });
        } catch (err) {
          setStep(step.id, { status: "error" });
          throw err;
        }
      }
      toast.success("Mandate programmed. KRIYA is now authorized within your limits.");
      onDone();
    } catch (err) {
      toast.error(err);
    } finally {
      setWorking(false);
    }
  }

  const colorOf = (addr: string) => COLORS[strategies.findIndex((s) => s.address === addr) % COLORS.length];
  const v = preview.validation;
  const slices = [
    ...preview.allocation.map((a) => ({ label: strategies.find((s) => s.address === a.strategy)?.name.split(" - ")[0] ?? "?", value: a.bps, color: colorOf(a.strategy) })),
    ...(v.ok && v.reserveBps > 0 ? [{ label: "USDC Reserve", value: v.reserveBps, color: RESERVE_COLOR }] : []),
  ];

  return (
    <div className="mx-auto grid max-w-6xl gap-4 py-2 lg:grid-cols-5">
      <section className="card p-6 lg:col-span-3">
        <p className="label">Act 1 · Program the objective</p>
        <h1 className="mt-2 text-2xl font-semibold">Don&apos;t tell your money what transaction to make. Tell it what outcome you want.</h1>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="label">Capital (test USDC)</span>
            <input
              type="number"
              value={capital}
              min={1}
              max={10000}
              onChange={(e) => setCapital(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xl"
            />
            {capitalError && <span className="mt-1 block text-xs text-danger">{capitalError}</span>}
            <span className="mt-1 block text-xs text-muted">Wallet: {usd(state.snapshot.walletUsdc)} USDC · any shortfall is minted from the testnet faucet</span>
          </label>
          <label className="block">
            <span className="label">Objective</span>
            <select value={objective} onChange={(e) => setObjective(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2.5">
              <option>Maximize risk-adjusted yield</option>
              <option>Preserve capital, earn stable yield</option>
              <option>Maximize yield within limits</option>
            </select>
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="label">Allowed strategies</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {strategies.map((s) => (
              <label key={s.address} className="flex cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2 hover:border-[#2d3a4b]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={allowed.includes(s.address)}
                  onChange={(e) => setAllowed(e.target.checked ? [...allowed, s.address] : allowed.filter((a) => a !== s.address))}
                />
                <span className="text-sm">
                  {s.name.split(" - ")[0]}
                  <span className="block font-mono text-[11px] text-muted">
                    {(s.apyBps / 100).toFixed(1)}% · risk {s.risk}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Slider label="Max risk" value={maxRisk} set={setMaxRisk} min={5} max={100} hint="No held strategy, and not the portfolio, may exceed it" />
          <Slider label="Max strategy exposure" value={maxExposure} set={setMaxExposure} min={5} max={100} unit="%" hint="Cap per strategy" />
          <Slider label="Min USDC reserve" value={minReserve} set={setMinReserve} min={0} max={90} unit="%" hint="Liquidity kept in reserve" />
          <Slider label="Max drawdown" value={maxDrawdown} set={setMaxDrawdown} min={1} max={50} unit="%" hint="Execution refused below this loss" />
        </div>
        <label className="mt-5 flex items-center justify-between rounded-lg border border-line px-3 py-2">
          <span>Autonomous rebalancing</span>
          <input type="checkbox" checked={autoRebalance} onChange={(e) => setAutoRebalance(e.target.checked)} />
        </label>
      </section>

      <aside className="flex flex-col gap-4 lg:col-span-2">
        <section className="card p-6">
          <p className="label">Live preview · what KRIYA would do</p>
          <div className="mt-4 flex items-center gap-5">
            <Donut
              slices={slices.length ? slices : [{ label: "Reserve", value: 1, color: RESERVE_COLOR }]}
              size={128}
              thickness={14}
              center={
                <>
                  <span className="font-mono text-lg">{v.ok ? v.portfolioRisk : "—"}</span>
                  <span className="text-[10px] text-muted">risk</span>
                </>
              }
            />
            <ul className="flex-1 space-y-1 text-sm">
              {slices.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="flex-1">{s.label}</span>
                  <span className="font-mono">{s.value / 100}%</span>
                </li>
              ))}
            </ul>
          </div>
          {v.ok ? (
            <p className="mt-4 text-sm text-muted">
              Expected APY <span className="font-mono text-ink">{(v.expectedApyBps / 100).toFixed(2)}%</span> · portfolio risk{" "}
              <span className="font-mono text-ink">{v.portfolioRisk}</span> / {maxRisk}. Live decisions come from Claude within these same limits.
            </p>
          ) : (
            <p className="mt-4 text-sm text-danger">These limits can&apos;t be satisfied: {v.detail}</p>
          )}
        </section>

        <section className="card p-6">
          <p className="label">Your wallet signs</p>
          <ol className="mt-3 space-y-2">
            {(Object.keys(STEP_LABEL) as StepId[]).map((id, i) => {
              const st = steps[id];
              const mark = { idle: "○", pending: "◌", done: "✓", skipped: "–", error: "✗" }[st.status];
              const tone = { idle: "text-muted", pending: "text-accent-2", done: "text-accent", skipped: "text-muted", error: "text-danger" }[st.status];
              return (
                <li key={id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${st.status === "pending" ? "node-running border-accent-2/60" : "border-line"}`}>
                  <span className={`w-4 text-center ${tone}`}>{mark}</span>
                  <span className="flex-1 text-sm">
                    {i + 1}. {STEP_LABEL[id]}
                    {st.status === "skipped" && <span className="ml-2 text-xs text-muted">not needed</span>}
                    {st.status === "pending" && <span className="ml-2 text-xs text-accent-2">confirm in your wallet…</span>}
                  </span>
                  {st.hash && <TxLink hash={st.hash} className="text-xs" />}
                </li>
              );
            })}
          </ol>
          <button
            className="btn btn-primary mt-4 w-full"
            disabled={readOnly || working || allowed.length === 0 || !!capitalError || !v.ok}
            onClick={() => program()}
          >
            {readOnly ? "Connect your wallet to program a mandate" : working ? "Waiting for your wallet…" : `Program mandate · ${capital.toLocaleString()} USDC`}
          </button>
          <p className="mt-2 text-xs text-muted">Steps you already completed are skipped if you retry.</p>
        </section>
      </aside>
    </div>
  );
}
