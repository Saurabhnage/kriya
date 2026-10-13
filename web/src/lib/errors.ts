// Turn wallet, viem and API errors into one plain sentence a demo audience can read.

export type Friendly = { message: string; link?: { label: string; href: string } };

export type GasInfo = { symbol: string; network: string; faucet: string | null };
const DEFAULT_GAS: GasInfo = { symbol: "ETH", network: "Sepolia", faucet: "https://faucets.chain.link/sepolia" };

export function friendlyError(err: unknown, gas: GasInfo = DEFAULT_GAS): Friendly {
  if (typeof err === "string") return { message: err };
  const e = (err ?? {}) as { code?: number; shortMessage?: string; message?: string; details?: string };
  const text = [e.shortMessage, e.message, e.details].filter(Boolean).join(" ");

  if (/user rejected|user denied|denied transaction|rejected the request/i.test(text)) {
    return { message: "You rejected the transaction in MetaMask." };
  }
  if (e.code === -32002 || /requested resource not available|already pending/i.test(text)) {
    return { message: "MetaMask has a pending request — open the extension and finish or reject it." };
  }
  if (/insufficient funds/i.test(text)) {
    return {
      message: `Not enough ${gas.network} ${gas.symbol} for gas.`,
      link: gas.faucet ? { label: `Get ${gas.symbol}`, href: gas.faucet } : undefined,
    };
  }
  if (/^Rate limited/.test(e.message ?? "")) return { message: e.message as string };

  const custom = text.match(/\b[A-Z][A-Za-z]+(?:Exceeded|Minimum|NotAllowed|Inactive|Disabled|Paused|Mismatch|Overflow)\([^)]*\)/);
  if (custom) return { message: `Reverted onchain: ${custom[0]}` };

  return { message: e.shortMessage ?? e.message ?? String(err) };
}
