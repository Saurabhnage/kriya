import { propose } from "@/lib/server/agent";
import { decisionInput, executeViaAgent, journalProposal } from "@/lib/server/loop";
import { fail, json, parseUser, limited } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Agent path: decide + validate + execute with the bounded agent key.
export async function POST(request: Request) {
  const blocked = await limited("agent-execute", 6, 60);
  if (blocked) return blocked;
  try {
    const user = parseUser((await request.json()).user);
    const input = await decisionInput(user);
    const p = await propose(input);
    await journalProposal(user, p, input.strategies);
    if (!p.validation.ok) throw new Error(`${p.validation.error}: ${p.validation.detail}`);
    const hash = await executeViaAgent(user, p);
    return json({ hash, proposal: p });
  } catch (err) {
    return fail(err);
  }
}
