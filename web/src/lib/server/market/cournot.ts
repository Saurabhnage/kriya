import "server-only";
import { getJson, setJson } from "../store";

// Cournot Intelligence Oracle: live probability + evidence for a real-world claim.
// Same endpoints as the official Cournot skill: POST {base}/intelligence/v1/{resolve|probability}.
// Free quota is 3 probability calls per IP in total, so calls are user-triggered only, never retried,
// and every call is stored (sanitized) as reproducible proof.

const BASE = () => process.env.COURNOT_API_BASE?.trim() || "https://interface.cournot.ai";
const KEY = () => process.env.COURNOT_API_KEY?.trim();

export type CournotMarket = { id: string; title: string; endTime?: string; matchingConfidence?: number; marketPrice?: unknown };
export type CournotAssessment = {
  claim: string;
  direction: "stress" | "relief";
  marketIds: string[];
  probability: number;
  result: unknown;
  basis: unknown;
  requestId: string | null;
  proofId: string;
  billing: unknown;
  at: number;
};
type Proof = { id: string; ts: number; endpoint: string; status: number; requestId: string | null; request: unknown; response: unknown };

function sanitize<T>(v: T): T {
  const key = KEY();
  let s = JSON.stringify(v);
  if (key) s = s.split(key).join("[REDACTED]");
  return JSON.parse(s.replace(/ck_live_[A-Za-z0-9_-]+/g, "[REDACTED]"));
}

async function saveProof(p: Omit<Proof, "id" | "ts">): Promise<string> {
  const id = `${new Date().toISOString()}-${p.endpoint}`;
  const list = (await getJson<Proof[]>("cournot-proofs")) ?? [];
  list.push(sanitize({ ...p, id, ts: Date.now() }));
  await setJson("cournot-proofs", list.slice(-20));
  return id;
}

export const readCournotProofs = async () => (await getJson<Proof[]>("cournot-proofs")) ?? [];
export const latestAssessment = () => getJson<CournotAssessment>("cournot-latest");
export const clearAssessment = () => setJson("cournot-latest", null);

async function call(endpoint: "resolve" | "probability", body: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = KEY();
  if (endpoint === "probability" && key) headers["COURNOT-API-KEY"] = key;
  const res = await fetch(`${BASE()}/intelligence/v1/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(endpoint === "probability" ? 120_000 : 30_000),
  });
  const text = await res.text();
  let json: { code?: number; msg?: string; request_id?: string; data?: Record<string, unknown> } | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Cournot ${endpoint}: non-JSON response (HTTP ${res.status})`);
  }
  const requestId = res.headers.get("x-request-id") ?? res.headers.get("request-id") ?? json?.request_id ?? (json?.data?.request_id as string | undefined) ?? null;
  return { status: res.status, json, requestId };
}

/** Free: match a natural-language claim to Cournot markets. */
export async function resolveClaim(message: string): Promise<CournotMarket[]> {
  const { status, json, requestId } = await call("resolve", { message, limit: 5 });
  await saveProof({ endpoint: "resolve", status, requestId, request: { message }, response: json });
  if (status !== 200 || json?.code !== 0) throw new Error(`Cournot resolve failed (HTTP ${status}): ${json?.msg ?? "unknown"}`);
  const markets = (json.data?.markets ?? []) as { market_info?: Record<string, unknown>; matching_confidence?: number }[];
  return markets
    .map((m) => ({
      id: String(m.market_info?.id ?? ""),
      title: String(m.market_info?.title ?? ""),
      endTime: m.market_info?.end_time as string | undefined,
      marketPrice: m.market_info?.market_outcome_price,
      matchingConfidence: m.matching_confidence,
    }))
    .filter((m) => m.id);
}

/** Uses 1 probability call (free quota or prepaid key). The result feeds the market risk engine. */
export async function assessClaim(claim: string, marketIds: string[], direction: "stress" | "relief"): Promise<CournotAssessment> {
  const { status, json, requestId } = await call("probability", { message: claim, market_ids: marketIds });
  const proofId = await saveProof({ endpoint: "probability", status, requestId, request: { message: claim, market_ids: marketIds }, response: json });
  if (status === 402) throw new Error("Cournot free calls are used up: set COURNOT_API_KEY (prepaid key from the Cournot team)");
  if (status === 429) throw new Error("Cournot rate limited: wait before trying again");
  if (status !== 200 || json?.code !== 0) throw new Error(`Cournot probability failed (HTTP ${status}): ${json?.msg ?? ""}`);

  const d = json.data ?? {};
  const nested = (d.probability && typeof d.probability === "object" ? d.probability : {}) as Record<string, unknown>;
  const result = (nested.result ?? d.result ?? null) as Record<string, unknown> | null;
  const basis = nested.basis ?? d.basis ?? null;
  let p: unknown = typeof d.probability === "number" ? d.probability : (result?.point_estimate ?? nested.probability);
  if (typeof p === "string") p = Number(p);
  if (typeof p !== "number" || Number.isNaN(p) || p < 0 || p > 1) throw new Error("Cournot response had no usable probability");

  const a: CournotAssessment = sanitize({ claim, direction, marketIds, probability: p, result, basis, requestId, proofId, billing: d.billing ?? null, at: Date.now() });
  await setJson("cournot-latest", a);
  return a;
}
