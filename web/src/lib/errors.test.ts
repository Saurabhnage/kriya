import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyError } from "./errors";

test("user rejection", () =>
  assert.match(friendlyError(new Error("User rejected the request.")).message, /rejected the transaction/));

test("pending MetaMask request", () =>
  assert.match(friendlyError({ code: -32002, message: "Requested resource not available." }).message, /pending request/));

test("insufficient gas funds links a faucet", () => {
  const f = friendlyError(new Error("insufficient funds for gas * price + value"));
  assert.match(f.message, /Sepolia ETH/);
  assert.ok(f.link?.href.includes("faucet"));
});

test("rate limit message passes through", () =>
  assert.match(friendlyError(new Error('Rate limited: "keeper-run" is capped at 6 per 60s')).message, /^Rate limited/));

test("gas error names the active chain's token and faucet", () => {
  const f = friendlyError(new Error("insufficient funds for gas"), { symbol: "MON", network: "Monad Testnet", faucet: "https://faucet.monad.xyz" });
  assert.match(f.message, /Monad Testnet MON/);
  assert.equal(f.link?.href, "https://faucet.monad.xyz");
});

test("custom contract error is kept", () =>
  assert.match(friendlyError(new Error("ExposureExceeded(0xabc, 6000, 4000)")).message, /ExposureExceeded/));

test("fallback uses shortMessage", () => assert.equal(friendlyError({ shortMessage: "boom", message: "long boom" }).message, "boom"));

test("non-error values become text", () => assert.equal(friendlyError("plain").message, "plain"));
