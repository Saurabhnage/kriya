"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, short, type CournotMarket, type MarketResponse, type StateResponse } from "@/lib/client";
import { addressUrl } from "@/lib/config";
import { useToast } from "../Toasts";
import { colorFor, Panel, relTime, useNow } from "./shared";

/** KRIYA Market Risk Engine: CoinMarketCap + Atlas + Cournot → live risk scores, with Living Brain memory. */
export function MarketPanel({ state, readOnly, onChanged }: { state: StateResponse; readOnly?: boolean; onChanged: () => void }) {
  const toast = useToast();
  const now = useNow();
  const market = useQuery({ queryKey: ["market"], queryFn: () => api<MarketResponse>("/api/market"), refetchInterval: 30_000 });
  const data = market.data ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [claim, setClaim] = useState("BNB price below $500 before December 31, 2026");
  const [direction, setDirection] = useState<"stress" | "relief">("stress");
  const [markets, setMarkets] = useState<CournotMarket[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [brief, setBrief] = useState<{ title: string; summary: string; body: string } | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await market.refetch();
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const intel = data?.intel;
  const en = data?.enabled;
  const max = state.snapshot.mandate.params.maxRisk;

  return (
    <Panel
      title="Market intelligence · CoinMarketCap · Atlas · Cournot · Living Brain"
      className="mt-3"
      right={
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Chip on={!!en?.coinmarketcap}>CMC</Chip>
          <Chip on={!!en?.atlasFeeds.length}>Atlas {en?.atlasFeeds.length ?? 0} feeds</Chip>
          <Chip on={en?.cournot === "prepaid key"} warn>
            Cournot
          </Chip>
          <Chip on={en?.memory === "living-brain"} warn>
            Living Brain{en?.memory === "local-fallback" ? " (local)" : ""}
          </Chip>
          {!readOnly && (
            <button
              className="rounded-md border border-line px-2 py-0.5 text-accent-2 hover:border-accent-2 disabled:opacity-50"
              disabled={!!busy || !en?.market}
              onClick={() => run("refresh", async () => void (await api("/api/market/refresh", {})))}
            >
              {busy === "refresh" ? "Refreshing…" : "Refresh market risk"}
            </button>
          )}
        </div>
      }
    >
      {!en?.market && (
        <p className="mb-3 text-xs text-warn">Market engine off: set CMC_API_KEY and/or ATLAS_FEED_* in the server env. The risk feed falls back to the demo feed.</p>
      )}
      {intel && (
        <p className="mb-3 text-sm">
          <span className="text-muted">Regime · </span>
          {intel.regime} <span className="text-xs text-muted">· {relTime(intel.at, now)}</span>
          {intel.errors.length > 0 && <span className="ml-2 text-xs text-warn">({intel.errors.join("; ")})</span>}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-3">
        {/* 1. live risk scores */}
        <div>
          <h3 className="label mb-2">Live risk per strategy (mandate max {max})</h3>
          {!intel?.scores.length && <p className="text-xs text-muted">No market scores yet.</p>}
          <ul className="space-y-3">
            {intel?.scores.map((s) => {
              const override = intel.overrides[s.address.toLowerCase()];
              const shown = override ?? s.risk;
              return (
                <li key={s.address} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorFor(state, s.address) }} />
                    <span className="flex-1 truncate" title={s.name}>
                      {s.name}
                    </span>
                    <span className={`font-mono ${shown > max ? "text-danger" : "text-ink"}`}>
                      {s.base} → {shown}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-panel-2">
                    <div className={`h-full ${shown > max ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.min(100, shown)}%` }} />
                  </div>
                  <ul className="mt-1 space-y-0.5 text-muted">
                    {s.factors.map((f, i) => (
                      <li key={i}>
                        <span className="font-mono text-ink">+{f.points}</span> {f.name}: {f.detail} <span className="text-accent-2">[{f.source}]</span>
                      </li>
                    ))}
                    {!s.factors.length && <li>No market stress factors.</li>}
                    {override !== undefined && <li className="text-warn">Scenario override active: {override}</li>}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 2. CoinMarketCap + Atlas */}
        <div>
          <h3 className="label mb-2">Market data</h3>
          {intel?.cmc ? (
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="text-left font-normal">CoinMarketCap</th>
                  <th className="text-right font-normal">Price</th>
                  <th className="text-right font-normal">24h</th>
                  <th className="text-right font-normal">7d</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {Object.entries(intel.cmc.quotes).map(([sym, q]) => (
                  <tr key={sym}>
                    <td>{sym}</td>
                    <td className="text-right">${q.price < 10 ? q.price.toFixed(4) : q.price.toFixed(2)}</td>
                    <td className={`text-right ${q.change24h < 0 ? "text-danger" : "text-accent"}`}>{q.change24h.toFixed(2)}%</td>
                    <td className={`text-right ${q.change7d < 0 ? "text-danger" : "text-accent"}`}>{q.change7d.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted">CoinMarketCap not configured.</p>
          )}
          {intel?.cmc?.fearGreed && (
            <p className="mt-1 text-xs">
              Fear &amp; Greed <span className="font-mono">{intel.cmc.fearGreed.value}</span> <span className="text-muted">({intel.cmc.fearGreed.classification})</span>
            </p>
          )}
          <h3 className="label mb-1 mt-3">Atlas onchain feeds (BNB Chain)</h3>
          {intel?.atlas.length ? (
            <ul className="space-y-1 text-xs">
              {intel.atlas.map((a) => (
                <li key={a.feed} className="flex gap-2">
                  <span className="flex-1">{a.description}</span>
                  <span className="font-mono">${a.price < 10 ? a.price.toFixed(4) : a.price.toFixed(2)}</span>
                  <Ext href={addressUrl(a.feed)}>{short(a.feed)}</Ext>
                  {a.stale && <span className="text-warn">stale</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">No Atlas feeds configured (ATLAS_FEED_BNB_USD / USDT_USD / USDC_USD).</p>
          )}
          {data?.evidence.cmcCalls.length ? (
            <details className="mt-3 text-xs text-muted">
              <summary className="cursor-pointer">CoinMarketCap call log (proof of live usage)</summary>
              <ul className="mt-1 space-y-0.5 font-mono">
                {data.evidence.cmcCalls.map((c, i) => (
                  <li key={i}>
                    {new Date(c.ts).toISOString().slice(11, 19)} {c.endpoint} · HTTP {c.http}
                    {c.credits != null ? ` · ${c.credits} credit` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        {/* 3. Cournot */}
        <div>
          <h3 className="label mb-2">Event risk · Cournot Intelligence Oracle</h3>
          {!readOnly && (
            <div className="space-y-2 text-xs">
              <input
                className="w-full rounded-md border border-line bg-panel-2 px-2 py-1.5"
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                aria-label="Claim for Cournot"
              />
              <div className="flex gap-2">
                <select className="rounded-md border border-line bg-panel-2 px-2 py-1" value={direction} onChange={(e) => setDirection(e.target.value as "stress" | "relief")}>
                  <option value="stress">If true → market stress</option>
                  <option value="relief">If true → market relief</option>
                </select>
                <button
                  className="rounded-md border border-line px-2 py-1 hover:border-accent-2 disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() =>
                    run("resolve", async () => {
                      const r = await api<{ markets: CournotMarket[] }>("/api/market/cournot", { action: "resolve", claim });
                      setMarkets(r.markets);
                      setPicked(r.markets[0]?.id ?? null);
                    })
                  }
                >
                  {busy === "resolve" ? "Searching…" : "Find markets (free)"}
                </button>
              </div>
              {markets && !markets.length && <p className="text-muted">No matching market. Name an asset, a threshold and a date.</p>}
              {markets?.map((m) => (
                <label key={m.id} className="flex cursor-pointer gap-2 rounded-md border border-line p-1.5">
                  <input type="radio" name="cournot-market" checked={picked === m.id} onChange={() => setPicked(m.id)} />
                  <span>
                    {m.title}
                    <span className="block text-muted">
                      match {m.matchingConfidence?.toFixed(2) ?? "?"} · ends {m.endTime ?? "?"}
                    </span>
                  </span>
                </label>
              ))}
              {picked && (
                <button
                  className="w-full rounded-md bg-accent px-2 py-1.5 font-medium text-bg disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() => run("assess", async () => void (await api("/api/market/cournot", { action: "assess", claim, marketIds: [picked], direction })))}
                >
                  {busy === "assess" ? "Asking Cournot…" : "Assess & rescore risk (uses 1 Cournot call)"}
                </button>
              )}
            </div>
          )}
          {data?.cournot && (
            <div className="mt-3 text-xs">
              <p>
                <span className="font-mono text-2xl text-accent">{(data.cournot.probability * 100).toFixed(1)}%</span>{" "}
                <span className="text-muted">probability the claim is true · {relTime(data.cournot.at, now)}</span>
              </p>
              <p className="mt-1">
                Claim: &ldquo;{data.cournot.claim}&rdquo; <span className="text-muted">({data.cournot.direction === "stress" ? "true = market stress" : "true = market relief"})</span>
              </p>
              <p className="mt-1 text-muted">
                Effect: adds an event-risk premium to the LP strategy (see its &ldquo;Event risk&rdquo; factor) · proof {data.cournot.proofId}
                {data.cournot.requestId ? ` · request ${data.cournot.requestId}` : ""}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-accent-2">Cournot assessment &amp; evidence (verbatim)</summary>
                <div className="mt-1 space-y-2">
                  <Verbatim label="result" value={data.cournot.result} />
                  <Verbatim label="basis" value={data.cournot.basis} />
                </div>
              </details>
            </div>
          )}

          <h3 className="label mb-1 mt-4">Living Brain market memory</h3>
          {!readOnly && (
            <button
              className="rounded-md border border-line px-2 py-1 text-xs hover:border-accent-2 disabled:opacity-50"
              disabled={!!busy}
              onClick={() =>
                run("brief", async () => {
                  const r = await api<{ brief: typeof brief; note: string | null }>("/api/market/brief", {});
                  if (!r.brief && r.note) toast.info(r.note);
                  setBrief(r.brief);
                })
              }
            >
              {busy === "brief" ? "Generating…" : "Generate weekly market brief"}
            </button>
          )}
          {brief && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-line p-2 text-xs scroll-slim">
              <p className="font-medium">{brief.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-muted">{brief.body || brief.summary}</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Chip({ on, warn, children }: { on: boolean; warn?: boolean; children: ReactNode }) {
  return <span className={`rounded-full border px-2 py-0.5 ${on ? "border-accent/40 text-accent" : warn ? "border-warn/40 text-warn" : "border-line text-muted"}`}>{children}</span>;
}

function Ext({ href, children }: { href: string | null; children: ReactNode }) {
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="font-mono text-accent-2 hover:underline">
      {children} ↗
    </a>
  ) : (
    <span className="font-mono text-muted">{children}</span>
  );
}

/** Renders Cournot's returned objects as-is (any shape), so judges see exactly what the oracle said. */
function Verbatim({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <Node value={value} />
    </div>
  );
}

function Node({ value }: { value: unknown }): ReactNode {
  if (value === null || value === undefined) return <span className="text-muted">none</span>;
  if (Array.isArray(value)) {
    return (
      <ul className="ml-3 list-disc">
        {value.map((v, i) => (
          <li key={i}>
            <Node value={v} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <dl className="ml-2 border-l border-line pl-2">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k}>
            <dt className="inline text-muted">{k}: </dt>
            <dd className="inline">
              <Node value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  const s = String(value);
  return /^https?:\/\//.test(s) ? (
    <a href={s} target="_blank" rel="noreferrer" className="break-all text-accent-2 hover:underline">
      {s}
    </a>
  ) : (
    <span className="break-words">{s}</span>
  );
}
