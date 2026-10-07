// KRIYA autonomous capital loop on Chainlink CRE.
//
//   OBSERVE   fetch the external risk feed (HTTP, DON consensus) + read onchain state (EVM read)
//   VERIFY    if verified risk differs from onchain → signed report → KriyaRegistry risk update
//   DETECT    evaluate every active mandate against the verified risk view
//   DECIDE    ask the KRIYA agent (Claude) for an allocation (HTTP POST, single execution via cache)
//   CONSTRAIN re-validate the proposal with the shared mandate policy inside the workflow
//   EXECUTE   signed report → KriyaExecutor.onReport → onchain mandate check → rebalance
//
// The AI never signs anything. CRE decides what reality allows; the contract has the final word.

import {
  CronCapability,
  EVMClient,
  HTTPClient,
  Runner,
  TxStatus,
  bytesToHex,
  consensusIdenticalAggregation,
  encodeCallMsg,
  getNetwork,
  handler,
  hexToBase64,
  ok,
  LATEST_BLOCK_NUMBER,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk"
import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, parseAbiParameters, zeroAddress, type Address, type Abi } from "viem"
import { z } from "zod"
import { MandateAbi, RegistryAbi, VaultAbi } from "./abi"
// Same policy module the KRIYA agent uses — one rulebook across agent, CRE and contract.
import { evaluateHealth, validateAllocation, type StrategyView } from "../../web/src/lib/policy"

const configSchema = z.object({
  schedule: z.string(),
  agentUrl: z.string(),
  chainName: z.string(),
  executorAddress: z.string(),
  registryAddress: z.string(),
  mandateAddress: z.string(),
  vaultAddress: z.string(),
  gasLimit: z.string(),
})
type Config = z.infer<typeof configSchema>

const REPORT_RISK_UPDATE = 1
const REPORT_ALLOCATION = 2

// ------------------------------------------------------------------ HTTP (offchain reality + agent)

const fetchRiskFeed = (sender: HTTPSendRequester, config: Config): string => {
  const resp = sender.sendRequest({ url: `${config.agentUrl}/api/risk-feed`, method: "GET" as const }).result()
  if (!ok(resp)) throw new Error(`risk feed HTTP ${resp.statusCode}`)
  const feed = JSON.parse(new TextDecoder().decode(resp.body)) as { strategies: { address: string; risk: number }[] }
  // canonical, sorted form so every node produces byte-identical output for consensus
  return JSON.stringify(
    feed.strategies
      .map((s) => ({ address: s.address.toLowerCase(), risk: Math.trunc(s.risk) }))
      .sort((a, b) => a.address.localeCompare(b.address)),
  )
}

const requestProposal = (sender: HTTPSendRequester, config: Config, payload: string): string => {
  const resp = sender
    .sendRequest({
      url: `${config.agentUrl}/api/agent/propose`,
      method: "POST" as const,
      body: Buffer.from(new TextEncoder().encode(payload)).toString("base64"),
      headers: { "Content-Type": "application/json" },
      // one node calls the agent; the rest reuse the cached response
      cacheSettings: { store: true, maxAge: "60s" },
    })
    .result()
  if (!ok(resp)) throw new Error(`agent HTTP ${resp.statusCode}: ${new TextDecoder().decode(resp.body)}`)
  const p = JSON.parse(new TextDecoder().decode(resp.body)) as {
    strategies: string[]
    bps: number[]
    rationale: string
    engine: string
    model: string | null
  }
  return JSON.stringify({ strategies: p.strategies, bps: p.bps, rationale: p.rationale, engine: p.engine, model: p.model })
}

// ------------------------------------------------------------------ EVM helpers

function read<T>(runtime: Runtime<Config>, evm: EVMClient, to: string, abi: Abi, functionName: string, args: unknown[] = []): T {
  const data = encodeFunctionData({ abi, functionName, args } as Parameters<typeof encodeFunctionData>[0])
  const reply = evm
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to: to as Address, data }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()
  return decodeFunctionResult({ abi, functionName, data: bytesToHex(reply.data) } as Parameters<typeof decodeFunctionResult>[0]) as T
}

function writeReport(runtime: Runtime<Config>, evm: EVMClient, kind: number, payload: `0x${string}`): string {
  const encoded = encodeAbiParameters(parseAbiParameters("uint8 kind, bytes payload"), [kind, payload])
  const report = runtime
    .report({ encodedPayload: hexToBase64(encoded), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" })
    .result()
  const res = evm
    .writeReport(runtime, {
      receiver: runtime.config.executorAddress,
      report,
      gasConfig: { gasLimit: runtime.config.gasLimit },
    })
    .result()
  if (res.txStatus !== TxStatus.SUCCESS) throw new Error(`writeReport failed: ${res.errorMessage ?? res.txStatus}`)
  return bytesToHex(res.txHash ?? new Uint8Array(32))
}

// ------------------------------------------------------------------ the loop

const onCron = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainName })
  if (!network) throw new Error(`Unknown chain ${cfg.chainName}`)
  const evm = new EVMClient(network.chainSelector.selector)
  const http = new HTTPClient()
  const summary: string[] = []

  // OBSERVE — external reality, agreed by the DON
  const feedJson = http.sendRequest(runtime, fetchRiskFeed, consensusIdenticalAggregation<string>())(cfg).result()
  const feed = JSON.parse(feedJson) as { address: string; risk: number }[]
  runtime.log(`[OBSERVE] risk feed: ${feed.map((f) => `${f.address.slice(0, 8)}=${f.risk}`).join(", ")}`)

  // OBSERVE — onchain strategy universe
  const [addrs, infos] = read<[readonly Address[], readonly { name: string; apyBps: number; risk: number }[]]>(
    runtime, evm, cfg.registryAddress, RegistryAbi as Abi, "getAll",
  )
  const onchain: StrategyView[] = addrs.map((a, i) => ({ address: a, name: infos[i].name, apyBps: infos[i].apyBps, risk: infos[i].risk }))

  // VERIFY — reconcile verified feed with onchain risk scores
  const verified = onchain.map((s) => ({ ...s, risk: feed.find((f) => f.address === s.address.toLowerCase())?.risk ?? s.risk }))
  const changed = verified.filter((v, i) => v.risk !== onchain[i].risk)
  if (changed.length) {
    const payload = encodeAbiParameters(parseAbiParameters("address[] strategies, uint16[] risks"), [
      changed.map((c) => c.address as Address),
      changed.map((c) => c.risk),
    ])
    const tx = writeReport(runtime, evm, REPORT_RISK_UPDATE, payload)
    const detail = changed.map((c) => `${c.name.split(" - ")[0]} ${onchain.find((o) => o.address === c.address)!.risk}->${c.risk}`).join(", ")
    runtime.log(`[VERIFY] risk report written onchain: ${detail} tx=${tx}`)
    summary.push(`verified ${detail}`)
  } else {
    runtime.log("[VERIFY] onchain risk scores match verified feed")
  }

  // DETECT → DECIDE → CONSTRAIN → EXECUTE, per mandate
  const users = read<readonly Address[]>(runtime, evm, cfg.mandateAddress, MandateAbi as Abi, "users")
  for (const user of users) {
    const m = read<{
      params: { maxRisk: number; maxExposureBps: number; maxDrawdownBps: number; minReserveBps: number; autoRebalance: boolean; objective: string }
      allowedStrategies: readonly Address[]
      active: boolean
    }>(runtime, evm, cfg.mandateAddress, MandateAbi as Abi, "getMandate", [user])
    if (!m.active) {
      runtime.log(`[DETECT] ${user}: mandate paused, skipping`)
      continue
    }
    const [list, amounts, idle] = read<[readonly Address[], readonly bigint[], bigint, bigint]>(
      runtime, evm, cfg.vaultAddress, VaultAbi as Abi, "positionsOf", [user],
    )
    const positions = list.map((s, i) => ({ strategy: s as string, amount: amounts[i] }))
    const allowed = [...m.allowedStrategies] as string[]
    const health = evaluateHealth(m.params, allowed, verified, positions, idle)

    if (health.totalValue === 0n) continue
    if (health.allocated && !health.violated) {
      runtime.log(`[DETECT] ${user}: mandate safe (risk ${health.portfolioRisk}/${m.params.maxRisk})`)
      continue
    }
    if (health.allocated && !m.params.autoRebalance) {
      runtime.log(`[DETECT] ${user}: at risk but auto-rebalance disabled — human action required`)
      continue
    }
    runtime.log(`[DETECT] ${user}: ${health.allocated ? `MANDATE AT RISK — ${health.reasons.join("; ")}` : "idle capital awaiting allocation"}`)

    // DECIDE — the agent proposes using the CRE-verified risk view
    const risks = Object.fromEntries(verified.map((v) => [v.address.toLowerCase(), v.risk]))
    const proposalJson = http
      .sendRequest(runtime, requestProposal, consensusIdenticalAggregation<string>())(cfg, JSON.stringify({ user, risks, source: "cre" }))
      .result()
    const p = JSON.parse(proposalJson) as { strategies: string[]; bps: number[]; rationale: string; engine: string; model: string | null }
    runtime.log(`[DECIDE] ${p.engine}${p.model ? ` (${p.model})` : ""}: ${p.strategies.map((s, i) => `${s.slice(0, 8)}=${p.bps[i]}`).join(", ")} — ${p.rationale}`)

    // CONSTRAIN — never trust the proposal: re-check against the mandate with verified risk
    const allocation = p.strategies.map((s, i) => ({ strategy: s, bps: p.bps[i] }))
    const v = validateAllocation(m.params, allowed, verified, allocation, m.active)
    if (!v.ok) {
      runtime.log(`[CONSTRAIN] REJECTED ${v.error}: ${v.detail} — nothing written onchain`)
      summary.push(`${user.slice(0, 8)} rejected ${v.error}`)
      continue
    }
    runtime.log(`[CONSTRAIN] passed: portfolio risk ${v.portfolioRisk}/${m.params.maxRisk}, reserve ${v.reserveBps / 100}%`)

    // EXECUTE — signed report; KriyaExecutor re-validates onchain before moving capital
    const payload = encodeAbiParameters(parseAbiParameters("address user, address[] strategies, uint16[] bps, string rationale"), [
      user,
      p.strategies as Address[],
      p.bps,
      `[CRE] ${p.rationale}`.slice(0, 280),
    ])
    const tx = writeReport(runtime, evm, REPORT_ALLOCATION, payload)
    runtime.log(`[EXECUTE] rebalance written onchain tx=${tx}`)
    summary.push(`${user.slice(0, 8)} executed ${tx}`)
  }

  return summary.length ? summary.join(" | ") : "no action: all mandates safe"
}

const initWorkflow = (config: Config) => [handler(new CronCapability().trigger({ schedule: config.schedule }), onCron)]

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}
