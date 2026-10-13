// Writes kriya-workflow config files from ../contracts/deployments/<chainId>.json
// Usage: node sync-config.mjs [agentUrl] [chainId]
//   chainId 11155111 (default) → config.staging.json + config.production.json (Ethereum Sepolia)
//   chainId 10143              → config.monad.json (Monad testnet)
import { readFileSync, writeFileSync } from "node:fs";
const agentUrl = process.argv[2] ?? "http://localhost:3000";
const chainId = Number(process.argv[3] ?? 11155111);
const CHAINS = {
  11155111: { name: "ethereum-testnet-sepolia", files: ["config.staging.json", "config.production.json"] },
  10143: { name: "monad-testnet", files: ["config.monad.json"] },
};
const target = CHAINS[chainId];
if (!target) throw new Error(`Unsupported chain ${chainId}`);
const dep = JSON.parse(readFileSync(new URL(`../contracts/deployments/${chainId}.json`, import.meta.url), "utf8"));
const config = {
  schedule: "*/30 * * * * *",
  agentUrl,
  chainName: target.name,
  executorAddress: dep.executor,
  registryAddress: dep.registry,
  mandateAddress: dep.mandate,
  vaultAddress: dep.vault,
  gasLimit: "1500000",
};
for (const f of target.files) writeFileSync(new URL(`./kriya-workflow/${f}`, import.meta.url), JSON.stringify(config, null, 2) + "\n");
console.log("CRE config written:", target.files.join(", "), config);
