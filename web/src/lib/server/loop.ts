import "server-only";
import { BaseError, ContractFunctionRevertedError, type Address, type Hex } from "viem";
import { adminWallet, agentWallet, publicClient } from "./chain";
import { deployment } from "../config";
import { KriyaExecutorAbi, KriyaStrategyRegistryAbi } from "../generated/abis";
import { evaluateHealth, type StrategyView } from "../policy";
import { propose, type DecisionInput, type Proposal } from "./agent";
import { listMandateUsers, readSnapshot, readStrategies } from "./state";
import { getRiskFeed, journal } from "./store";
import type { LoopStep } from "../client";

const name = (strategies: StrategyView[], a: string) =>
  strategies.find((s) => s.address.toLowerCase() === a.toLowerCase())?.name.split(" - ")[0] ?? a.slice(0, 8);

/** Apply a verified external risk view on top of the onchain strategy list. */
export function withRisks(strategies: StrategyView[], risks?: Record<string, number>): StrategyView[] {
  if (!risks) return strategies;
  return strategies.map((s) => ({ ...s, risk: risks[s.address.toLowerCase()] ?? s.risk }));
}

export async function decisionInput(user: Address, risks?: Record<string, number>): Promise<DecisionInput> {
  const snap = await readSnapshot(user);
  if (!snap.mandate.exists) throw new Error("No mandate for this address");
  return {
    user,
    params: snap.mandate.params,
    allowed: snap.mandate.allowed,
    strategies: withRisks(snap.strategies, risks),
    positions: snap.positions,
    idle: snap.idle,
  };
}

export function decodeRevert(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const d = revert.data;
      if (d?.errorName) return `${d.errorName}(${(d.args ?? []).map(String).join(", ")})`;
      return revert.reason ?? revert.shortMessage;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Agent execution path: send the validated proposal to KriyaExecutor.executeAllocation. */
export async function executeViaAgent(user: Address, proposal: Proposal): Promise<Hex> {
  const wallet = agentWallet();
  const args = [
    user,
    proposal.allocation.map((a) => a.strategy as Address),
    proposal.allocation.map((a) => a.bps),
    proposal.rationale,
  ] as const;
  // dry-run against the live mandate first; the contract is the final authority
  await publicClient.simulateContract({
    account: wallet.account,
    address: deployment.executor,
    abi: KriyaExecutorAbi,
    functionName: "executeAllocation",
    args,
  });
  const hash = await wallet.writeContract({
    address: deployment.executor,
    abi: KriyaExecutorAbi,
    functionName: "executeAllocation",
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Execution reverted: ${hash}`);
  return hash;
}

export type RunContext = { runId?: string; source?: "AGENT" | "CRE" };

export async function journalProposal(user: Address, p: Proposal, strategies: StrategyView[], ctx: RunContext = {}) {
  const mix = [...p.allocation.map((a) => `${name(strategies, a.strategy)} ${a.bps / 100}%`)];
  if (p.validation.ok) mix.push(`Reserve ${p.validation.reserveBps / 100}%`);
  if (p.llmRejected?.error === "LLMUnavailable") {
    await journal({ ...ctx, user, kind: "reject", title: "LLM unavailable: deterministic optimizer used", detail: p.llmRejected.detail });
  } else if (p.llmRejected) {
    await journal({
      ...ctx,
      user,
      kind: "reject",
      title: `LLM proposal rejected by policy engine: ${p.llmRejected.error}`,
      detail: `${p.llmRejected.detail}. Falling back to the deterministic optimizer.`,
    });
  }
  await journal({
    ...ctx,
    user,
    kind: "decide",
    title: `${p.engine === "llm" ? `AI decision (${p.model})` : "Deterministic decision"}: ${mix.join(" · ")}`,
    detail: `${p.trigger}. ${p.rationale}`,
    data: p,
  });
  if (p.validation.ok) {
    await journal({
      ...ctx,
      user,
      kind: "constrain",
      title: `Mandate check passed: portfolio risk ${p.validation.portfolioRisk}, expected APY ${(p.validation.expectedApyBps / 100).toFixed(2)}%`,
    });
  }
}

export type { LoopStep } from "../client";

/**
 * Local keeper: the same Observe → Verify → Decide → Constrain → Execute loop as the Chainlink CRE
 * workflow, run from this server with the protocol keys. Used when CRE is not available.
 */
export async function runKeeper(only?: Address, onStep?: (step: LoopStep) => void): Promise<LoopStep[]> {
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const ctx: RunContext = { runId, source: "AGENT" };
  const steps: LoopStep[] = [];
  const push = (step: LoopStep) => {
    steps.push(step);
    onStep?.(step);
  };
  const feed = await getRiskFeed();
  const onchain = await readStrategies();
  push({
    step: "OBSERVE",
    status: "ok",
    detail: onchain.map((s) => `${name(onchain, s.address)} onchain ${s.risk} / feed ${feed.risks[s.address.toLowerCase()] ?? s.risk}`).join(", "),
  });

  // VERIFY: sync changed risk scores onchain
  const changed = onchain.filter((s) => {
    const r = feed.risks[s.address.toLowerCase()];
    return r !== undefined && r !== s.risk;
  });
  if (changed.length) {
    const wallet = adminWallet();
    const hash = await wallet.writeContract({
      address: deployment.registry,
      abi: KriyaStrategyRegistryAbi,
      functionName: "setRisks",
      args: [changed.map((s) => s.address as Address), changed.map((s) => feed.risks[s.address.toLowerCase()])],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    const detail = changed.map((s) => `${name(onchain, s.address)} ${s.risk} → ${feed.risks[s.address.toLowerCase()]}`).join(", ");
    push({ step: "VERIFY", status: "ok", detail: `Risk scores updated onchain: ${detail}`, txHash: hash });
    await journal({ ...ctx, kind: "verify", title: `Keeper verified risk change: ${detail}`, txHash: hash });
  } else {
    push({ step: "VERIFY", status: "skip", detail: "Onchain risk scores match the feed" });
  }

  const strategies = withRisks(onchain, feed.risks);
  const users = only ? [only] : await listMandateUsers();
  for (const user of users) {
    const input = await decisionInput(user, feed.risks).catch(() => null);
    if (!input) continue;
    const snap = await readSnapshot(user);
    if (!snap.mandate.active) {
      push({ step: "DETECT", status: "skip", detail: `${user.slice(0, 8)}: mandate paused` });
      continue;
    }
    const h = evaluateHealth(input.params, input.allowed, strategies, input.positions, input.idle);
    if (h.totalValue === 0n || (h.allocated && !h.violated)) {
      push({ step: "DETECT", status: "ok", detail: `${user.slice(0, 8)}: mandate safe (risk ${h.portfolioRisk}/${input.params.maxRisk})` });
      continue;
    }
    push({
      step: "DETECT",
      status: "warn",
      detail: `${user.slice(0, 8)}: ${h.allocated ? `mandate at risk: ${h.reasons.join("; ")}` : "idle capital awaiting allocation"}`,
    });
    if (h.violated) await journal({ ...ctx, user, kind: "observe", title: "⚠ Mandate at risk", detail: h.reasons.join("; ") });

    const p = await propose(input);
    await journalProposal(user, p, strategies, ctx);
    push({ step: "DECIDE", status: "ok", detail: `${p.engine}: ${p.rationale}` });
    if (!p.validation.ok) {
      push({ step: "CONSTRAIN", status: "error", detail: `${p.validation.error}: ${p.validation.detail}` });
      continue;
    }
    push({ step: "CONSTRAIN", status: "ok", detail: `Portfolio risk ${p.validation.portfolioRisk} within ${input.params.maxRisk}` });
    try {
      const hash = await executeViaAgent(user, p);
      push({ step: "EXECUTE", status: "ok", detail: "Allocation executed", txHash: hash });
    } catch (err) {
      const reason = decodeRevert(err);
      await journal({ ...ctx, user, kind: "reject", title: `Executor refused allocation: ${reason}` });
      push({ step: "EXECUTE", status: "error", detail: reason });
    }
  }
  await journal({ ...ctx, user: only, kind: "run", title: "Keeper loop run", data: { steps } });
  return steps;
}

/** Demonstrate the constraint layer: submit a deliberately unsafe allocation onchain and let it revert. */
export async function guardrailTest(user: Address) {
  const strategies = await readStrategies();
  const b = strategies.find((s) => s.name.startsWith("Strategy B"))!;
  const a = strategies.find((s) => s.name.startsWith("Strategy A"))!;
  const args = [user, [b.address as Address, a.address as Address], [6000, 1500], "UNSAFE TEST: 60% into one strategy"] as const;
  const wallet = agentWallet();

  let reason = "unknown";
  try {
    await publicClient.simulateContract({
      account: wallet.account,
      address: deployment.executor,
      abi: KriyaExecutorAbi,
      functionName: "executeAllocation",
      args,
    });
    reason = "unexpectedly passed simulation";
  } catch (err) {
    reason = decodeRevert(err);
  }
  // Broadcast anyway with a fixed gas limit so the revert is recorded onchain as evidence.
  const hash = await wallet.writeContract({
    address: deployment.executor,
    abi: KriyaExecutorAbi,
    functionName: "executeAllocation",
    args,
    gas: 400_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  await journal({
    user,
    kind: "guardrail",
    title: `Guardrail test: unsafe proposal (Strategy B 60%) ${receipt.status === "reverted" ? "REVERTED onchain" : "was not reverted"}`,
    detail: reason,
    txHash: hash,
  });
  return { hash, status: receipt.status, reason };
}
