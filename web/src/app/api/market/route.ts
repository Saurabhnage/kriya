import { readIntel, marketEnabled } from "@/lib/server/market/engine";
import { cmcEnabled, readCmcCalls } from "@/lib/server/market/cmc";
import { atlasFeeds } from "@/lib/server/market/atlas";
import { latestAssessment, readCournotProofs } from "@/lib/server/market/cournot";
import { memoryMode } from "@/lib/server/memory";
import { fail, json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Market intelligence for the dashboard, plus verifiable usage evidence for judges
// (CoinMarketCap call log, Atlas feed addresses, Cournot proofs). Secrets are never included.
export async function GET() {
  try {
    const [intel, cmcCalls, cournot, proofs] = await Promise.all([readIntel(), readCmcCalls(), latestAssessment(), readCournotProofs()]);
    return json({
      enabled: {
        market: marketEnabled(),
        coinmarketcap: cmcEnabled(),
        atlasFeeds: atlasFeeds(),
        cournot: process.env.COURNOT_API_KEY ? "prepaid key" : "free quota (3 calls per IP)",
        memory: memoryMode(),
        llm: process.env.KRIYA_LLM !== "off",
      },
      intel,
      cournot,
      evidence: {
        cmcCalls: cmcCalls.slice(-10).reverse(),
        cournotProofs: proofs.slice(-5).reverse().map((p) => ({ id: p.id, endpoint: p.endpoint, status: p.status, requestId: p.requestId, ts: p.ts })),
      },
    });
  } catch (err) {
    return fail(err, 400);
  }
}
