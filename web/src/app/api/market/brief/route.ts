import { marketBrief } from "@/lib/server/memory";
import { fail, json, limited } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Living Brain's synthesized brief of everything KRIYA has observed in the market this week.
export async function POST() {
  const blocked = await limited("market-brief", 5, 60);
  if (blocked) return blocked;
  try {
    const brief = await marketBrief();
    return json({ brief, note: brief ? null : "Set LIVING_BRAIN_API_KEY to generate briefs (or not enough activity in the last 7 days yet)." });
  } catch (err) {
    return fail(err, 400);
  }
}
