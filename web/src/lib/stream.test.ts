import { test } from "node:test";
import assert from "node:assert/strict";
import { readNdjson } from "./stream";

const streamOf = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const s of chunks) c.enqueue(new TextEncoder().encode(s));
      c.close();
    },
  });

test("parses lines split across chunk boundaries", async () => {
  const out: unknown[] = [];
  await readNdjson(streamOf('{"a":1}\n{"b"', ":2}\n"), (v) => out.push(v));
  assert.deepEqual(out, [{ a: 1 }, { b: 2 }]);
});

test("parses a trailing line without newline and skips blanks", async () => {
  const out: unknown[] = [];
  await readNdjson(streamOf('\n{"a":1}\n\n{"z":9}'), (v) => out.push(v));
  assert.deepEqual(out, [{ a: 1 }, { z: 9 }]);
});

test("delivers an error line like any other", async () => {
  const out: { step: string }[] = [];
  await readNdjson<{ step: string }>(streamOf('{"step":"ERROR","status":"error","detail":"x"}\n'), (v) => out.push(v));
  assert.equal(out[0].step, "ERROR");
});

test("handles a multi-byte character split across chunks", async () => {
  const bytes = new TextEncoder().encode('{"t":"34 → 48"}\n');
  const cut = bytes.indexOf(0xe2) + 1;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes.slice(0, cut));
      c.enqueue(bytes.slice(cut));
      c.close();
    },
  });
  const out: { t: string }[] = [];
  await readNdjson<{ t: string }>(stream, (v) => out.push(v));
  assert.equal(out[0].t, "34 → 48");
});
