"use client";

import { useState } from "react";
import { parseUnits, type Abi, type Address } from "viem";
import { DEMO_MANDATE, deployment } from "@/lib/config";
import { KriyaVaultAbi, MockUSDCAbi } from "@/lib/generated/abis";
import { shortName, usd, type StateResponse } from "@/lib/client";
import { useTx } from "./useTx";

type Props = { state: StateResponse; user: Address; readOnly?: boolean; onDone: () => void };

type SliderProps = { label: string; value: number; set: (n: number) => void; min: number; max: number; unit?: string; hint: string };

function Slider(p: SliderProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label">{p.label}</span>
        <span className="font-mono text-lg">
          {p.value}
          {p.unit}
        </span>
      </div>
      <input type="range" className="w-full" min={p.min} max={p.max} value={p.value} onChange={(e) => p.set(Number(e.target.value))} />
      <p className="text-xs text-muted">{p.hint}</p>
    </div>
  );
}

export function MandateBuilder({ state, user, readOnly, onDone }: Props) {
  const { strategies } = state.snapshot;
  const [capital, setCapital] = useState(DEMO_MANDATE.capital);
  const [objective, setObjective] = useState(DEMO_MANDATE.objective);
  const [maxRisk, setMaxRisk] = useState(DEMO_MANDATE.maxRisk);
  const [maxExposure, setMaxExposure] = useState(DEMO_MANDATE.maxExposureBps / 100);
  const [maxDrawdown, setMaxDrawdown] = useState(DEMO_MANDATE.maxDrawdownBps / 100);
  const [minReserve, setMinReserve] = useState(DEMO_MANDATE.minReserveBps / 100);
  const [autoRebalance, setAutoRebalance] = useState(true);
  const [allowed, setAllowed] = useState<string[]>(strategies.map((s) => s.address));
  const { send, busy, error } = useTx();

  async function program() {
    const amount = parseUnits(String(capital), 6);
    if (BigInt(state.snapshot.walletUsdc) < amount) {
      await send("Minting test USDC", {
        address: deployment.usdc,
        abi: MockUSDCAbi as Abi,
        functionName: "faucet",
        args: [user, amount],
      });
    }
    if (BigInt(state.snapshot.allowance) < amount) {
      await send("Approving vault", {
        address: deployment.usdc,
        abi: MockUSDCAbi as Abi,
        functionName: "approve",
        args: [deployment.vault, amount],
      });
    }
    await send("Programming mandate", {
      address: deployment.vault,
      abi: KriyaVaultAbi as Abi,
      functionName: "openMandate",
      args: [
        amount,
        {
          maxRisk,
          maxExposureBps: Math.round(maxExposure * 100),
          maxDrawdownBps: Math.round(maxDrawdown * 100),
          minReserveBps: Math.round(minReserve * 100),
          autoRebalance,
          objective,
        },
        allowed,
      ],
    });
    onDone();
  }

  return (
    <div className="card p-6 md:p-8">
      <p className="label">Step 1 · Program the objective</p>
      <h2 className="mt-2 text-2xl font-semibold">Don&apos;t tell your money what transaction to make. Tell it what outcome you want.</h2>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-5">
          <div>
            <span className="label">Capital (test USDC)</span>
            <input
              type="number"
              value={capital}
              min={1}
              max={10000}
              onChange={(e) => setCapital(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xl"
            />
            <p className="mt-1 text-xs text-muted">Wallet: {usd(state.snapshot.walletUsdc)} USDC · missing amount is minted from the testnet faucet</p>
          </div>
          <div>
            <span className="label">Objective</span>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2"
            >
              <option>Maximize risk-adjusted yield</option>
              <option>Preserve capital, earn stable yield</option>
              <option>Maximize yield within limits</option>
            </select>
          </div>
          <div>
            <span className="label">Allowed strategies</span>
            <div className="mt-2 space-y-2">
              {strategies.map((s) => (
                <label key={s.address} className="flex cursor-pointer items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allowed.includes(s.address)}
                      onChange={(e) =>
                        setAllowed(e.target.checked ? [...allowed, s.address] : allowed.filter((a) => a !== s.address))
                      }
                    />
                    {s.name}
                  </span>
                  <span className="font-mono text-xs text-muted">
                    {(s.apyBps / 100).toFixed(1)}% · risk {s.risk}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-5">
          <Slider label="Max risk" value={maxRisk} set={setMaxRisk} min={5} max={100} hint="No held strategy, and not the portfolio, may exceed this score" />
          <Slider label="Max strategy exposure" value={maxExposure} set={setMaxExposure} min={5} max={100} unit="%" hint="Cap per strategy" />
          <Slider label="Min USDC reserve" value={minReserve} set={setMinReserve} min={0} max={90} unit="%" hint="Liquidity requirement" />
          <Slider label="Max drawdown" value={maxDrawdown} set={setMaxDrawdown} min={1} max={50} unit="%" hint="Execution refused below the high-water mark minus this" />
          <label className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
            <span>Autonomous rebalancing</span>
            <input type="checkbox" checked={autoRebalance} onChange={(e) => setAutoRebalance(e.target.checked)} />
          </label>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button className="btn btn-primary" disabled={readOnly || !!busy || allowed.length === 0 || capital <= 0} onClick={() => program().catch(() => {})}>
          {readOnly ? "Connect your wallet to program a mandate" : busy ?? `Program mandate · ${capital.toLocaleString()} USDC`}
        </button>
        <span className="text-xs text-muted">
          One wallet flow: faucet (if needed) → approve → <code>KriyaVault.openMandate</code>. Allowed: {allowed.map((a) => shortName(strategies.find((s) => s.address === a)?.name ?? a)).join(", ")}
        </span>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
