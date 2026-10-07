import "server-only";
import { isAddress, type Address } from "viem";
import { decodeRevert } from "./loop";

export const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...init?.headers },
  });

export const fail = (err: unknown, status = 500) => json({ error: decodeRevert(err) }, { status });

export function parseUser(value: unknown): Address {
  if (typeof value !== "string" || !isAddress(value)) throw new Error("A valid `user` address is required");
  return value;
}

/** Returns a 429 response when the named action is over its budget, else null. */
export async function limited(name: string, limit: number, windowSec: number): Promise<Response | null> {
  const { rateLimit } = await import("./store");
  const r = await rateLimit(name, limit, windowSec);
  if (r.ok) return null;
  return json(
    { error: `Rate limited: "${name}" is capped at ${limit} per ${windowSec}s to protect the demo's gas and API budget. Try again in ${r.retryAfter}s.` },
    { status: 429, headers: { "retry-after": String(r.retryAfter) } },
  );
}
