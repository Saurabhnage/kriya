"use client";

import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { chain, DEMO_VIEW_ADDRESS } from "@/lib/config";
import { api, short, type StateResponse } from "@/lib/client";
import { MandateBuilder } from "@/components/MandateBuilder";
import { Dashboard } from "@/components/Dashboard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useToast } from "@/components/Toasts";

const noSubscribe = () => () => {};
function readViewParam(): Address | null {
  const v = new URLSearchParams(window.location.search).get("view");
  return v && isAddress(v) ? v : null;
}

export default function Home() {
  const toast = useToast();
  const account = useAccount();
  // ?view=0x… opens any mandate read-only (judges / sharing); a connected wallet takes over
  const viewAs = useSyncExternalStore(noSubscribe, readViewParam, () => null);
  const address = account.address ?? viewAs ?? undefined;
  const isConnected = account.isConnected || !!viewAs;
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [running, setRunning] = useState(false);

  const state = useQuery({
    queryKey: ["state", address],
    queryFn: () => api<StateResponse>(`/api/state?user=${address}`),
    enabled: !!address,
    refetchInterval: running ? 2000 : 4000,
  });

  const wrongChain = account.isConnected && chainId !== chain.id;
  const hasMandate = !!state.data?.snapshot.mandate.exists;

  const connectWallet = () => {
    const injected = connectors[0];
    if (!injected) return toast.error("No browser wallet found. Install MetaMask, or open the live demo mandate read-only.");
    connect({ connector: injected }, { onError: (err) => toast.error(err) });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
          {/* full reload on purpose: it clears the read-only ?view= address, which is read once on load */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="text-lg font-black tracking-[0.3em]">
            KRIYA
          </a>
          <span className="hidden text-xs text-muted md:inline">Autonomous Capital Protocol</span>
          <div className="ml-auto flex items-center gap-2">
            {state.data && hasMandate && <StatusBadge state={state.data} />}
            <span className="hidden rounded-full border border-line px-3 py-1 font-mono text-xs text-muted sm:inline">{chain.name}</span>
            {viewAs && !account.isConnected && (
              <span className="hidden rounded-full border border-accent-2/40 px-3 py-1 font-mono text-xs text-accent-2 sm:inline" title={viewAs}>
                viewing {short(viewAs)}
              </span>
            )}
            {account.isConnected ? (
              <button className="btn" onClick={() => disconnect()} title="Disconnect">
                {short(account.address!)}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={isPending} onClick={connectWallet}>
                {isPending ? "Connecting…" : "Connect wallet"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-3">
        {!isConnected && <Landing onConnect={connectWallet} />}
        {wrongChain && (
          <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
            <p>Your wallet is on another network. KRIYA runs on {chain.name}.</p>
            <button className="btn btn-primary mt-4" onClick={() => switchChain({ chainId: chain.id }, { onError: (err) => toast.error(err) })}>
              Switch to {chain.name}
            </button>
          </div>
        )}
        {isConnected && !wrongChain && state.error && (
          <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
            <p className="text-danger">Couldn&apos;t read the chain: {(state.error as Error).message}</p>
            <button className="btn mt-4" onClick={() => state.refetch()}>
              Retry
            </button>
          </div>
        )}
        {isConnected && !wrongChain && !state.data && !state.error && <Skeleton />}
        {isConnected &&
          !wrongChain &&
          state.data &&
          address &&
          (hasMandate ? (
            <Dashboard state={state.data} user={address} readOnly={!account.isConnected} refresh={() => state.refetch()} onRunningChange={setRunning} />
          ) : (
            <MandateBuilder state={state.data} user={address} readOnly={!account.isConnected} onDone={() => state.refetch()} />
          ))}
      </main>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid animate-pulse gap-3 min-[1100px]:grid-cols-12" aria-label="Reading chain state">
      <div className="card h-64 min-[1100px]:col-span-3" />
      <div className="card h-64 min-[1100px]:col-span-6" />
      <div className="card h-64 min-[1100px]:col-span-3" />
    </div>
  );
}

function Landing({ onConnect }: { onConnect: () => void }) {
  const layers = [
    ["Intent", "You set the objective and hard limits"],
    ["Intelligence", "Claude proposes allocations"],
    ["Verification", "Chainlink CRE verifies reality"],
    ["Enforcement", "Contracts revert anything outside the mandate"],
    ["Execution", "Capital moves onchain, auditable"],
  ];
  return (
    <section className="mx-auto mt-6 max-w-5xl">
      <div className="card relative overflow-hidden p-8 md:p-12">
        <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-accent-2/10 blur-3xl" />
        <p className="label">Programmable Financial Objectives · live on {chain.name}</p>
        <h1 className="mt-3 max-w-3xl text-4xl leading-tight font-semibold md:text-5xl">
          Stop programming transactions. <span className="text-accent">Start programming financial objectives.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-muted">
          Tell KRIYA the outcome you want and the limits it must respect. An AI agent decides, Chainlink CRE verifies, and smart contracts revert
          anything outside your mandate.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {DEMO_VIEW_ADDRESS && (
            <a className="btn btn-primary" href={`?view=${DEMO_VIEW_ADDRESS}`}>
              View the live demo mandate →
            </a>
          )}
          <button className="btn" onClick={onConnect}>
            Connect wallet to program your own
          </button>
        </div>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-5">
        {layers.map(([t, d], i) => (
          <li key={t} className="card p-4">
            <p className="font-mono text-xs text-accent">0{i + 1}</p>
            <p className="mt-1 font-semibold">{t}</p>
            <p className="mt-1 text-xs text-muted">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
