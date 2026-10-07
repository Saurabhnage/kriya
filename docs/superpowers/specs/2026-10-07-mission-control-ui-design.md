# KRIYA Mission Control UI — Design

Date: 2026-10-07 · Status: approved in chat, pending spec review

## Goal

Redesign the KRIYA web app so a judge or a live audience can follow the autonomous capital
loop at a glance during a 3-minute demo, and a judge exploring alone can understand it without
guidance. The visual identity (dark ink, mint/blue accents, the deck's palette) stays; hierarchy,
layout, charts and motion change.

Primary audience: judges + live stage demo. Real end users are served by the same screens but are
not the optimization target.

## Non-goals

- No contract changes, no new chains, no new decision-engine behaviour.
- No chart library; no new state store beyond what exists (Redis/file store).
- No redesign of the pitch deck.

## Layout (desktop, 12-column grid, fits 1440×900 without scrolling)

| Region | Width | Contents |
| --- | --- | --- |
| Top bar | full | KRIYA wordmark · network pill · mandate status badge (✓ SAFE / ⚠ AT RISK / ⏸ PAUSED, pulses on change) · wallet button / read-only pill |
| Left column | 3/12 | Mandate card (objective + 4 limit chips) · Allocation donut + strategy list · Risk gauge (semicircle, current vs limit, "unverified" marker when the external feed differs from onchain) |
| Centre (hero) | 6/12 | Loop pipeline · Latest decision card · Risk-over-time chart |
| Right column | 3/12 | Activity timeline grouped by loop run |
| Stage bar | full, bottom, collapsible | Act indicator · demo buttons · "⋯" human-override menu |

Below 1100px the regions stack in priority order: top bar → loop pipeline → decision → allocation +
gauge → risk chart → activity; the stage bar becomes a bottom sheet. No horizontal scroll at 375px.

When the connected wallet has no mandate, the centre region shows the mandate builder (below).

## Components

All under `web/src/components/dashboard/` unless noted; each is a single-purpose client component.

- **TopBar** — wordmark, network pill, `StatusBadge` (derived from snapshot + pending health), wallet.
- **MandateCard** — objective text and limit chips (max risk, max exposure, min reserve, auto-rebalance), each chip green ✓ or red ✗ against live health.
- **AllocationDonut** — SVG donut of strategy weights + reserve, legend list with APY / risk / weight / USDC. Risk above the mandate limit renders in the danger colour; a pending feed value shows as `34 → 48?`.
- **RiskGauge** — SVG semicircle: needle at portfolio risk, band up to the limit, ghost needle at the unverified feed risk when it differs.
- **LoopPipeline** — six nodes OBSERVE → VERIFY → DETECT → DECIDE → CONSTRAIN → EXECUTE connected by a rail. Node states: idle, running (pulse), ok, skip (dim), warn, error. Each node shows a one-line result and, where present, a tx link. Shows the live run while streaming, otherwise `lastRun` from state, labelled with source (KRIYA keeper / Chainlink CRE) and relative time.
- **DecisionCard** — engine + model badge, trigger line, allocation chips, rationale, per-strategy assessments, validation badges (✓ policy engine, ✓ onchain after execution). Empty state explains what will appear.
- **RiskChart** — SVG step chart of portfolio risk after each execution, dashed max-risk line, markers at verified risk changes; tooltips via `<title>`.
- **ActivityTimeline** — items grouped by run id (journal) and by tx (onchain); icons, relative time, CRE/AGENT badges, Etherscan links; groups collapsed to their headline with an expand toggle.
- **StageBar** — act indicator (1 Program → 2 Decide → 3 Guard → 4 Reality → 5 Rebalance → Done) highlighting the current act and its suggested next button; buttons Preview decision · Run loop · Spike B → 48 · Guardrail test · Reset feed; "⋯" menu with Pause/Resume agent, Emergency exit, Withdraw reserve (wallet actions, disabled in read-only view). Collapsible; remembers collapsed state in localStorage (try/catch).
- **Toasts** (`components/Toasts.tsx`) — top-right stack; success / error / info; auto-dismiss 6s except errors.
- **Landing** (`app/page.tsx`) — one-line hero, "View the live demo mandate" and "Connect wallet". The demo address is `DEMO_VIEW_ADDRESS` in `lib/config.ts`, keyed by chain id (Sepolia: the deployer `0x09855cE865D094F6c2F2B5A13F64FC6F82b3B4C7`; Anvil: test account 5); the button is hidden when the current chain has none.
- **MandateBuilder** (existing, reworked) — two columns: limits form left; live preview right (donut, expected APY, portfolio risk computed client-side with `optimizeAllocation` + `validateAllocation` from `lib/policy.ts`); a 3-step transaction stepper (mint shortfall → approve → openMandate) with per-step pending/confirmed/skip status and tx links; resumes by re-reading balance/allowance.

## Data and behaviour

### Streamed loop runs
- `runKeeper(user, onStep)` in `lib/server/loop.ts` gains an `onStep(step)` callback invoked as each step completes; it still returns the full list.
- `POST /api/keeper/run` responds with `content-type: application/x-ndjson`, writing one JSON `LoopStep` per line as steps complete, then a final `{"done":true,"runId":...}` line. Rate limiting and errors: a limited/failed request returns a normal JSON error response (non-stream) with the existing status codes; an error mid-run is written as a `{"step":"ERROR","status":"error","detail":...}` line before closing.
- Client: `lib/stream.ts` `readNdjson(response, onLine)` parses the stream (handles partial chunks); `LoopPipeline` updates node state per line. Polling drops to 2s while a run is active.

### Run ids and lastRun
- Every journal entry written during a keeper run carries `runId` (`run-<timestamp>-<rand>`) and `source: "AGENT"`; proposals requested by CRE through `/api/agent/propose` get `runId` `cre-<timestamp>` and `source: "CRE"` when the request body includes `source: "cre"` (the CRE workflow sends it).
- `/api/state` adds `lastRun: { runId, source, ts, steps: LoopStep[] } | null`:
  - Keeper runs persist their full step list in a final journal entry `{ kind: "run", runId, data: { steps } }`; `lastRun` uses it verbatim.
  - CRE runs write no step list (the workflow runs outside the app). Their `lastRun` is assembled from what is observable: VERIFY from `RiskUpdated` events written by the executor, DECIDE + CONSTRAIN from the `decide` journal entry with that `runId`, EXECUTE from the `AllocationExecuted` event with `source = CRE` in the same window (≤ 5 min after the decide entry). OBSERVE and DETECT are marked ok when DECIDE exists. Nodes with no evidence render as idle.
  - The newer of the two (by timestamp) is `lastRun`.

### New state fields (`GET /api/state`)
- `latestDecision`: newest `decide` journal entry's `data` (the Proposal) for the user, or null.
- `riskHistory`: `{ ts, portfolioRisk, kind: "execution" | "risk-change", label, txHash }[]`, from `AllocationExecuted` (portfolioRisk) and `RiskUpdated` events already fetched for activity, sorted by time.
- `act`: derived by `lib/act.ts` `deriveAct(snapshot, pending, journal)` → `1..5 | "done"`:
  1 no mandate · 2 mandate, not allocated · 3 allocated, no guardrail entry since the mandate's last allocation · 4 guardrail shown, feed == onchain, safe · 5 pending or onchain violated · done: an execution after the latest risk change restored a safe mandate.

### Status, motion, charts
- Status changes trigger a 1.2s highlight on the badge and the affected card (CSS animation keyed on the value).
- Donut, gauge and chart animate value changes with CSS transitions on SVG attributes (`stroke-dasharray`, `transform`).
- No chart library.

## Errors

`lib/errors.ts` `friendlyError(err)` maps wallet/viem/API errors to plain language:
- user rejected → "You rejected the transaction in MetaMask."
- insufficient funds → "Not enough Sepolia ETH for gas." + faucet link
- `-32002` / "Requested resource not available" → "MetaMask has a pending request — open the extension."
- HTTP 429 → the API's rate-limit message with retry seconds
- contract revert → the decoded custom error name and args
- fallback → the short message
All surfaced through Toasts; inline red lines are removed except form validation in the builder.

## Accessibility and theming

- Colour never carries meaning alone: statuses also say SAFE / AT RISK / PAUSED; nodes also show ✓ / ⚠ / ✗ text.
- Body text ≥ 4.5:1 contrast on its background; focus rings visible on all buttons.
- Respect `prefers-reduced-motion` (disable pulses and transitions).

## Testing

- Unit (node:test + tsx, `npm test`): `deriveAct` (every act and the done state), `readNdjson` (chunk boundaries, trailing line, error line), `friendlyError` mappings, plus the existing policy tests.
- E2E (`npm run e2e`): keeper calls read the NDJSON stream; assert steps arrive in order OBSERVE…EXECUTE and the final `done` line; assert `/api/state` returns `lastRun`, `latestDecision`, `riskHistory`, `act` consistent with the scenario (act 2 → 3 → 4 → 5 → done).
- Visual: the browser pane at 1440×900 and 375×812 against a local Anvil stack, running the full demo; screenshots checked for overflow, overlap and the no-scroll desktop fit.
- CI unchanged in shape; runs the updated suites.

## Rollout

Ship behind no flag: the redesign replaces the current dashboard. Redeploy to Vercel after CI is green; README screenshots/text updated where they describe the dashboard.
