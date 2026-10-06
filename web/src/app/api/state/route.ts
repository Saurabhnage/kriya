import { readActivity, readSnapshot } from "@/lib/server/state";
import { getRiskFeed } from "@/lib/server/store";
import { evaluateHealth } from "@/lib/policy";
import { withRisks } from "@/lib/server/loop";
import { fail, json, parseUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = parseUser(new URL(request.url).searchParams.get("user"));
    const snap = await readSnapshot(user);
    const feed = await getRiskFeed();
    const activity = await readActivity(user, snap.strategies, snap.block);
    // What the mandate looks like against the latest *external* risk view (before CRE writes it onchain)
    const pending = snap.mandate.exists
      ? evaluateHealth(snap.mandate.params, snap.mandate.allowed, withRisks(snap.strategies, feed.risks), snap.positions, snap.idle)
      : null;
    return json({ snapshot: snap, feed, pending, activity });
  } catch (err) {
    return fail(err, 400);
  }
}
