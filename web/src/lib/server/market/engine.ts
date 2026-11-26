import "server-only";
import { readStrategies } from "../state";
import { DEFAULT_RISKS, getJson, getRiskFeed, saveRiskFeed, setJson, type RiskFeed } from "../store";
import { regime, scoreAll, type MarketInputs, type StrategyRisk } from "../../riskModel";
import { cmcEnabled, fearGreed, quotes, type Quote } from "./cmc";
import { atlasFeeds, readAtlas, type AtlasPrice } from "./atlas";
import { latestAssessment, type CournotAssessment } from "./cournot";
import { remember } from "../memory";

// KRIYA Market Risk Engine: CoinMarketCap + Atlas + Cournot → verified risk scores.
// The result is written to the risk feed that the Chainlink CRE workflow (and the local keeper)
// reads, verifies onchain, and acts on. Manual demo overrides ("change reality") sit on top.

export const ENGINE_SOURCE = "KRIYA Market Risk Engine (CoinMarketCap + Atlas + Cournot)";
const COURNOT_MAX_AGE_MS = 24 * 3600_000;
const MEMORY_EVERY_MS = 30 * 60_000;

export type MarketIntel = {
  at: number;
  regime: string;
  cmc: { quotes: Record<string, Quote>; fearGreed: { value: number; classification: string } | null } | null;
  atlas: AtlasPrice[];
  cournot: Pick<CournotAssessment, "claim" | "direction" | "probability" | "marketIds" | "requestId" | "proofId" | "at"> | null;
  scores: StrategyRisk[];
  overrides: Record<string, number>;
  errors: string[];
};

export const marketEnabled = () => process.env.MARKET_RISK !== "off" && (cmcEnabled() || atlasFeeds().length > 0);
export const readIntel = () => getJson<MarketIntel>("market-intel");
export const readOverrides = async () => (await getJson<Record<string, number>>("risk-overrides")) ?? {};

export async function setOverride(strategy: string, risk: number) {
  await setJson("risk-overrides", { ...(await readOverrides()), [strategy.toLowerCase()]: risk });
}
export const clearOverrides = () => setJson("risk-overrides", {});

export async function refreshMarketRisk(): Promise<{ intel: MarketIntel; feed: RiskFeed }> {
  if (!marketEnabled()) throw new Error("No market data source: set CMC_API_KEY and/or ATLAS_FEED_* (or MARKET_RISK=off)");
  const errors: string[] = [];
  const [strategies, cmcData, atlas, cournotRaw, overrides] = await Promise.all([
    readStrategies(),
    cmcEnabled()
      ? Promise.all([quotes(["BNB", "USDT", "USDC"]), fearGreed()]).catch((e: Error) => {
          errors.push(e.message);
          return null;
        })
      : Promise.resolve(null),
    readAtlas().catch((e: Error) => {
      errors.push(`Atlas: ${e.message}`);
      return [] as AtlasPrice[];
    }),
    latestAssessment(),
    readOverrides(),
  ]);
  const [q, fg] = cmcData ?? [null, null];

  // Stablecoin prices: Atlas (onchain) first, CoinMarketCap as fallback.
  const stables: MarketInputs["stables"] = [];
  for (const sym of ["USDT", "USDC"]) {
    const a = atlas.find((x) => x.symbol === sym && !x.stale);
    if (a) stables.push({ symbol: sym, price: a.price, source: "Atlas" });
    else if (q?.[sym]) stables.push({ symbol: sym, price: q[sym].price, source: "CoinMarketCap" });
  }
  const cournot = cournotRaw && Date.now() - cournotRaw.at < COURNOT_MAX_AGE_MS ? cournotRaw : null;
  const inputs: MarketInputs = {
    bnb: q?.BNB ? { price: q.BNB.price, change24h: q.BNB.change24h, change7d: q.BNB.change7d, source: "CoinMarketCap" } : undefined,
    fearGreed: fg?.value ?? null,
    stables,
    atlasBnb: atlas.find((x) => x.symbol === "BNB" && !x.stale)?.price ?? null,
    cournot: cournot ? { claim: cournot.claim, probability: cournot.probability, direction: cournot.direction } : null,
  };

  const scores = scoreAll(
    strategies.map((s) => ({ address: s.address, name: s.name, base: DEFAULT_RISKS[s.address.toLowerCase()] ?? s.risk })),
    inputs,
  );
  const risks: Record<string, number> = {};
  for (const s of scores) risks[s.address.toLowerCase()] = overrides[s.address.toLowerCase()] ?? s.risk;

  const feed = await saveRiskFeed({
    updatedAt: Date.now(),
    source: Object.keys(overrides).length ? `${ENGINE_SOURCE} + manual scenario override` : ENGINE_SOURCE,
    risks,
  });
  const prev = await readIntel();
  const intel: MarketIntel = {
    at: Date.now(),
    regime: regime(inputs),
    cmc: q ? { quotes: q, fearGreed: fg } : null,
    atlas,
    cournot: cournot
      ? { claim: cournot.claim, direction: cournot.direction, probability: cournot.probability, marketIds: cournot.marketIds, requestId: cournot.requestId, proofId: cournot.proofId, at: cournot.at }
      : null,
    scores,
    overrides,
    errors,
  };
  await setJson("market-intel", intel);

  // Living Brain: remember the regime when scores move, or every 30 minutes.
  const moved = !prev || prev.scores.some((p) => scores.find((s) => s.address === p.address)?.risk !== p.risk);
  if (moved || Date.now() - prev.at > MEMORY_EVERY_MS) {
    await remember(
      "market",
      `Market regime ${new Date(intel.at).toISOString().slice(0, 16)}Z`,
      `${intel.regime}. Strategy risk scores: ${scores
        .map((s) => `${s.name.split(" - ")[1] ?? s.name} ${s.risk} (base ${s.base}${s.factors.length ? `; ${s.factors.map((f) => `${f.name} +${f.points}`).join(", ")}` : ""})`)
        .join("; ")}.`,
    );
  }
  return { intel, feed };
}

/** Refresh if stale (used by the keeper loop). Never throws: the loop continues on the last feed. */
export async function refreshIfStale(maxAgeMs = 60_000): Promise<MarketIntel | null> {
  if (!marketEnabled()) return null;
  const prev = await readIntel();
  const feed = await getRiskFeed();
  if (prev && Date.now() - prev.at < maxAgeMs && feed.source.startsWith(ENGINE_SOURCE)) return prev;
  try {
    return (await refreshMarketRisk()).intel;
  } catch (err) {
    console.warn("[market] refresh failed:", err instanceof Error ? err.message : err);
    return prev;
  }
}
