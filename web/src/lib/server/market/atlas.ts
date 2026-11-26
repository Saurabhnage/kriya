import "server-only";
import { formatUnits, isAddress, parseAbi, type Address } from "viem";
import { publicClient } from "../chain";

// Atlas Oracle price feeds, read onchain on BNB Chain. Atlas single-feed contracts are
// Chainlink AggregatorV3-compatible. Configure addresses per pair in .env:
//   ATLAS_FEED_BNB_USD, ATLAS_FEED_USDT_USD, ATLAS_FEED_USDC_USD

const FEED_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);

const PAIRS = { BNB: "ATLAS_FEED_BNB_USD", USDT: "ATLAS_FEED_USDT_USD", USDC: "ATLAS_FEED_USDC_USD" } as const;
const MAX_AGE_S = Number(process.env.ATLAS_MAX_AGE_SECONDS ?? 86_400);

export type AtlasPrice = { symbol: string; feed: Address; description: string; price: number; updatedAt: number; roundId: string; stale: boolean };

export function atlasFeeds(): { symbol: keyof typeof PAIRS; feed: Address }[] {
  return (Object.entries(PAIRS) as [keyof typeof PAIRS, string][])
    .map(([symbol, env]) => ({ symbol, feed: process.env[env]?.trim() ?? "" }))
    .filter((x): x is { symbol: keyof typeof PAIRS; feed: Address } => isAddress(x.feed));
}

export async function readAtlas(): Promise<AtlasPrice[]> {
  const feeds = atlasFeeds();
  const out = await Promise.all(
    feeds.map(async ({ symbol, feed }): Promise<AtlasPrice | null> => {
      try {
        const [decimals, description, round] = await Promise.all([
          publicClient.readContract({ address: feed, abi: FEED_ABI, functionName: "decimals" }),
          publicClient.readContract({ address: feed, abi: FEED_ABI, functionName: "description" }).catch(() => `${symbol} / USD`),
          publicClient.readContract({ address: feed, abi: FEED_ABI, functionName: "latestRoundData" }),
        ]);
        const [roundId, answer, , updatedAt] = round;
        if (answer <= 0n) return null;
        const updated = Number(updatedAt);
        return {
          symbol,
          feed,
          description,
          price: Number(formatUnits(answer, decimals)),
          updatedAt: updated * 1000,
          roundId: roundId.toString(),
          stale: Date.now() / 1000 - updated > MAX_AGE_S,
        };
      } catch {
        return null;
      }
    }),
  );
  return out.filter((x): x is AtlasPrice => x !== null);
}
