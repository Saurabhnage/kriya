# Mission Control UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace KRIYA's stacked dashboard with a one-screen "mission control" layout whose hero is a live, streamed loop pipeline, optimized for judges and a 3-minute stage demo.

**Architecture:** Pure logic (act derivation, NDJSON parsing, error mapping, last-run assembly) lives in small tested modules under `web/src/lib/`. The keeper route streams NDJSON steps; `/api/state` gains `lastRun`, `latestDecision`, `riskHistory`, `act`. The UI is split into focused client components under `web/src/components/dashboard/` with hand-written SVG charts.

**Tech Stack:** Next.js 16 (app router), React 19, Tailwind 4, wagmi 3 / viem 2, node:test + tsx, Foundry/Anvil for e2e.

**Spec:** `docs/superpowers/specs/2026-10-07-mission-control-ui-design.md`

## Global Constraints

- No contract changes; no chart library; no new state store beyond Redis/file store.
- Keep the palette: bg `#07090d`, panel `#0e1218`/`#131923`, line `#1f2733`, ink `#e8edf4`, muted `#8592a6`, accent mint `#7cf7c4`, blue `#5aa8ff`, purple `#c38bff`, amber `#ffb547`, danger `#ff5d6c`.
- Desktop must fit 1440×900 without vertical scroll; no horizontal scroll at 375px.
- Colour never carries meaning alone (status text / ✓ ⚠ ✗ beside colour).
- Respect `prefers-reduced-motion`.
- Every test command: `cd web && npm test` (unit) · `npm run e2e` (needs Anvil + server on :3001, see `web/scripts/e2e.mjs` header).

---

### Task 1: Act derivation (`lib/act.ts`)

**Files:**
- Create: `web/src/lib/act.ts`
- Test: `web/src/lib/act.test.ts`
- Modify: `web/package.json` (`test` script runs all `src/lib/*.test.ts`)

**Interfaces:**
- Produces: `type Act = 1 | 2 | 3 | 4 | 5 | "done"`; `type ActInput = { mandateExists: boolean; allocated: boolean; violated: boolean; pendingViolated: boolean; guardrailShown: boolean; feedMatchesOnchain: boolean; lastExecutionTs: number | null; lastRiskChangeTs: number | null }`; `deriveAct(i: ActInput): Act`; `ACTS: { id: Act; label: string; next: string }[]`.

- [ ] **Step 1: Write failing tests** — `act.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAct, type ActInput } from "./act";

const base: ActInput = { mandateExists: true, allocated: true, violated: false, pendingViolated: false, guardrailShown: true, feedMatchesOnchain: true, lastExecutionTs: 100, lastRiskChangeTs: null };

test("1 Program when there is no mandate", () => assert.equal(deriveAct({ ...base, mandateExists: false }), 1));
test("2 Decide when capital is not allocated", () => assert.equal(deriveAct({ ...base, allocated: false }), 2));
test("3 Guard when allocated but guardrail not shown", () => assert.equal(deriveAct({ ...base, guardrailShown: false }), 3));
test("4 Reality when safe, guarded and feed matches", () => assert.equal(deriveAct(base), 4));
test("5 Rebalance when the external feed breaches", () => assert.equal(deriveAct({ ...base, pendingViolated: true, feedMatchesOnchain: false }), 5));
test("5 Rebalance when the onchain view breaches", () => assert.equal(deriveAct({ ...base, violated: true }), 5));
test("done when an execution follows the latest risk change and all is safe", () =>
  assert.equal(deriveAct({ ...base, lastRiskChangeTs: 200, lastExecutionTs: 300 }), "done"));
test("back to 4 when risk changed after the last execution but stayed safe", () =>
  assert.equal(deriveAct({ ...base, lastRiskChangeTs: 400, lastExecutionTs: 300 }), 4));
```

- [ ] **Step 2:** Set `"test": "node --import tsx --test src/lib/*.test.ts"` in `web/package.json`; run `npm test` → FAIL (module not found).

- [ ] **Step 3: Implement** `act.ts`:

```ts
export type Act = 1 | 2 | 3 | 4 | 5 | "done";
export type ActInput = {
  mandateExists: boolean; allocated: boolean; violated: boolean; pendingViolated: boolean;
  guardrailShown: boolean; feedMatchesOnchain: boolean; lastExecutionTs: number | null; lastRiskChangeTs: number | null;
};
export const ACTS: { id: Act; label: string; next: string }[] = [
  { id: 1, label: "Program", next: "Program a mandate" },
  { id: 2, label: "Decide", next: "Preview decision → Run loop" },
  { id: 3, label: "Guard", next: "Guardrail test" },
  { id: 4, label: "Reality", next: "Spike Strategy B → 48" },
  { id: 5, label: "Rebalance", next: "Run loop" },
  { id: "done", label: "Done", next: "Reset feed to replay" },
];
export function deriveAct(i: ActInput): Act {
  if (!i.mandateExists) return 1;
  if (!i.allocated) return 2;
  if (i.violated || i.pendingViolated) return 5;
  if (!i.guardrailShown) return 3;
  if (i.feedMatchesOnchain && i.lastRiskChangeTs !== null && i.lastExecutionTs !== null && i.lastExecutionTs > i.lastRiskChangeTs) return "done";
  return 4;
}
```

- [ ] **Step 4:** `npm test` → all PASS.
- [ ] **Step 5:** Commit `feat(web): derive demo act from state`.

### Task 2: NDJSON stream reader (`lib/stream.ts`)

**Files:** Create `web/src/lib/stream.ts`, test `web/src/lib/stream.test.ts`.

**Interfaces:** Produces `readNdjson<T>(body: ReadableStream<Uint8Array>, onLine: (v: T) => void): Promise<void>`.

- [ ] **Step 1: Failing tests:**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readNdjson } from "./stream";

const streamOf = (...chunks: string[]) => new ReadableStream<Uint8Array>({
  start(c) { for (const s of chunks) c.enqueue(new TextEncoder().encode(s)); c.close(); },
});

test("parses lines split across chunk boundaries", async () => {
  const out: unknown[] = [];
  await readNdjson(streamOf('{"a":1}\n{"b"', ':2}\n'), (v) => out.push(v));
  assert.deepEqual(out, [{ a: 1 }, { b: 2 }]);
});
test("parses a trailing line without newline and skips blanks", async () => {
  const out: unknown[] = [];
  await readNdjson(streamOf('\n{"a":1}\n\n{"z":9}'), (v) => out.push(v));
  assert.deepEqual(out, [{ a: 1 }, { z: 9 }]);
});
test("delivers an error line like any other", async () => {
  const out: { step: string }[] = [];
  await readNdjson<{ step: string }>(streamOf('{"step":"ERROR","status":"error","detail":"x"}\n'), (v) => out.push(v));
  assert.equal(out[0].step, "ERROR");
});
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Implement:**

```ts
export async function readNdjson<T>(body: ReadableStream<Uint8Array>, onLine: (v: T) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const flush = (line: string) => { const t = line.trim(); if (t) onLine(JSON.parse(t) as T); };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) { flush(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
  }
  buf += decoder.decode();
  flush(buf);
}
```

- [ ] **Step 4:** `npm test` → PASS. **Step 5:** Commit `feat(web): NDJSON stream reader`.

### Task 3: Friendly errors (`lib/errors.ts`)

**Files:** Create `web/src/lib/errors.ts`, test `web/src/lib/errors.test.ts`.

**Interfaces:** Produces `type Friendly = { message: string; link?: { label: string; href: string } }`; `friendlyError(err: unknown): Friendly`.

- [ ] **Step 1: Failing tests:**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyError } from "./errors";

test("user rejection", () => assert.match(friendlyError(new Error("User rejected the request.")).message, /rejected the transaction/));
test("pending MetaMask request", () => assert.match(friendlyError({ code: -32002, message: "Requested resource not available." }).message, /pending request/));
test("insufficient gas funds links a faucet", () => {
  const f = friendlyError(new Error("insufficient funds for gas * price + value"));
  assert.match(f.message, /Sepolia ETH/);
  assert.ok(f.link?.href.includes("faucet"));
});
test("rate limit message passes through", () => assert.match(friendlyError(new Error('Rate limited: "keeper-run" is capped at 6 per 60s')).message, /^Rate limited/));
test("custom contract error is kept", () => assert.match(friendlyError(new Error("ExposureExceeded(0xabc, 6000, 4000)")).message, /ExposureExceeded/));
test("fallback uses shortMessage", () => assert.equal(friendlyError({ shortMessage: "boom", message: "long boom" }).message, "boom"));
```

- [ ] **Step 2:** FAIL. **Step 3: Implement:**

```ts
export type Friendly = { message: string; link?: { label: string; href: string } };
export function friendlyError(err: unknown): Friendly {
  const e = (err ?? {}) as { code?: number; shortMessage?: string; message?: string; details?: string };
  const text = [e.shortMessage, e.message, e.details].filter(Boolean).join(" ");
  if (/user rejected|denied transaction|rejected the request/i.test(text)) return { message: "You rejected the transaction in MetaMask." };
  if (e.code === -32002 || /requested resource not available|already pending/i.test(text))
    return { message: "MetaMask has a pending request — open the extension and finish or reject it." };
  if (/insufficient funds/i.test(text))
    return { message: "Not enough Sepolia ETH for gas.", link: { label: "Get Sepolia ETH", href: "https://faucets.chain.link/sepolia" } };
  if (/^Rate limited/.test(e.message ?? "")) return { message: e.message! };
  const custom = text.match(/\b([A-Z][A-Za-z]+(Exceeded|Minimum|NotAllowed|Inactive|Disabled|Paused|Mismatch))\([^)]*\)/);
  if (custom) return { message: `Reverted onchain: ${custom[0]}` };
  return { message: e.shortMessage ?? e.message ?? String(err) };
}
```

- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(web): plain-language error mapping`.

### Task 4: Server — run ids, streamed keeper, richer state

**Files:**
- Modify: `web/src/lib/server/store.ts` (JournalEntry adds `runId?`, `source?: "AGENT" | "CRE"`, kind `"run"`)
- Create: `web/src/lib/server/lastRun.ts` + test `web/src/lib/lastRun.test.ts` (pure, no server-only import)
- Modify: `web/src/lib/server/loop.ts` (`runKeeper(only?, onStep?)`, run ids, final `run` entry; `journalProposal(user, p, strategies, ctx?)`)
- Modify: `web/src/app/api/keeper/run/route.ts` (NDJSON stream)
- Modify: `web/src/app/api/agent/propose/route.ts` (`source: "cre"` body → CRE run id)
- Modify: `web/src/lib/server/state.ts` (`readActivity` returns `{ items, riskHistory }`)
- Modify: `web/src/app/api/state/route.ts` (adds `lastRun`, `latestDecision`, `riskHistory`, `act`)
- Modify: `web/src/lib/client.ts` (types)

**Interfaces:**
- Produces (pure, `lib/server/lastRun.ts`, safe to import in tests): `type RunView = { runId: string; source: "AGENT" | "CRE"; ts: number; steps: LoopStep[] }`; `type RiskPoint = { ts: number; portfolioRisk: number | null; kind: "execution" | "risk-change"; label: string; txHash?: string; source?: "AGENT" | "CRE" }`; `buildLastRun(journal: JournalLike[], history: RiskPoint[]): RunView | null` where `JournalLike = { ts: number; kind: string; runId?: string; source?: "AGENT" | "CRE"; title: string; detail?: string; txHash?: string; data?: unknown }`.
- `LoopStep` moves to `lib/client.ts` and is re-exported from loop.ts.
- `/api/state` JSON adds: `lastRun: RunView | null`, `latestDecision: ProposalResponse-shaped | null`, `riskHistory: RiskPoint[]`, `act: Act`.

- [ ] **Step 1: Failing test** `lastRun.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLastRun } from "./server/lastRun";

const steps = [{ step: "OBSERVE", status: "ok", detail: "o" }, { step: "EXECUTE", status: "ok", detail: "e", txHash: "0x1" }];
test("keeper run uses its persisted steps verbatim", () => {
  const r = buildLastRun([{ ts: 10, kind: "run", runId: "run-1", source: "AGENT", title: "run", data: { steps } }], []);
  assert.equal(r?.runId, "run-1");
  assert.deepEqual(r?.steps, steps);
});
test("CRE run is assembled from decide entry and onchain events", () => {
  const r = buildLastRun(
    [{ ts: 1000, kind: "decide", runId: "cre-1", source: "CRE", title: "AI decision", detail: "exit B" }],
    [
      { ts: 990, portfolioRisk: null, kind: "risk-change", label: "B 34 → 48", txHash: "0xv", source: "CRE" },
      { ts: 1100, portfolioRisk: 14, kind: "execution", label: "Allocation #4", txHash: "0xe", source: "CRE" },
    ],
  );
  assert.equal(r?.source, "CRE");
  const by = Object.fromEntries(r!.steps.map((s) => [s.step, s]));
  assert.equal(by.VERIFY.txHash, "0xv");
  assert.equal(by.DECIDE.status, "ok");
  assert.equal(by.EXECUTE.txHash, "0xe");
});
test("newest run wins; null when nothing ran", () => {
  assert.equal(buildLastRun([], []), null);
  const r = buildLastRun(
    [
      { ts: 10, kind: "run", runId: "run-1", source: "AGENT", title: "run", data: { steps } },
      { ts: 50, kind: "decide", runId: "cre-2", source: "CRE", title: "AI decision" },
    ],
    [],
  );
  assert.equal(r?.runId, "cre-2");
});
```

- [ ] **Step 2:** FAIL. **Step 3: Implement** `lib/server/lastRun.ts`:

```ts
import type { LoopStep } from "../client";
export type RunView = { runId: string; source: "AGENT" | "CRE"; ts: number; steps: LoopStep[] };
export type RiskPoint = { ts: number; portfolioRisk: number | null; kind: "execution" | "risk-change"; label: string; txHash?: string; source?: "AGENT" | "CRE" };
export type JournalLike = { ts: number; kind: string; runId?: string; source?: "AGENT" | "CRE"; title: string; detail?: string; txHash?: string; data?: unknown };
const WINDOW_MS = 5 * 60_000;
export function buildLastRun(journal: JournalLike[], history: RiskPoint[]): RunView | null {
  const keeper = [...journal].reverse().find((j) => j.kind === "run" && j.runId);
  const creDecide = [...journal].reverse().find((j) => j.kind === "decide" && j.source === "CRE" && j.runId);
  let cre: RunView | null = null;
  if (creDecide) {
    const near = (p: RiskPoint) => p.source === "CRE" && Math.abs(p.ts - creDecide.ts) <= WINDOW_MS;
    const verify = history.filter((p) => p.kind === "risk-change" && near(p) && p.ts <= creDecide.ts).pop();
    const exec = history.find((p) => p.kind === "execution" && near(p) && p.ts >= creDecide.ts);
    const idle = (step: string): LoopStep => ({ step, status: "skip", detail: "no onchain evidence" });
    cre = {
      runId: creDecide.runId!, source: "CRE", ts: creDecide.ts,
      steps: [
        { step: "OBSERVE", status: "ok", detail: "Risk feed via Chainlink CRE HTTP consensus" },
        verify ? { step: "VERIFY", status: "ok", detail: verify.label, txHash: verify.txHash } : idle("VERIFY"),
        { step: "DETECT", status: "warn", detail: "Mandate needed action" },
        { step: "DECIDE", status: "ok", detail: creDecide.detail ?? creDecide.title },
        { step: "CONSTRAIN", status: "ok", detail: "Re-validated inside the CRE workflow" },
        exec ? { step: "EXECUTE", status: "ok", detail: exec.label, txHash: exec.txHash } : idle("EXECUTE"),
      ],
    };
  }
  const agent: RunView | null = keeper
    ? { runId: keeper.runId!, source: "AGENT", ts: keeper.ts, steps: ((keeper.data as { steps?: LoopStep[] })?.steps ?? []) }
    : null;
  if (!agent) return cre;
  if (!cre) return agent;
  return cre.ts > agent.ts ? cre : agent;
}
```

- [ ] **Step 4:** PASS.
- [ ] **Step 5: Server wiring** (no new tests beyond e2e in Task 6):
  - `store.ts`: add `runId?: string; source?: "AGENT" | "CRE";` to `JournalEntry` and `"run"` to its `kind` union.
  - `loop.ts`: `export type { LoopStep } from "../client"`; `journalProposal(user, p, strategies, ctx: { runId?: string; source?: "AGENT" | "CRE" } = {})` spreads `ctx` into each `journal({...})`; `runKeeper(only?: Address, onStep?: (s: LoopStep) => void)` creates `const runId = \`run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}\``, wraps `steps.push` in `const push = (s: LoopStep) => { steps.push(s); onStep?.(s); }`, passes `{ runId, source: "AGENT" }` to every `journal` / `journalProposal` call, and before returning writes `await journal({ user: only, kind: "run", runId, source: "AGENT", title: "Keeper loop run", data: { steps } })`.
  - `keeper/run/route.ts`:

```ts
export async function POST(request: Request) {
  const blocked = await limited("keeper-run", 6, 60);
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({}));
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (v: unknown) => controller.enqueue(encoder.encode(JSON.stringify(v) + "\n"));
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
```

  - `agent/propose/route.ts`: `const ctx = body.source === "cre" ? { runId: \`cre-${Date.now()}\`, source: "CRE" as const } : {};` and pass `ctx` to `journalProposal`.
  - `state.ts` `readActivity` returns `{ items, riskHistory }`; `riskHistory` built from the same `exec` (portfolioRisk, label `Allocation #id`, source) and `risk` logs (label `${name} old → new`, source by updater) with block timestamps, sorted ascending.
  - `state/route.ts` computes `latestDecision` (newest journal `decide` entry `data` for the user, mapped to `ProposalResponse` shape: strategies/bps from `allocation`), `lastRun = buildLastRun(journal, riskHistory)`, and `act = deriveAct({...})` with: `guardrailShown` = a `guardrail` journal entry newer than the user's first `AllocationExecuted`; `feedMatchesOnchain` = every strategy's feed risk equals onchain risk; `lastExecutionTs` / `lastRiskChangeTs` from `riskHistory`.
  - `client.ts`: export `LoopStep`, `RunView`, `RiskPoint` (re-declared client-side, same shape), `Act` re-export, and extend `StateResponse` with the four fields.
- [ ] **Step 6:** `npx tsc --noEmit && npx eslint src && npm test` → clean. Commit `feat(web): streamed keeper runs, lastRun, riskHistory, act`.

### Task 5: CRE workflow marks its proposals

**Files:** Modify `cre/kriya-workflow/main.ts` — the propose payload becomes `JSON.stringify({ user, risks, source: "cre" })`.
- [ ] Step 1: edit; Step 2: `cd cre/kriya-workflow && bunx tsc --noEmit` clean; `cd cre && cre workflow build kriya-workflow -T staging-settings` compiles; Step 3: commit `feat(cre): tag proposals with source=cre`.

### Task 6: E2E reads the stream and the new state

**Files:** Modify `web/scripts/e2e.mjs`.
- [ ] **Step 1:** Add `runLoop(user)` helper using `fetch` + a local copy of the NDJSON reader (plain JS) returning `{ steps, done }`; assert steps arrive in pipeline order and the last line has `done: true`. Replace the three `/api/keeper/run` calls with it.
- [ ] **Step 2:** Add assertions: after allocation `state.act === 3`; after guardrail `act === 4`; after spike `act === 5`; after rebalance `act === "done"`; `state.lastRun.source === "AGENT"` with an `EXECUTE` step carrying a txHash; `state.latestDecision.validation.ok === true`; `state.riskHistory` contains an `execution` point with `portfolioRisk === 14` and a `risk-change` point.
- [ ] **Step 3:** Run the e2e stack (Anvil + deploy + server on :3001) and `npm run e2e` → all pass. Commit `test(e2e): streamed loop and mission-control state`.

### Task 7: UI primitives — Toasts and SVG charts

**Files:**
- Create: `web/src/components/Toasts.tsx` — `ToastProvider` (context, top-right stack, `aria-live="polite"`), `useToast(): { success(msg), error(err: unknown), info(msg) }` (error runs `friendlyError`, renders its link, no auto-dismiss; others dismiss after 6s).
- Create: `web/src/components/charts/Donut.tsx` — props `{ slices: { label: string; value: number; color: string }[]; size?: number; center?: ReactNode }`; SVG circle segments via `stroke-dasharray`, `transition: stroke-dasharray .6s`.
- Create: `web/src/components/charts/Gauge.tsx` — props `{ value: number; max: number; ghost?: number | null; label: string }`; semicircle 0–100 scale, safe band to `max`, needle rotation transition, ghost needle dashed.
- Create: `web/src/components/charts/RiskChart.tsx` — props `{ points: RiskPoint[]; max: number }`; step line of execution points' `portfolioRisk`, dashed `max` line, amber diamond markers at risk-change points, `<title>` tooltips; empty state text.
- Modify: `web/src/app/providers.tsx` (wrap children in `ToastProvider`); `web/src/app/globals.css` (keyframes `flash`, `pulse-node`; `@media (prefers-reduced-motion: reduce)` disables animations/transitions).
- [ ] Steps: implement; `tsc`/`eslint` clean; render each in isolation inside the page temporarily is not needed — verified in Task 10 visually. Commit `feat(web): toasts and SVG charts`.

### Task 8: Dashboard components

**Files (create under `web/src/components/dashboard/`):**
- `StatusBadge.tsx` — props `{ state: StateResponse }` → SAFE / AT RISK (verified|unverified) / PAUSED, `key` on label to replay `flash`.
- `MandateCard.tsx` — objective + 4 limit chips ✓/✗ vs health.
- `AllocationPanel.tsx` — `Donut` + legend rows (APY, risk with `→ feed?`, weight, USDC) + `Gauge` (value = health.portfolioRisk, max = params.maxRisk, ghost = pending.portfolioRisk when different).
- `LoopPipeline.tsx` — props `{ live: LoopStep[] | null; running: boolean; lastRun: RunView | null }`; six nodes in a row with rail; node status from live (if running/just ran) else lastRun; one-line detail + `TxLink`; header shows source badge + relative time.
- `DecisionCard.tsx` — props `{ decision: StateResponse["latestDecision"]; strategies }` → engine/model badge, trigger, allocation chips, rationale, assessments (max 3 lines each, expandable), ✓ policy badge.
- `ActivityTimeline.tsx` — props `{ items: StateResponse["activity"] }` → groups consecutive journal items by `runId` (fallback: same minute) under their first title; expand toggle; Etherscan links; scroll within column.
- `StageBar.tsx` — props `{ state; user; readOnly; onRun(): void; running: boolean; onRefresh() }`; act chips from `ACTS` with current highlighted and `next` hint; buttons Preview decision (opens DecisionCard refresh via `api("/api/agent/propose")`), Run loop (calls `onRun`), Spike B → 48, Guardrail test, Reset feed; "⋯" menu with Pause/Resume, Emergency exit (pause then exit — keep existing logic), Withdraw reserve; collapsible with `localStorage` key `kriya.stagebar` in try/catch; all errors → `useToast().error`.
- `TxLink.tsx` — moved from Dashboard.tsx.
- Modify: `web/src/components/Dashboard.tsx` → becomes the grid composing the above; owns `running`/`live` state; `onRun` POSTs `/api/keeper/run` and feeds `readNdjson` lines into `live`, calls `refresh()` after each EXECUTE/VERIFY line and at the end; handles 429/JSON error responses via toast.
- [ ] Steps: implement; `tsc`/`eslint` clean; commit `feat(web): mission control dashboard components`.

### Task 9: Page shell, landing and mandate builder

**Files:**
- Modify: `web/src/lib/config.ts` — `export const DEMO_VIEW_ADDRESS: string | null = ({ 11155111: "0x09855cE865D094F6c2F2B5A13F64FC6F82b3B4C7", 31337: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" } as Record<number, string>)[CHAIN_ID] ?? null;`
- Modify: `web/src/app/page.tsx` — header becomes `TopBar` (wordmark, network pill, StatusBadge when state loaded, read-only pill, wallet button); Landing gets "View the live demo mandate" (`href=?view=${DEMO_VIEW_ADDRESS}`, hidden if null); polling interval `running ? 2000 : 4000` via a `useState` lifted from Dashboard through a callback.
- Modify: `web/src/components/MandateBuilder.tsx` — right column preview: `optimizeAllocation(params, allowed, strategies)` + `validateAllocation` → `Donut`, expected APY, portfolio risk, or the validation error; stepper with three rows (Mint test USDC (skipped when balance ≥ amount) · Approve (skipped when allowance ≥ amount) · Open mandate), each `idle|pending|done|skipped|error` + `TxLink`; errors via toast.
- [ ] Steps: implement; `tsc`/`eslint` clean; commit `feat(web): landing, top bar and live-preview mandate builder`.

### Task 10: Visual verification on a local stack

- [ ] Start Anvil, deploy, `npm run sync`, server on :3001 with Anvil env (as in `e2e.mjs`).
- [ ] Browser pane at 1440×900: landing → `?view=` demo account; run the demo through the StageBar buttons (needs a mandate: open one for account 5 via `npm run e2e` first or cast); screenshot after each act; check no vertical scroll (`document.documentElement.scrollHeight <= innerHeight`), no overflow, pipeline nodes animate in order.
- [ ] Browser pane at 375×812: stacked order, no horizontal scroll (`scrollWidth <= innerWidth`).
- [ ] Fix defects found; re-check only changed views. Commit fixes.

### Task 11: Ship

- [ ] `cd web && npx next typegen && npx tsc --noEmit && npx eslint src && npm test`; full `npm run e2e` on a fresh Anvil.
- [ ] Update README "Run locally" / demo script wording for the stage bar; commit; push; wait for CI green.
- [ ] `vercel deploy --prod`; smoke-test `/`, `/?view=<demo>`, `/api/state`, and one streamed `/api/keeper/run` on Sepolia (reads only when the mandate is safe → no gas).
