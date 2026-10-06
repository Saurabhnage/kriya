"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { chain } from "@/lib/config";
import { api, short, type StateResponse } from "@/lib/client";
import { MandateBuilder } from "@/components/MandateBuilder";
import { Dashboard } from "@/components/Dashboard";

const noSubscribe = () => () => {};
function readViewParam(): Address | null {
  const v = new URLSearchParams(window.location.search).get("view");
  return v && isAddress(v) ? v : null;
}

export default function Home() {
  const account = useAccount();
  // ?view=0x… opens any mandate read-only (judges / sharing); a connected wallet takes over
  const viewAs = useSyncExternalStore(noSubscribe, readViewParam, () => null);
  const address = account.address ?? viewAs ?? undefined;
  const isConnected = account.isConnected || !!viewAs;
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const state = useQuery({
    queryKey: ["state", address],
    queryFn: () => api<StateResponse>(`/api/state?user=${address}`),
    enabled: !!address,
    refetchInterval: 4000,
  });

  const wrongChain = account.isConnected && chainId !== chain.id;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-[0.25em]">KRIYA</h1>
          <p className="text-xs text-muted">Autonomous Capital Protocol · Program the objective. KRIYA executes the strategy.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-line px-3 py-1 font-mono text-xs text-muted">{chain.name}</span>
          {viewAs && !account.isConnected && <span className="rounded-full border border-accent-2/40 px-3 py-1 font-mono text-xs text-accent-2">read-only view</span>}
          {account.isConnected ? (
            <button className="btn" onClick={() => disconnect()}>
              {short(address!)}
            </button>
          ) : (
            <button className="btn btn-primary" disabled={isPending} onClick={() => connect({ connector: connectors[0] })}>
              Connect wallet
            </button>
          )}
        </div>
      </header>

      <div className="mt-8">
        {!isConnected && <Landing />}
        {wrongChain && (
          <div className="card p-6">
            <p>Switch your wallet to {chain.name}.</p>
            <button className="btn btn-primary mt-3" onClick={() => switchChain({ chainId: chain.id })}>
              Switch network
            </button>
          </div>
        )}
        {isConnected && !wrongChain && state.error && <p className="text-danger">{(state.error as Error).message}</p>}
        {isConnected && !wrongChain && !state.data && !state.error && <p className="text-muted">Reading chain state…</p>}
        {isConnected && !wrongChain && state.data && address && (
          state.data.snapshot.mandate.exists ? (
            <Dashboard state={state.data} user={address} refresh={() => state.refetch()} />
          ) : (
            <MandateBuilder state={state.data} user={address} onDone={() => state.refetch()} />
          )
        )}
      </div>
    </main>
  );
}

function Landing() {
  const layers = [
    ["Intent", "You define the objective and hard limits"],
    ["Intelligence", "AI researches strategies and proposes allocations"],
    ["Verification", "Chainlink CRE verifies external reality"],
    ["Enforcement", "KriyaExecutor reverts anything outside your mandate"],
    ["Execution", "Capital moves onchain, every step auditable"],
  ];
  return (
    <section className="card p-8 md:p-12">
      <p className="label">Programmable Financial Objectives</p>
      <h2 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight">
        Stop programming transactions. <span className="text-accent">Start programming financial objectives.</span>
      </h2>
      <p className="mt-4 max-w-2xl text-muted">
        AI proposes. Rules constrain. Verifiable infrastructure verifies. Smart contracts enforce. Connect a wallet on {chain.name} to program a mandate with test USDC.
      </p>
      <div className="mt-10 grid gap-3 md:grid-cols-5">
        {layers.map(([t, d], i) => (
          <div key={t} className="rounded-xl border border-line p-4">
            <p className="font-mono text-xs text-accent">0{i + 1}</p>
            <p className="mt-1 font-semibold">{t}</p>
            <p className="mt-1 text-xs text-muted">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
