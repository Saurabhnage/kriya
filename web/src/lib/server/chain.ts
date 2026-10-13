import "server-only";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, PUBLIC_RPC_URL } from "../config";

const RPC_URL = process.env.RPC_URL ?? PUBLIC_RPC_URL;

// Public RPCs throttle bursts: fold parallel reads into one multicall and retry transient errors.
export const publicClient = createPublicClient({
  chain,
  batch: { multicall: true },
  transport: http(RPC_URL, { retryCount: 4, retryDelay: 400 }),
});

/**
 * Event-log reads. Monad's public RPC caps eth_getLogs at 100 blocks (with 400 ms blocks), so on
 * Monad logs go to Envio HyperRPC when LOGS_RPC_URL is set, which serves large ranges in one call.
 */
const LOGS_RPC_URL = process.env.LOGS_RPC_URL?.trim();
export const logsClient = LOGS_RPC_URL
  ? createPublicClient({ chain, transport: http(LOGS_RPC_URL, { retryCount: 3, retryDelay: 400 }) })
  : publicClient;
/** Max block span per eth_getLogs call, and how far back to look when the RPC is range-capped. */
export const LOG_RANGE = LOGS_RPC_URL
  ? { chunk: 500_000n, lookback: null }
  : chain.id === 10143
    ? { chunk: 99n, lookback: 400n }
    : { chunk: 9_000n, lookback: null };

function wallet(envName: string) {
  const pk = process.env[envName]?.trim();
  if (!pk) throw new Error(`${envName} is not set`);
  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
  return createWalletClient({ account, chain, transport: http(RPC_URL) });
}

/** Signer for the KRIYA agent role on KriyaExecutor (bounded: can only call executeAllocation). */
export const agentWallet = () => wallet("AGENT_PRIVATE_KEY");

/** Protocol owner. Used only by the local keeper fallback to post verified risk scores. */
export const adminWallet = () => wallet(process.env.ADMIN_PRIVATE_KEY ? "ADMIN_PRIVATE_KEY" : "AGENT_PRIVATE_KEY");
