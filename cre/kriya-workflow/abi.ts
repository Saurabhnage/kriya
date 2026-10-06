import { parseAbi } from "viem"

export const RegistryAbi = parseAbi([
  "struct Strategy { string name; uint16 apyBps; uint16 risk; uint64 updatedAt; bool active; }",
  "function getAll() view returns (address[] addrs, Strategy[] infos)",
])

export const MandateAbi = parseAbi([
  "struct Params { uint16 maxRisk; uint16 maxExposureBps; uint16 maxDrawdownBps; uint16 minReserveBps; bool autoRebalance; string objective; }",
  "struct Mandate { Params params; address[] allowedStrategies; bool active; uint64 createdAt; uint64 updatedAt; }",
  "function users() view returns (address[])",
  "function getMandate(address user) view returns (Mandate)",
])

export const VaultAbi = parseAbi([
  "function positionsOf(address user) view returns (address[] strategies, uint256[] amounts, uint256 idle, uint256 total)",
])
