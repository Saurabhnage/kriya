import { defineChain, type Address } from "viem";
import { sepolia, foundry, monadTestnet } from "viem/chains";
import { deployments } from "./generated/deployments";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111);

const local = defineChain({ ...foundry, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } });
const CHAINS = {
  11155111: { chain: sepolia, rpc: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io", faucet: "https://faucets.chain.link/sepolia" },
  10143: { chain: monadTestnet, rpc: "https://testnet-rpc.monad.xyz", explorer: "https://testnet.monadexplorer.com", faucet: "https://faucet.monad.xyz" },
  31337: { chain: local, rpc: "http://127.0.0.1:8545", explorer: null, faucet: null },
} as const;
const cfg = CHAINS[CHAIN_ID as keyof typeof CHAINS] ?? CHAINS[11155111];

export const chain = cfg.chain;
export const PUBLIC_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? cfg.rpc;
export const EXPLORER: string | null = cfg.explorer;
/** Where to get testnet gas for this chain (shown in "not enough gas" errors). */
export const FAUCET: string | null = cfg.faucet;
export const GAS_SYMBOL = chain.nativeCurrency.symbol;

type Deployment = {
  chainId: number;
  deployBlock: number;
  usdc: Address;
  registry: Address;
  mandate: Address;
  vault: Address;
  executor: Address;
  forwarder: Address;
  agent: Address;
  strategyA: Address;
  strategyB: Address;
  strategyC: Address;
};

const all = deployments as unknown as Record<string, Deployment>;
const dep = all[String(CHAIN_ID)];
if (!dep) {
  throw new Error(`No KRIYA deployment for chain ${CHAIN_ID}. Deploy contracts, then run \`npm run sync\`.`);
}
export const deployment: Deployment = dep;

export const USDC_DECIMALS = 6;

export const DEMO_MANDATE = {
  capital: 1_000,
  objective: "Maximize risk-adjusted yield",
  maxRisk: 40,
  maxExposureBps: 4000,
  maxDrawdownBps: 500,
  minReserveBps: 2500,
  autoRebalance: true,
};

export const txUrl = (hash: string) => (EXPLORER ? `${EXPLORER}/tx/${hash}` : null);
export const addressUrl = (a: string) => (EXPLORER ? `${EXPLORER}/address/${a}` : null);

/** A live mandate judges can open read-only from the landing page, per chain. */
export const DEMO_VIEW_ADDRESS: string | null =
  ({ 11155111: "0x09855cE865D094F6c2F2B5A13F64FC6F82b3B4C7", 10143: "0x09855cE865D094F6c2F2B5A13F64FC6F82b3B4C7", 31337: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" } as Record<number, string>)[CHAIN_ID] ?? null;
