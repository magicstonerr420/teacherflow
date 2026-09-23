import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderQueue, inProviderQueue } from "../src/lib/provider-queue.server.ts";
import {
  withTextModelFallback,
  ProviderRejectedError,
  ProviderFormatError,
} from "../src/lib/provider-fallback.server.ts";
import { ProviderRateLimitError } from "../src/lib/provider-retry.server.ts";
const file = () => join(mkdtempSync(join(tmpdir(), "teacherflow-reliability-")), "queue.sqlite");

test("shared queue limits all kinds across SQLite handles and preserves waiting order", () => {
  const path = file(),
    a = new ProviderQueue(path),
    b = new ProviderQueue(path);
  try {
    const t1 = a.enqueue("text", "text"),
      t2 = b.enqueue("text", "text"),
      t3 = a.enqueue("text", "text");
    assert.equal(a.claim(t1), true);
    assert.equal(b.claim(t2), true);
    assert.equal(a.claim(t3), false);
    const image = a.enqueue("image", "image"),
      image2 = b.enqueue("image", "image"),
      audio = b.enqueue("audio", "audio");
    assert.equal(a.claim(image), true);
    assert.equal(b.claim(image2), false);
    assert.equal(b.claim(audio), false);
    a.release(t1);
    assert.equal(a.claim(t3), true);
    a.release(image);
    assert.equal(b.claim(audio), true);
    b.release(t2);
    assert.equal(b.claim(image2), true);
    a.release(t3);
    b.release(image2);
    b.release(audio);
    const first = a.enqueue("text", "text"),
      second = b.enqueue("text", "text");
    assert.equal(b.claim(second), false);
    assert.equal(a.claim(first), true);
    assert.equal(b.claim(second), true);
  } finally {
    a.close();
    b.close();
  }
});
test("cooldowns survive restart, block early retries, and do not block a different model", () => {
  const path = file();
  let now = 1000,
    a = new ProviderQueue(path, () => now);
  const x = a.enqueue("text", "a"),
    y = a.enqueue("text", "b");
  a.cooldown("a", 30_000);
  a.close();
  const b = new ProviderQueue(path, () => now);
  try {
    assert.equal(b.claim(x), false);
    assert.equal(b.claim(y), true);
    now += 30_000;
    assert.equal(b.claim(x), true);
  } finally {
    b.close();
  }
});
test("expired abandoned work releases capacity; cancelled waiter sends no request", async () => {
  const path = file();
  let now = 0;
  const q = new ProviderQueue(path, () => now);
  const old = q.enqueue("image", "image");
  q.claim(old);
  now = 360_001;
  const next = q.enqueue("image", "image");
  assert.equal(q.claim(next), true);
  q.close();
  const previous = process.env.TEACHERFLOW_PROVIDER_QUEUE_DB;
  process.env.TEACHERFLOW_PROVIDER_QUEUE_DB = file();
  const busy = new ProviderQueue(process.env.TEACHERFLOW_PROVIDER_QUEUE_DB),
    held = busy.enqueue("image", "image");
  busy.claim(held);
  const abort = new AbortController();
  let sent = 0;
  try {
    const waiting = inProviderQueue("image", "image", abort.signal, async () => {
      sent++;
    });
    setTimeout(() => abort.abort(), 30);
    await assert.rejects(waiting, /cancelled/i);
    assert.equal(sent, 0);
    assert.equal(busy.db.prepare("SELECT COUNT(*) AS n FROM provider_queue").get().n, 1);
  } finally {
    busy.close();
    previous === undefined
      ? delete process.env.TEACHERFLOW_PROVIDER_QUEUE_DB
      : (process.env.TEACHERFLOW_PROVIDER_QUEUE_DB = previous);
  }
});
test("queue cleanup failures preserve a completed paid response without dispatching again", async () => {
  const previous = process.env.TEACHERFLOW_PROVIDER_QUEUE_DB;
  const release = ProviderQueue.prototype.release;
  const close = ProviderQueue.prototype.close;
  const logError = console.error;
  const messages = [];
  console.error = (message) => messages.push(message);
  try {
    for (const failure of ["release", "close"]) {
      process.env.TEACHERFLOW_PROVIDER_QUEUE_DB = file();
      let sent = 0, closed = 0;
      ProviderQueue.prototype.release = function (id) {
        if (failure === "release") throw Error("Simulated SQLITE_BUSY during queue release");
        return release.call(this, id);
      };
      ProviderQueue.prototype.close = function () {
        closed++;
        close.call(this);
        if (failure === "close") throw Error("Simulated connection cleanup failure");
      };
      const paidResponse = Response.json({ id: "completed-generation", usage: { cost: 0.01 } });
      const result = await inProviderQueue("text", "openai/gpt-5.4-mini", new AbortController().signal, async () => {
        sent++;
        return paidResponse;
      });
      assert.equal(result, paidResponse, "Cleanup cannot replace a paid success with an error that encourages another purchase");
      assert.deepEqual(await result.json(), { id: "completed-generation", usage: { cost: 0.01 } });
      assert.equal(sent, 1);
      assert.equal(closed, 1, "Connection cleanup is still attempted when releasing the lease fails");
    }
    assert.equal(messages.length, 2);
  } finally {
    ProviderQueue.prototype.release = release;
    ProviderQueue.prototype.close = close;
    console.error = logError;
    previous === undefined
      ? delete process.env.TEACHERFLOW_PROVIDER_QUEUE_DB
      : (process.env.TEACHERFLOW_PROVIDER_QUEUE_DB = previous);
  }
});
test("safe text fallback is bounded, honors cooldown, and only uses existing approved models", async () => {
  const signal = new AbortController().signal,
    primary = "deepseek/deepseek-v4-flash-0731",
    backup = "openai/gpt-5.4-mini";
  for (const error of [
    new ProviderRejectedError("Unavailable", 404),
    new ProviderFormatError("Bad JSON", true),
    new ProviderRateLimitError(10_000),
  ]) {
    const calls = [],
      waits = [],
      events = [];
    const result = await withTextModelFallback(
      primary,
      signal,
      async (model) => {
        calls.push(model);
        if (calls.length === 1) throw error;
        return { ok: true };
      },
      { wait: async (ms) => waits.push(ms), onFallback: (...v) => events.push(v) },
    );
    assert.deepEqual(calls, [primary, backup]);
    assert.deepEqual(result, { ok: true });
    assert.equal(events.length, 1);
    assert.deepEqual(waits, error instanceof ProviderRateLimitError ? [10_000] : []);
  }
  let calls = 0;
  await assert.rejects(
    withTextModelFallback(primary, signal, async () => {
      calls++;
      throw new ProviderRejectedError("Unavailable", 404);
    }),
    /Unavailable/,
  );
  assert.equal(calls, 2);
});
test("billing, access, unknown charges, refusals, long cooldown and unknown models never trigger fallback", async () => {
  for (const error of [
    new Error("Uncertain charge"),
    new Error("Provider refused content"),
    new ProviderRejectedError("Denied", 401),
    new ProviderRejectedError("Credits", 402),
    new ProviderRejectedError("Gateway", 503),
    new ProviderFormatError("Invalid JSON, unknown cost", false),
    new ProviderRateLimitError(61_000),
  ]) {
    let calls = 0;
    await assert.rejects(
      withTextModelFallback(
        "deepseek/deepseek-v4-flash-0731",
        new AbortController().signal,
        async () => {
          calls++;
          throw error;
        },
      ),
      (e) => e === error,
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(
    withTextModelFallback("unapproved/model", new AbortController().signal, async () => {
      calls++;
      throw new ProviderRejectedError("Unavailable", 404);
    }),
    /Unavailable/,
  );
  assert.equal(calls, 1);
});
