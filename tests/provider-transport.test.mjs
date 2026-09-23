import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requestReadingOpenRouter } from "../src/lib/openrouter.server.ts";
import { withBetaBudget, BetaBudget } from "../src/lib/beta-budget.server.ts";
import { observeGeneration, ManagementStore } from "../src/lib/management-store.server.ts";
const args = {
  system: "Teacher",
  input: "Adults C2: The Future of Society",
  schemaName: "test_reading",
  schema: { type: "object" },
};
const names = [
  "OPENROUTER_API_KEY",
  "TEACHERFLOW_BUDGET_DB",
  "TEACHERFLOW_PROVIDER_QUEUE_DB",
  "TEACHERFLOW_MANAGEMENT_DB",
];
async function isolated(run) {
  const old = Object.fromEntries(names.map((n) => [n, process.env[n]])),
    fetch = globalThis.fetch,
    dir = mkdtempSync(join(tmpdir(), "teacherflow-provider-transport-"));
  process.env.OPENROUTER_API_KEY = "test-placeholder";
  process.env.TEACHERFLOW_BUDGET_DB = join(dir, "budget.sqlite");
  process.env.TEACHERFLOW_PROVIDER_QUEUE_DB = join(dir, "queue.sqlite");
  process.env.TEACHERFLOW_MANAGEMENT_DB = join(dir, "management.sqlite");
  try {
    await run();
  } finally {
    globalThis.fetch = fetch;
    for (const n of names) old[n] === undefined ? delete process.env[n] : (process.env[n] = old[n]);
  }
}
const answer = (content = '{"ready":true}', cost = 0.001) =>
  Response.json({
    choices: [{ finish_reason: "stop", message: { content } }],
    usage: cost === null ? {} : { cost },
  });
test("real text transport uses one approved backup after rejection, enforces price caps, and records recovery", () =>
  isolated(async () => {
    const models = [];
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      const body = JSON.parse(options.body);
      models.push(body.model);
      assert.equal(body.provider.require_parameters, true);
      assert.equal(body.provider.max_price.request, 0);
      assert.ok(body.provider.max_price.completion <= 9);
      return models.length === 1
        ? new Response("private upstream body", { status: 404 })
        : answer();
    };
    const value = await observeGeneration(
      { user: "teacher", request: { topic: "Future" }, part: "reading" },
      () => withBetaBudget("teacher", () => requestReadingOpenRouter(args)),
    );
    assert.deepEqual(value, { ready: true });
    assert.deepEqual(models, ["deepseek/deepseek-v4-flash-0731", "openai/gpt-5.4-mini"]);
    const budget = new BetaBudget();
    assert.equal(budget.status().accountedUsd, 0.001);
    assert.equal(budget.status().reservedUsd, 0);
    budget.close();
    const monitoring = new ManagementStore(),
      operation = monitoring.list()[0];
    assert.equal(operation.status, "recovered");
    assert.equal(operation.providers.filter((p) => p.event === "fallback").length, 1);
    assert.equal(operation.providers.filter((p) => !p.event).length, 2);
    assert.ok(!JSON.stringify(operation).includes("private upstream"));
    monitoring.close();
  }));
test("invalid completed JSON permits a single paid correction only with a confirmed charge", () =>
  isolated(async () => {
    let calls = 0;
    globalThis.fetch = async () => (++calls === 1 ? answer("bad json", 0.002) : answer());
    assert.deepEqual(await withBetaBudget("teacher", () => requestReadingOpenRouter(args)), {
      ready: true,
    });
    assert.equal(calls, 2);
    const budget = new BetaBudget();
    assert.equal(budget.status().accountedUsd, 0.003);
    assert.equal(budget.status().reservedUsd, 0);
    budget.close();
  }));
test("unknown charges and gateway faults never switch models or repeat an uncertain paid request", () =>
  isolated(async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return answer("bad json", null);
    };
    await assert.rejects(
      withBetaBudget("teacher", () => requestReadingOpenRouter(args)),
      /invalid lesson format/,
    );
    assert.equal(calls, 1);
    await assert.rejects(
      withBetaBudget("teacher", () => requestReadingOpenRouter(args)),
      /uncertain/,
    );
    assert.equal(calls, 1);
    globalThis.fetch = async () => {
      calls++;
      return new Response("<html>private gateway</html>", { status: 503 });
    };
    const changed = { ...args, input: "Different request" };
    await assert.rejects(
      withBetaBudget("teacher", () => requestReadingOpenRouter(changed)),
      /could not complete/,
    );
    assert.equal(calls, 2);
    await assert.rejects(
      withBetaBudget("teacher", () => requestReadingOpenRouter(changed)),
      /uncertain/,
    );
    assert.equal(calls, 2);
  }));
test("parallel teachers queue through full response delivery with no more than two text requests active", () =>
  isolated(async () => {
    let active = 0,
      peak = 0,
      sent = 0;
    globalThis.fetch = async () => {
      sent++;
      active++;
      peak = Math.max(peak, active);
      return new Response(
        new ReadableStream({
          start(controller) {
            setTimeout(() => {
              controller.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({
                    choices: [{ finish_reason: "stop", message: { content: "{}" } }],
                    usage: { cost: 0.001 },
                  }),
                ),
              );
              active--;
              controller.close();
            }, 80);
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    const values = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        withBetaBudget("teacher-" + i, () =>
          requestReadingOpenRouter({ ...args, input: "Topic " + i }),
        ),
      ),
    );
    assert.equal(values.length, 6);
    assert.equal(sent, 6);
    assert.equal(peak, 2);
    assert.equal(active, 0);
    const budget = new BetaBudget();
    assert.equal(budget.status().accountedUsd, 0.006);
    assert.equal(budget.status().reservedUsd, 0);
    budget.close();
  }));
test("uncertain backup charge blocks the whole logical action even if the primary later recovers", () =>
  isolated(async () => {
    const models = [];
    globalThis.fetch = async (_url, options) => {
      models.push(JSON.parse(options.body).model);
      if (models.length === 1) return new Response("", { status: 404 });
      throw Error("Interrupted paid backup");
    };
    await assert.rejects(
      withBetaBudget("teacher", () => requestReadingOpenRouter(args)),
      /uncertain/,
    );
    globalThis.fetch = async (_url, options) => {
      models.push(JSON.parse(options.body).model);
      return answer();
    };
    await assert.rejects(
      withBetaBudget("teacher", () => requestReadingOpenRouter(args)),
      /uncertain/,
    );
    assert.deepEqual(models, ["deepseek/deepseek-v4-flash-0731", "openai/gpt-5.4-mini"]);
  }));
