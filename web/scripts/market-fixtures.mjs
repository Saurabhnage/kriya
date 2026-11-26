// Local fixture server for scripts/e2e-market.mjs: stands in for the CoinMarketCap Pro API and the
// Cournot Intelligence Oracle so the market risk engine can be tested without keys or credits.
// The market regime is read from MOCK_MODE_FILE on every request ("calm" | "volatile").
//
//   MOCK_MODE_FILE=/tmp/mode PORT=4010 node scripts/market-fixtures.mjs
//   then start the app with CMC_API_BASE=http://127.0.0.1:4010 COURNOT_API_BASE=http://127.0.0.1:4010
//   CMC_API_KEY=fixture CMC_CACHE_MS=0
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.PORT ?? 4010);
const MODE_FILE = process.env.MOCK_MODE_FILE;
const mode = () => {
  try {
    return readFileSync(MODE_FILE, "utf8").trim() || "calm";
  } catch {
    return "calm";
  }
};

const MARKETS = {
  calm: { BNB: [600, 0.6, 1.2], USDT: [1.0002, 0, 0], USDC: [0.9999, 0, 0], fearGreed: [55, "Neutral"] },
  volatile: { BNB: [596, -9.4, -14.2], USDT: [1.0004, 0, 0], USDC: [0.9997, 0, 0], fearGreed: [24, "Fear"] },
};

const status = (credits = 1) => ({ timestamp: new Date().toISOString(), error_code: 0, error_message: null, credit_count: credits });
const quote = (id, symbol, [price, c24, c7]) => [
  { id, symbol, cmc_rank: id, quote: { USD: { price, percent_change_24h: c24, percent_change_7d: c7, volume_24h: 1e9, last_updated: new Date().toISOString() } } },
];

function handle(req, url, body) {
  const m = MARKETS[mode()] ?? MARKETS.calm;
  if (url.pathname.startsWith("/v") && !req.headers["x-cmc_pro_api_key"]) {
    return [401, { status: { error_code: 1002, error_message: "API key missing.", credit_count: 0 } }];
  }
  if (url.pathname === "/v2/cryptocurrency/quotes/latest") {
    const ids = { BNB: 1839, USDT: 825, USDC: 3408 };
    const data = {};
    for (const s of (url.searchParams.get("symbol") ?? "").split(",")) if (m[s]) data[s] = quote(ids[s], s, m[s]);
    return [200, { status: status(), data }];
  }
  if (url.pathname === "/v3/fear-and-greed/latest") {
    return [200, { status: status(), data: { value: m.fearGreed[0], value_classification: m.fearGreed[1], update_time: new Date().toISOString() } }];
  }
  if (url.pathname === "/intelligence/v1/resolve") {
    return [200, {
      code: 0,
      msg: "ok",
      request_id: `fixture-resolve-${Date.now()}`,
      data: { markets: [{ matching_confidence: 0.91, market_info: { id: "fixture-bnb-500", title: "Will BNB trade below $500 before Dec 31, 2026?", end_time: "2026-12-31T23:59:59Z", market_outcome_price: { yes: 0.58, no: 0.42 } } }] },
    }];
  }
  if (url.pathname === "/intelligence/v1/probability") {
    if (!body?.message || !Array.isArray(body.market_ids)) return [400, { code: 400, msg: "message and market_ids are required" }];
    return [200, {
      code: 0,
      msg: "ok",
      request_id: `fixture-prob-${Date.now()}`,
      data: {
        probability: { result: { point_estimate: 0.62, interval: [0.55, 0.69] }, basis: { sources: ["fixture"], reasoning: "Local fixture: no external call was made." } },
        billing: { charged: false, source: "fixture" },
      },
    }];
  }
  return [404, { error: `no fixture for ${url.pathname}` }];
}

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      /* ignore */
    }
    const [code, json] = handle(req, new URL(req.url, `http://127.0.0.1:${PORT}`), body);
    res.writeHead(code, { "content-type": "application/json", "x-request-id": json.request_id ?? "" });
    res.end(JSON.stringify(json));
  });
}).listen(PORT, "127.0.0.1", () => console.log(`market fixtures on http://127.0.0.1:${PORT} (mode file: ${MODE_FILE ?? "none, always calm"})`));
