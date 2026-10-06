import { runKeeper } from "@/lib/server/loop";
import { fail, json } from "@/lib/server/http";
import type { Address } from "viem";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Local fallback for the Chainlink CRE workflow: same loop, executed with protocol keys.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    return json({ steps: await runKeeper(body.user as Address | undefined) });
  } catch (err) {
    return fail(err);
  }
}
