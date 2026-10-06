import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  evaluateHealth,
  optimizeAllocation,
  validateAllocation,
  type Allocation,
  type MandateParams,
  type StrategyView,
  type Validation,
} from "../policy";

// KRIYA decision engine.
// The LLM researches and proposes. It never touches keys or contracts: its output is parsed into
// a typed allocation, checked by the policy mirror, and only then handed to CRE / the executor —
// which re-check it against the onchain mandate.

export const MODEL = process.env.KRIYA_MODEL ?? "claude-sonnet-5-5";

export type DecisionInput = {
  user: string;
  params: MandateParams;
  allowed: string[];
  strategies: StrategyView[]; // risk = verified risk view used for this decision
  positions: { strategy: string; amount: bigint }[];
  idle: bigint;
};

export type Proposal = {
  allocation: Allocation;
  rationale: string;
  analysis: { strategy: string; assessment: string }[];
  trigger: string;
  engine: "llm" | "deterministic";
  model?: string;
  llmRejected?: { error: string; detail: string };
  validation: Validation;
  baseline: Allocation;
  createdAt: number;
};

const ProposalSchema = z.object({
  allocations: z.array(z.object({ strategy: z.string(), bps: z.number().int() })),
  rationale: z.string(),
  analysis: z.array(z.object({ strategy: z.string(), assessment: z.string() })),
});

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["allocations", "rationale", "analysis"],
  properties: {
    allocations: {
      type: "array",
      description: "Capital per strategy in basis points. Omit strategies receiving 0. The remainder stays in the USDC reserve.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["strategy", "bps"],
        properties: { strategy: { type: "string", description: "Strategy contract address" }, bps: { type: "integer" } },
      },
    },
    rationale: {
      type: "string",
      description: "One or two sentences (max 220 characters) explaining the decision. Stored onchain.",
    },
    analysis: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["strategy", "assessment"],
        properties: { strategy: { type: "string" }, assessment: { type: "string" } },
      },
    },
  },
} as const;

const SYSTEM = `You are KRIYA, an autonomous capital allocator operating under a user's programmable financial mandate.
You propose allocations; you never execute them. Every proposal is re-validated by a deterministic policy engine, by a Chainlink CRE workflow, and finally by the KriyaExecutor smart contract, which reverts anything outside the mandate.

Hard rules your proposal must satisfy (otherwise it is discarded):
- Only use allowed strategies, each at most maxExposureBps.
- Never hold a strategy whose verified risk exceeds maxRisk.
- Keep at least minReserveBps in the USDC reserve (risk 2).
- Portfolio risk = sum(bps_i * risk_i) + reserveBps * 2, divided by 10000, must be <= maxRisk.
- bps are integers; total allocated bps <= 10000 - minReserveBps.

Objective: pursue the mandate's objective (typically the best risk-adjusted yield) within those rules. Prefer stability: avoid needless churn when the current allocation is still compliant, and when a strategy breaches the mandate, move its capital to the best compliant alternative.
Write the rationale for an end user: concrete numbers, no hype.`;

const fmt = (v: bigint) => (Number(v) / 1e6).toFixed(2);

function describe(input: DecisionInput, trigger: string) {
  const total = input.positions.reduce((a, p) => a + p.amount, input.idle);
  return JSON.stringify(
    {
      trigger,
      mandate: { ...input.params, allowedStrategies: input.allowed },
      capitalUsdc: fmt(total),
      currentPositions: [
        ...input.positions
          .filter((p) => p.amount > 0n)
          .map((p) => ({ strategy: p.strategy, usdc: fmt(p.amount), bps: total ? Number((p.amount * 10000n) / total) : 0 })),
        { strategy: "USDC_RESERVE", usdc: fmt(input.idle) },
      ],
      strategies: input.strategies.map((s) => ({
        address: s.address,
        name: s.name,
        expectedApyPct: s.apyBps / 100,
        verifiedRisk: s.risk,
      })),
    },
    null,
    2,
  );
}

let client: Anthropic | null = null;

async function askClaude(input: DecisionInput, trigger: string) {
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: JSON_SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Decide the allocation for this mandate. Context:\n${describe(input, trigger)}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("model declined the request");
  if (response.stop_reason === "max_tokens") throw new Error("model output truncated");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { parsed: ProposalSchema.parse(JSON.parse(text)), model: response.model };
}

const cache = new Map<string, Proposal>();
const CACHE_MS = 120_000;

export function triggerFor(input: DecisionInput): string {
  const h = evaluateHealth(input.params, input.allowed, input.strategies, input.positions, input.idle);
  if (!h.allocated) return "Initial allocation of idle capital";
  if (h.violated) return `MANDATE AT RISK: ${h.reasons.join("; ")}`;
  return "Periodic re-evaluation (mandate compliant)";
}

/**
 * Produce a validated allocation proposal. Identical inputs within the cache window return the
 * identical proposal, so every CRE node (and retries) observe the same decision.
 */
export async function propose(input: DecisionInput): Promise<Proposal> {
  const key = JSON.stringify(input, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  const hit = cache.get(key);
  if (hit && Date.now() - hit.createdAt < CACHE_MS) return hit;

  const trigger = triggerFor(input);
  const baseline = optimizeAllocation(input.params, input.allowed, input.strategies);
  const check = (a: Allocation) => validateAllocation(input.params, input.allowed, input.strategies, a);

  let proposal: Proposal | null = null;
  let llmRejected: Proposal["llmRejected"];
  if (process.env.KRIYA_LLM !== "off") {
    try {
      const { parsed, model } = await askClaude(input, trigger);
      const allocation = parsed.allocations.filter((a) => a.bps > 0);
      const validation = check(allocation);
      if (validation.ok) {
        proposal = {
          allocation,
          rationale: parsed.rationale.slice(0, 280),
          analysis: parsed.analysis,
          trigger,
          engine: "llm",
          model,
          validation,
          baseline,
          createdAt: Date.now(),
        };
      } else {
        llmRejected = { error: validation.error, detail: validation.detail };
      }
    } catch (err) {
      llmRejected = { error: "LLMUnavailable", detail: err instanceof Error ? err.message : String(err) };
    }
  }

  if (!proposal) {
    const validation = check(baseline);
    const s = (a: string) => input.strategies.find((x) => x.address.toLowerCase() === a.toLowerCase())?.name ?? a;
    proposal = {
      allocation: baseline,
      rationale: `Deterministic optimizer: highest-yield strategies within risk ${input.params.maxRisk}, ${input.params.maxExposureBps / 100}% cap each, ${input.params.minReserveBps / 100}% reserve. ${baseline.map((a) => `${s(a.strategy).split(" - ")[0]} ${a.bps / 100}%`).join(", ")}.`,
      analysis: input.strategies.map((x) => ({
        strategy: x.address,
        assessment: x.risk > input.params.maxRisk ? `Excluded: risk ${x.risk} > ${input.params.maxRisk}` : `Eligible: ${x.apyBps / 100}% APY, risk ${x.risk}`,
      })),
      trigger,
      engine: "deterministic",
      llmRejected,
      validation,
      baseline,
      createdAt: Date.now(),
    };
  }
  cache.set(key, proposal);
  return proposal;
}
