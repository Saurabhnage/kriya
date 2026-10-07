import { decodeRevert, runKeeper } from "@/lib/server/loop";
import { limited } from "@/lib/server/http";
import type { Address } from "viem";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Local fallback for the Chainlink CRE workflow: same loop, executed with protocol keys.
// Streams one JSON LoopStep per line (NDJSON) as each step completes, then {"done":true}.
export async function POST(request: Request) {
  const blocked = await limited("keeper-run", 6, 60);
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({}));
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (value: unknown) => controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      try {
        const steps = await runKeeper(body.user as Address | undefined, write);
        write({ done: true, steps: steps.length });
      } catch (err) {
        write({ step: "ERROR", status: "error", detail: decodeRevert(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
