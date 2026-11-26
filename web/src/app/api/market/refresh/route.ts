import { readIntel, refreshMarketRisk } from "@/lib/server/market/engine";
import { journal } from "@/lib/server/store";
import { fail, json, limited } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Pull live CoinMarketCap + Atlas data (and the latest Cournot assessment), rescore every strategy
// and publish the result to the risk feed that Chainlink CRE / the keeper verify onchain.
export async function POST() {
  const blocked = await limited("market-refresh", 20, 60);
  if (blocked) return blocked;
  try {
    const before = await readIntel();
    const { intel, feed } = await refreshMarketRisk();
    const changed = intel.scores.filter((s) => before?.scores.find((b) => b.address === s.address)?.risk !== s.risk);
    if (changed.length && before) {
      await journal({
        kind: "reality",
        title: `Market risk engine: ${changed.map((s) => `${s.name.split(" - ")[0]} ${before.scores.find((b) => b.address === s.address)?.risk ?? "?"} → ${s.risk}`).join(", ")}`,
        detail: `${intel.regime}. Awaiting onchain verification.`,
      });
    }
    return json({ intel, feed });
  } catch (err) {
    return fail(err, 400);
  }
}
