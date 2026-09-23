import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateIllustration, illustrationBrief } from "../src/lib/illustration.server.ts";
import { withImageModelFallback } from "../src/lib/image-fallback.server.ts";
import { PRIMARY_IMAGE_MODEL, BACKUP_IMAGE_MODEL } from "../src/lib/image-models.server.ts";
import { ProviderRejectedError, ProviderFormatError } from "../src/lib/provider-fallback.server.ts";
import { ProviderRateLimitError, retryRateLimited } from "../src/lib/provider-retry.server.ts";
import { withBetaBudget, BetaBudget, budgetFetch } from "../src/lib/beta-budget.server.ts";
import { BetaStore } from "../src/lib/beta-store.server.ts";
import { ManagementStore } from "../src/lib/management-store.server.ts";
import { pngFixture } from "./media-fixtures.mjs";

const envNames = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_IMAGE_MODEL",
  "NODE_ENV",
  "TEACHERFLOW_BUDGET_DB",
  "TEACHERFLOW_PROVIDER_QUEUE_DB",
  "TEACHERFLOW_MANAGEMENT_DB",
];
const png = pngFixture().toString("base64");
const picture = () =>
  Response.json({ data: [{ media_type: "image/png", b64_json: png }], usage: { cost: 0.034 } });
const catalog = (url) =>
  Response.json({
    endpoints: [
      {
        provider_tag: String(url).includes(BACKUP_IMAGE_MODEL)
          ? "google-vertex/global"
          : "google-ai-studio",
        pricing: [
          {
            billable: "output_image",
            unit: "token",
            cost_usd: String(url).includes(BACKUP_IMAGE_MODEL) ? 0.00003 : 0.00006,
          },
        ],
      },
    ],
  });
async function isolated(run) {
  const saved = Object.fromEntries(envNames.map((name) => [name, process.env[name]])),
    oldFetch = globalThis.fetch;
  const directory = mkdtempSync(join(tmpdir(), "teacherflow-image-fallback-"));
  Object.assign(process.env, {
    OPENROUTER_API_KEY: "fake-key",
    OPENROUTER_IMAGE_MODEL: PRIMARY_IMAGE_MODEL,
    NODE_ENV: "test",
    TEACHERFLOW_BUDGET_DB: join(directory, "budget.sqlite"),
    TEACHERFLOW_PROVIDER_QUEUE_DB: join(directory, "queue.sqlite"),
    TEACHERFLOW_MANAGEMENT_DB: join(directory, "management.sqlite"),
  });
  try {
    await run(directory);
  } finally {
    globalThis.fetch = oldFetch;
    for (const name of envNames)
      saved[name] === undefined ? delete process.env[name] : (process.env[name] = saved[name]);
  }
}

test("deploying image fallback honors uncertain charges stored under the previous payload identity", () =>
  isolated(async () => {
    let paid = 0;
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/endpoints")) return catalog(url);
      paid++;
      throw new Error("Delivery interrupted");
    };
    const prompt = "Adults caring for trees", age = "Adults", level = "A1";
    await assert.rejects(withBetaBudget("teacher", () => budgetFetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      body: JSON.stringify({ model: PRIMARY_IMAGE_MODEL, prompt: illustrationBrief(prompt, age, level), aspect_ratio: "4:3", resolution: "1K", n: 1 }),
    })), /charge is uncertain/);
    await assert.rejects(withBetaBudget("teacher", () => generateIllustration(prompt, age, level)), /previous charge is still uncertain/);
    assert.equal(paid, 1, "Upgrade cannot replay an unresolved paid image through a new billing identity");
  }));

test("one approved image alternate after 404 stays in the same image slot, price cap, cache and Management operation", () =>
  isolated(async (directory) => {
    const requests = [],
      store = new BetaStore(join(directory, "beta.sqlite"));
    const request = { topic: "Conservation", studentAge: "Adults", level: "A1" },
      prompt = "Adults caring for trees in a shared garden";
    const [invitation] = store.issue();
    store.claim("teacher", invitation);
    for (const part of [
      "foundation",
      "student",
      "teacher",
      "studentB",
      "teacherB",
      "presentation",
      "activity",
      "assessment",
      "differentiation",
    ])
      await store.stage("teacher", request, part, async () =>
        part === "presentation" ? { presentation: { slides: [{ imagePrompt: prompt }] } } : {},
      );
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith("/endpoints")) return catalog(url);
      const body = JSON.parse(options.body);
      requests.push(body);
      assert.equal(body.n, 1);
      assert.equal(body.resolution, "1K");
      assert.equal(body.aspect_ratio, "4:3");
      assert.equal(body.provider.allow_fallbacks, false);
      assert.deepEqual(body.provider.only, [
        body.model === PRIMARY_IMAGE_MODEL ? "google-ai-studio" : "google-vertex/global",
      ]);
      return requests.length === 1
        ? new Response("private diagnostics", { status: 404 })
        : picture();
    };
    try {
      const generate = () =>
        store.image("teacher", request, prompt, () =>
          generateIllustration(prompt, request.studentAge, request.level),
        );
      const result = await generate();
      assert.equal(result, `data:image/png;base64,${png}`);
      assert.equal(await generate(), result, "Reopening a successful image uses its saved value");
      assert.deepEqual(
        requests.map((r) => r.model),
        [PRIMARY_IMAGE_MODEL, BACKUP_IMAGE_MODEL],
      );
      const state = JSON.parse(
        store.db.prepare("SELECT body FROM beta_state WHERE id=1").get().body,
      );
      const images = Object.values(Object.values(state.teachers.teacher.runs)[0].images);
      assert.equal(images.length, 1);
      assert.equal(images[0].attempts, 1);
      assert.equal(images[0].value, result);
      const budget = new BetaBudget();
      try {
        assert.equal(budget.status().limitUsd, 10);
        assert.equal(budget.status().accountedUsd, 0.034);
        assert.equal(budget.status().reservedUsd, 0);
        const rows = budget.db
          .prepare(
            "SELECT model,request_key,reserved,charged FROM budget_calls ORDER BY created,rowid",
          )
          .all();
        assert.equal(rows.length, 2);
        assert.equal(rows[0].charged, 0);
        assert.equal(rows[0].request_key, rows[1].request_key);
        assert.ok(rows[1].reserved >= Math.ceil(32768 * 0.00003 * 1.1 * 1e6));
        assert.ok(rows[1].reserved < rows[0].reserved);
      } finally {
        budget.close();
      }
      const management = new ManagementStore();
      try {
        const operation = management.list().find((o) => o.part === "illustration");
        assert.equal(operation.status, "recovered");
        assert.deepEqual(
          operation.providers.filter((p) => !p.event).map((p) => [p.model, p.status]),
          [
            [PRIMARY_IMAGE_MODEL, 404],
            [BACKUP_IMAGE_MODEL, 200],
          ],
        );
        assert.equal(operation.providers.filter((p) => p.event === "fallback").length, 1);
        assert.equal(
          operation.providers.find((p) => p.event === "fallback").model,
          BACKUP_IMAGE_MODEL,
        );
        assert.doesNotMatch(JSON.stringify(operation), /private diagnostics|fake-key/);
      } finally {
        management.close();
      }
    } finally {
      store.db.close();
    }
  }));

test("429 recovery exhausts same-model retries, honors Retry-After, and stops after one alternate", async () => {
  const models = [],
    waits = [],
    events = [],
    signal = new AbortController().signal;
  await assert.rejects(
    withImageModelFallback(
      PRIMARY_IMAGE_MODEL,
      signal,
      (model) =>
        retryRateLimited(
          async () => {
            models.push(model);
            return new Response("", { status: 429, headers: { "Retry-After": "10" } });
          },
          {
            signal,
            random: () => 0,
            wait: async (ms) => {
              waits.push(ms);
            },
          },
        ),
      {
        wait: async (ms) => {
          waits.push(ms);
        },
        onFallback: (...args) => events.push(args),
      },
    ),
    ProviderRateLimitError,
  );
  assert.deepEqual(models, [
    ...Array(3).fill(PRIMARY_IMAGE_MODEL),
    ...Array(3).fill(BACKUP_IMAGE_MODEL),
  ]);
  assert.deepEqual(waits, [10000, 10000, 10000, 10000, 10000]);
  assert.deepEqual(events, [[PRIMARY_IMAGE_MODEL, BACKUP_IMAGE_MODEL, "rate limit"]]);
});

test("billing, refusals, uncertain responses, invalid paid bytes, long cooldown and unknown models never buy a fallback", async () => {
  const signal = new AbortController().signal;
  for (const failure of [
    new Error("Connection timed out"),
    new Error("Content refused"),
    new ProviderRejectedError("Billing", 402),
    new ProviderRejectedError("Access", 403),
    new ProviderRejectedError("Invalid", 422),
    new ProviderRejectedError("Gateway", 502),
    new ProviderRejectedError("Timeout", 408),
    new ProviderFormatError("Corrupt completed image", true),
    new ProviderRateLimitError(31000),
  ]) {
    let calls = 0;
    await assert.rejects(
      withImageModelFallback(PRIMARY_IMAGE_MODEL, signal, async () => {
        calls++;
        throw failure;
      }),
      (error) => error === failure,
    );
    assert.equal(calls, 1);
  }
  for (const [model, enabled] of [
    [BACKUP_IMAGE_MODEL, true],
    ["unapproved/model", true],
    [PRIMARY_IMAGE_MODEL, false],
  ]) {
    let calls = 0;
    await assert.rejects(
      withImageModelFallback(
        model,
        signal,
        async () => {
          calls++;
          throw new ProviderRejectedError("Unavailable", 404);
        },
        { enabled },
      ),
      /Unavailable/,
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(
    withImageModelFallback(PRIMARY_IMAGE_MODEL, signal, async () => {
      calls++;
      throw new ProviderRejectedError("Unavailable", 404);
    }),
    /Unavailable/,
  );
  assert.equal(calls, 2, "Neither unavailable model repeats or starts a third model");
});

test("uncertain backup delivery blocks a manual primary retry under the same logical image identity", () =>
  isolated(async () => {
    const models = [];
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith("/endpoints")) return catalog(url);
      models.push(JSON.parse(options.body).model);
      if (models.length === 1) return new Response("", { status: 404 });
      throw Error("Connection lost after backup dispatch");
    };
    const generate = () =>
      withBetaBudget("teacher", () =>
        generateIllustration("A school community caring for trees", "16-18", "C2"),
      );
    await assert.rejects(generate, /charge is uncertain/);
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith("/endpoints")) return catalog(url);
      models.push(JSON.parse(options.body).model);
      return picture();
    };
    await assert.rejects(generate, /previous charge is still uncertain/);
    assert.deepEqual(models, [PRIMARY_IMAGE_MODEL, BACKUP_IMAGE_MODEL]);
    const budget = new BetaBudget();
    try {
      const rows = budget.db
        .prepare("SELECT request_key,state FROM budget_calls ORDER BY created,rowid")
        .all();
      assert.equal(rows.length, 2);
      assert.equal(rows[0].request_key, rows[1].request_key);
      assert.equal(rows[1].state, "uncertain");
      assert.ok(budget.status().reservedUsd > 1);
    } finally {
      budget.close();
    }
  }));

test("actual primary image transport never falls back on billing, refusals, gateways or corrupt successful delivery", async () => {
  for (const failure of [
    402,
    403,
    408,
    422,
    500,
    502,
    503,
    "network",
    "invalid-json",
    "invalid-bytes",
    "missing-image",
  ]) {
    await isolated(async () => {
      const models = [];
      globalThis.fetch = async (url, options) => {
        if (String(url).endsWith("/endpoints")) return catalog(url);
        models.push(JSON.parse(options.body).model);
        if (typeof failure === "number")
          return new Response("private provider details", { status: failure });
        if (failure === "network") throw Error("private interrupted request");
        if (failure === "invalid-json") return new Response("<html>private gateway body</html>");
        return Response.json({
          usage: { cost: 0.034 },
          data:
            failure === "missing-image" ? [] : [{ media_type: "image/png", b64_json: "dGVzdA==" }],
        });
      };
      await assert.rejects(
        withBetaBudget("teacher", () => generateIllustration("Conservation", "Adults", "A1")),
        (error) => {
          assert.doesNotMatch(error.message, /private|<html>/);
          return true;
        },
      );
      assert.deepEqual(models, [PRIMARY_IMAGE_MODEL], String(failure));
    });
  }
});
