import "server-only";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, PUBLIC_RPC_URL } from "../config";

const RPC_URL = process.env.RPC_URL ?? PUBLIC_RPC_URL;

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

function wallet(envName: string) {
  const pk = process.env[envName];
  if (!pk) throw new Error(`${envName} is not set`);
  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
  return createWalletClient({ account, chain, transport: http(RPC_URL) });
}

/** Signer for the KRIYA agent role on KriyaExecutor (bounded: can only call executeAllocation). */
export const agentWallet = () => wallet("AGENT_PRIVATE_KEY");

/** Protocol owner. Used only by the local keeper fallback to post verified risk scores. */
export const adminWallet = () => wallet(process.env.ADMIN_PRIVATE_KEY ? "ADMIN_PRIVATE_KEY" : "AGENT_PRIVATE_KEY");
