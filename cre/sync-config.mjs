// Writes kriya-workflow/config.*.json from ../contracts/deployments/<chainId>.json
// Usage: node sync-config.mjs [agentUrl]   (default http://localhost:3000)
import { readFileSync, writeFileSync } from "node:fs";
const dep = JSON.parse(readFileSync(new URL("../contracts/deployments/11155111.json", import.meta.url), "utf8"));
const agentUrl = process.argv[2] ?? "http://localhost:3000";
const config = {
  schedule: "*/30 * * * * *",
  agentUrl,
  chainName: "ethereum-testnet-sepolia",
  executorAddress: dep.executor,
  registryAddress: dep.registry,
  mandateAddress: dep.mandate,
  vaultAddress: dep.vault,
  gasLimit: "1500000",
};
for (const t of ["staging", "production"]) {
  writeFileSync(new URL(`./kriya-workflow/config.${t}.json`, import.meta.url), JSON.stringify(config, null, 2) + "\n");
}
console.log("CRE config written:", config);
