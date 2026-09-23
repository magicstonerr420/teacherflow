import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { budgetFetch, withBetaBudget, BetaBudget } from "../src/lib/beta-budget.server.ts";
import { BACKUP_IMAGE_MODEL } from "../src/lib/image-models.server.ts";

test("changed backup image pricing blocks the paid call and preserves the fixed beta budget", async () => {
  const saved = { ...process.env },
    fetch = globalThis.fetch,
    directory = mkdtempSync(join(tmpdir(), "teacherflow-image-pricing-"));
  process.env.TEACHERFLOW_BUDGET_DB = join(directory, "budget.sqlite");
  process.env.TEACHERFLOW_PROVIDER_QUEUE_DB = join(directory, "queue.sqlite");
  let paid = 0;
  globalThis.fetch = async (url) => {
    if (!String(url).endsWith("/endpoints")) {
      paid++;
      throw Error("Unexpected paid dispatch");
    }
    return Response.json({
      endpoints: [
        {
          provider_tag: "google-vertex/global",
          pricing: [{ billable: "output_image", unit: "token", cost_usd: 0.000031 }],
        },
      ],
    });
  };
  try {
    await assert.rejects(
      withBetaBudget("teacher", () =>
        budgetFetch("https://openrouter.ai/api/v1/images", {
          method: "POST",
          body: JSON.stringify({
            model: BACKUP_IMAGE_MODEL,
            n: 1,
            resolution: "1K",
            aspect_ratio: "4:3",
            prompt: "Trees",
          }),
        }),
      ),
      /Image pricing changed/,
    );
    assert.equal(paid, 0);
    const budget = new BetaBudget();
    try {
      assert.deepEqual(budget.status(), {
        limitUsd: 10,
        accountedUsd: 0,
        reservedUsd: 0,
        remainingUsd: 10,
        paused: false,
      });
    } finally {
      budget.close();
    }
  } finally {
    globalThis.fetch = fetch;
    for (const name of ["TEACHERFLOW_BUDGET_DB", "TEACHERFLOW_PROVIDER_QUEUE_DB"])
      saved[name] === undefined ? delete process.env[name] : (process.env[name] = saved[name]);
  }
});
