import "server-only";
import { isAddress, type Address } from "viem";
import { decodeRevert } from "./loop";

export const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...init?.headers },
  });

export const fail = (err: unknown, status = 500) => json({ error: decodeRevert(err) }, { status });

export function parseUser(value: unknown): Address {
  if (typeof value !== "string" || !isAddress(value)) throw new Error("A valid `user` address is required");
  return value;
}
