import test from "node:test";
import assert from "node:assert/strict";
import { generateValidated } from "../src/lib/generation-validation.server.ts";
test("complete invalid content receives one targeted repair, preserving validation requirements", async () => {
  const calls = [];
  const value = await generateValidated(
    async (issue, previous) => {
      calls.push({ issue, previous });
      return calls.length === 1 ? { level: "A1" } : { level: "C2" };
    },
    (v) => {
      if (v.level !== "C2") throw Error("Expected C2");
      return v;
    },
    "test",
  );
  assert.deepEqual(value, { level: "C2" });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].issue, "Expected C2");
  assert.deepEqual(calls[1].previous, { level: "A1" });
});
test("failed validation is bounded and interrupted generation is never blindly repaired", async () => {
  let calls = 0;
  await assert.rejects(
    generateValidated(
      async () => {
        calls++;
        return {};
      },
      () => {
        throw Error("Invalid");
      },
      "test",
    ),
    /Invalid/,
  );
  assert.equal(calls, 2);
  calls = 0;
  const error = new Error("Uncertain charge");
  await assert.rejects(
    generateValidated(
      async () => {
        calls++;
        throw error;
      },
      () => assert.fail("No complete output"),
      "test",
    ),
    (e) => e === error,
  );
  assert.equal(calls, 1);
});
