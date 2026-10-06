import { propose } from "@/lib/server/agent";
import { decisionInput, journalProposal } from "@/lib/server/loop";
import { fail, json, parseUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Called by the Chainlink CRE workflow (and the dashboard) to obtain a validated proposal.
// Body: { user, risks?: { [strategyAddress]: verifiedRisk } }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = parseUser(body.user);
    const input = await decisionInput(user, body.risks);
    const p = await propose(input);
    if (body.journal !== false && Date.now() - p.createdAt < 5_000) await journalProposal(user, p, input.strategies);
    return json({
      user,
      strategies: p.allocation.map((a) => a.strategy),
      bps: p.allocation.map((a) => a.bps),
      rationale: p.rationale,
      engine: p.engine,
      model: p.model ?? null,
      trigger: p.trigger,
      validation: p.validation,
      analysis: p.analysis,
      llmRejected: p.llmRejected ?? null,
      baseline: p.baseline,
    });
  } catch (err) {
    return fail(err, 400);
  }
}
