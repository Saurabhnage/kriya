import "server-only";
import { getJson, setJson } from "../store";

// CoinMarketCap Pro API. Server-side only: the key never reaches the browser.
// Every call is appended to an audit log (endpoint, HTTP status, credits) shown in the dashboard
// and exportable as proof of live usage.

const BASE = process.env.CMC_API_BASE?.trim() || "https://pro-api.coinmarketcap.com";
const KEY = () => process.env.CMC_API_KEY?.trim();
export const cmcEnabled = () => Boolean(KEY());

export type CmcCall = { ts: number; endpoint: string; http: number; errorCode?: number; credits?: number };
export type Quote = { price: number; change24h: number; change7d: number; volume24h: number; lastUpdated: string };

const cache = new Map<string, { at: number; body: unknown }>();
const TTL_MS = Number(process.env.CMC_CACHE_MS ?? 60_000); // protects API credits

async function logCall(c: CmcCall) {
  const list = (await getJson<CmcCall[]>("cmc-calls")) ?? [];
  list.push(c);
  await setJson("cmc-calls", list.slice(-50));
}

export const readCmcCalls = async () => (await getJson<CmcCall[]>("cmc-calls")) ?? [];

type CmcBody = { status?: { error_code?: number; error_message?: string; credit_count?: number }; data?: unknown };

async function get(path: string, params: Record<string, string> = {}): Promise<CmcBody> {
  const key = KEY();
  if (!key) throw new Error("CMC_API_KEY is not set");
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const hit = cache.get(url.toString());
  if (hit && Date.now() - hit.at < TTL_MS) return hit.body as CmcBody;

  const res = await fetch(url, { headers: { "X-CMC_PRO_API_KEY": key, accept: "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as CmcBody;
  await logCall({ ts: Date.now(), endpoint: url.pathname, http: res.status, errorCode: body.status?.error_code, credits: body.status?.credit_count });
  if (!res.ok || body.status?.error_code) throw new Error(`CoinMarketCap ${url.pathname}: ${body.status?.error_message ?? res.status}`);
  cache.set(url.toString(), { at: Date.now(), body });
  return body;
}

/** Latest USD quotes for symbols (v2 returns an array per symbol; take the top-ranked match). */
export async function quotes(symbols: string[]): Promise<Record<string, Quote>> {
  const body = await get("/v2/cryptocurrency/quotes/latest", { symbol: symbols.join(","), convert: "USD" });
  const data = (body.data ?? {}) as Record<string, unknown>;
  const out: Record<string, Quote> = {};
  for (const s of symbols) {
    const raw = data[s];
    const entry = (Array.isArray(raw) ? raw[0] : raw) as { quote?: { USD?: Record<string, number | string> } } | undefined;
    const q = entry?.quote?.USD;
    if (q) {
      out[s] = {
        price: Number(q.price),
        change24h: Number(q.percent_change_24h),
        change7d: Number(q.percent_change_7d),
        volume24h: Number(q.volume_24h),
        lastUpdated: String(q.last_updated),
      };
    }
  }
  return out;
}

export async function fearGreed(): Promise<{ value: number; classification: string } | null> {
  try {
    const body = await get("/v3/fear-and-greed/latest");
    const d = body.data as { value?: number; value_classification?: string } | undefined;
    return d?.value != null ? { value: Number(d.value), classification: String(d.value_classification ?? "") } : null;
  } catch {
    return null;
  }
}
