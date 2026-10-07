"use client";

import { useState, useSyncExternalStore } from "react";
import type { Abi } from "viem";
import { deployment } from "@/lib/config";
import { ACTS, type Act } from "@/lib/act";
import { KriyaMandateAbi, KriyaVaultAbi } from "@/lib/generated/abis";
import { api, usd, type StateResponse } from "@/lib/client";
import { useTx } from "../useTx";
import { useToast } from "../Toasts";

const KEY = "kriya.stagebar.collapsed";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const readCollapsed = () => {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

type Action = "preview" | "run" | "spike" | "guard" | "reset";
const SUGGESTED: Record<string, Action | null> = { "1": null, "2": "run", "3": "guard", "4": "spike", "5": "run", done: "reset" };

type Props = {
  state: StateResponse;
  readOnly?: boolean;
  running: boolean;
  previewing: boolean;
  onRun: () => void;
  onPreview: () => void;
  refresh: () => void;
};

export function StageBar({ state, readOnly, running, previewing, onRun, onPreview, refresh }: Props) {
  const toast = useToast();
  const { send, busy: txBusy } = useTx();
  const [busy, setBusy] = useState<Action | null>(null);
  const [menu, setMenu] = useState(false);
  const stored = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const [collapsedLocal, setCollapsedLocal] = useState<boolean | null>(null);
  const collapsed = collapsedLocal ?? stored;
  const s = state.snapshot;
  const act: Act = state.act;
  const suggested = SUGGESTED[String(act)];
  const b = s.strategies.find((x) => x.name.startsWith("Strategy B"));
  const disabled = running || !!busy || !!txBusy;

  const toggle = () => {
    const next = !collapsed;
    setCollapsedLocal(next);
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {}
  };

  async function run(action: Action, fn: () => Promise<unknown>) {
    setBusy(action);
    try {
      await fn();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
      refresh();
    }
  }

  const button = (action: Action, label: string, onClick: () => void, extra = "") => (
    <button
      className={`btn whitespace-nowrap px-3 py-1.5 ${suggested === action ? "btn-primary ring-2 ring-accent/30" : ""} ${extra}`}
      disabled={disabled || (action === "preview" && previewing)}
      onClick={onClick}
      title={suggested === action ? "Suggested next step" : undefined}
    >
      {busy === action || (action === "run" && running) || (action === "preview" && previewing) ? "Working…" : label}
    </button>
  );

  const wallet = async (label: string, fn: () => Promise<unknown>) => {
    setMenu(false);
    try {
      await fn();
      toast.success(label);
    } catch (err) {
      toast.error(err);
    } finally {
      refresh();
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-line bg-[#0a0d12]/95 backdrop-blur min-[1100px]:fixed min-[1100px]:inset-x-0 min-[1100px]:bottom-0 min-[1100px]:z-40 min-[1100px]:mt-0 min-[1100px]:rounded-none min-[1100px]:border-x-0 min-[1100px]:border-b-0">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 min-[1100px]:h-[60px] min-[1100px]:flex-nowrap">
        <button className="label shrink-0 hover:text-ink" onClick={toggle} aria-expanded={!collapsed}>
          {collapsed ? "▴ Demo" : "▾ Demo"}
        </button>
        <ol className="flex flex-wrap items-center gap-1 min-[1100px]:shrink-0" aria-label="Demo acts">
          {ACTS.map((a, i) => {
            const current = a.id === act;
            const passed = act === "done" || (typeof a.id === "number" && typeof act === "number" && a.id < act);
            return (
              <li key={String(a.id)} className="flex items-center gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${current ? "bg-accent text-[#04130d]" : passed ? "text-accent" : "text-muted"}`}
                  aria-current={current ? "step" : undefined}
                  title={current ? `Next: ${a.next}` : undefined}
                >
                  {passed && !current ? "✓ " : typeof a.id === "number" ? `${a.id} ` : ""}
                  {a.label}
                </span>
                {i < ACTS.length - 1 && <span className="text-[10px] text-line">›</span>}
              </li>
            );
          })}
        </ol>
        {!collapsed && (
          <>
            <span className="hidden truncate text-xs text-muted min-[1700px]:inline">Next: {ACTS.find((a) => a.id === act)?.next}</span>
            <div className="ml-auto flex flex-wrap items-center gap-2 min-[1100px]:flex-nowrap">
              {button("preview", "Preview decision", onPreview)}
              {button("run", "Run loop", onRun)}
              {b &&
                button("spike", "Spike B → 48", () =>
                  run("spike", async () => {
                    await api("/api/risk-feed", { strategy: b.address, risk: 48 });
                    toast.info("Reality changed: Strategy B risk 48 in the external feed. Nothing is onchain until the loop verifies it.");
                  }),
                  "btn-warn",
                )}
              {button("guard", "Guardrail test", () =>
                run("guard", async () => {
                  const r = await api<{ hash: string; status: string; reason: string }>("/api/agent/guardrail", { user: s.user });
                  toast.success(`Unsafe 60% proposal ${r.status === "reverted" ? "reverted onchain" : r.status}: ${r.reason}`);
                }),
              )}
              {button("reset", "Reset feed", () =>
                run("reset", async () => {
                  await api("/api/risk-feed", { reset: true });
                  toast.info("External risk feed reset to baseline. Run loop to verify it onchain.");
                }),
              )}
              <div className="relative">
                <button className="btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} title="Human override">
                  ⋯
                </button>
                {menu && (
                  <div role="menu" className="absolute right-0 bottom-12 z-50 w-64 rounded-xl border border-line bg-panel p-2 shadow-xl">
                    <p className="px-2 pb-1 text-[11px] text-muted">
                      {readOnly ? "Read-only: connect the owner's wallet to use these." : "Human override — you keep final authority."}
                    </p>
                    <button
                      role="menuitem"
                      className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-panel-2 disabled:opacity-40"
                      disabled={readOnly || disabled}
                      onClick={() =>
                        wallet(s.mandate.active ? "Agent paused" : "Agent resumed", () =>
                          send(s.mandate.active ? "Pausing agent" : "Resuming agent", {
                            address: deployment.mandate,
                            abi: KriyaMandateAbi as Abi,
                            functionName: "setActive",
                            args: [!s.mandate.active],
                          }),
                        )
                      }
                    >
                      {s.mandate.active ? "⏸ Pause agent" : "▶ Resume agent"}
                    </button>
                    <button
                      role="menuitem"
                      className="w-full rounded-lg px-2 py-2 text-left text-sm text-warn hover:bg-panel-2 disabled:opacity-40"
                      disabled={readOnly || disabled}
                      onClick={() =>
                        wallet("All capital moved back to the reserve; agent paused", async () => {
                          // pause first so the agent cannot redeploy the capital being pulled out
                          if (s.mandate.active) {
                            await send("Pausing agent", { address: deployment.mandate, abi: KriyaMandateAbi as Abi, functionName: "setActive", args: [false] });
                          }
                          await send("Exiting to reserve", { address: deployment.vault, abi: KriyaVaultAbi as Abi, functionName: "emergencyExit" });
                        })
                      }
                    >
                      ■ Emergency exit to reserve
                    </button>
                    <button
                      role="menuitem"
                      className="w-full rounded-lg px-2 py-2 text-left text-sm text-danger hover:bg-panel-2 disabled:opacity-40"
                      disabled={readOnly || disabled || BigInt(s.idle) === 0n}
                      onClick={() =>
                        wallet("Reserve withdrawn to your wallet", () =>
                          send("Withdrawing", { address: deployment.vault, abi: KriyaVaultAbi as Abi, functionName: "withdraw", args: [BigInt(s.idle)] }),
                        )
                      }
                    >
                      ↑ Withdraw reserve (${usd(s.idle)})
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        {txBusy && <span className="text-xs text-muted">{txBusy}… confirm in your wallet</span>}
      </div>
    </div>
  );
}
