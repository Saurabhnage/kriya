"use client";

import { useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import type { Abi, Address } from "viem";

/** Send a contract write from the user's wallet and wait for it to be mined. */
export function useTx() {
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(label: string, req: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }) {
    setBusy(label);
    setError(null);
    try {
      const hash = await writeContractAsync(req as Parameters<typeof writeContractAsync>[0]);
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`${label} reverted`);
      return hash;
    } catch (err) {
      const msg = err instanceof Error ? (err as { shortMessage?: string }).shortMessage ?? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setBusy(null);
    }
  }

  return { send, busy, error, setError };
}
