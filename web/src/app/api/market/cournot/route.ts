import { assessClaim, resolveClaim } from "@/lib/server/market/cournot";
import { marketEnabled, refreshMarketRisk } from "@/lib/server/market/engine";
import { journal } from "@/lib/server/store";
import { fail, json, limited } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

// Body: { action: "resolve", claim }  → matching Cournot markets (free)
//       { action: "assess", claim, marketIds, direction: "stress" | "relief" } → 1 probability call,
//       then the market risk engine rescores strategies with the new event-risk premium.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const claim = String(body.claim ?? "").trim().slice(0, 500);
    if (!claim) throw new Error("claim is required");
    if (body.action === "resolve") {
      const blocked = await limited("cournot-resolve", 20, 60);
      if (blocked) return blocked;
      return json({ markets: await resolveClaim(claim) });
    }
    if (body.action === "assess") {
      const blocked = await limited("cournot-assess", 3, 300);
      if (blocked) return blocked;
      const ids = Array.isArray(body.marketIds) ? body.marketIds.map(String).slice(0, 5) : [];
      if (!ids.length) throw new Error("select at least one market");
      const direction = body.direction === "relief" ? "relief" : "stress";
      const assessment = await assessClaim(claim, ids, direction);
      await journal({
        kind: "observe",
        title: `Cournot: ${(assessment.probability * 100).toFixed(1)}% for "${claim}"`,
        detail: `${direction === "stress" ? "Market-stress" : "Relief"} scenario · market ${ids.join(", ")} · proof ${assessment.proofId}`,
      });
      const refreshed = marketEnabled() ? await refreshMarketRisk().catch(() => null) : null;
      return json({ assessment, intel: refreshed?.intel ?? null });
    }
    throw new Error('action must be "resolve" or "assess"');
  } catch (err) {
    return fail(err, 400);
  }
}
