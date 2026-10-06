import { getRiskFeed, journal, resetRiskFeed, setRisk } from "@/lib/server/store";
import { readStrategies } from "@/lib/server/state";
import { fail, json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// External risk data source consumed by the Chainlink CRE workflow (and the local keeper).
// GET returns a deterministic, sorted list so every CRE node reaches identical consensus.
export async function GET() {
  const feed = await getRiskFeed();
  const strategies = Object.entries(feed.risks)
    .map(([address, risk]) => ({ address, risk }))
    .sort((a, b) => a.address.localeCompare(b.address));
  return json({ source: feed.source, updatedAt: feed.updatedAt, strategies });
}

// Demo control: "change reality". Body: { strategy, risk } or { reset: true }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.reset) {
      const feed = await resetRiskFeed();
      await journal({ kind: "reality", title: "External risk feed reset to baseline" });
      return json(feed);
    }
    const risk = Number(body.risk);
    if (!Number.isInteger(risk) || risk < 0 || risk > 100) throw new Error("risk must be an integer 0-100");
    const strategies = await readStrategies();
    const s = strategies.find((x) => x.address.toLowerCase() === String(body.strategy).toLowerCase());
    if (!s) throw new Error("unknown strategy");
    const before = (await getRiskFeed()).risks[s.address.toLowerCase()] ?? s.risk;
    const feed = await setRisk(s.address, risk);
    await journal({ kind: "reality", title: `External risk feed: ${s.name.split(" - ")[0]} risk ${before} → ${risk}`, detail: "Reality changed. Awaiting verification." });
    return json(feed);
  } catch (err) {
    return fail(err, 400);
  }
}
