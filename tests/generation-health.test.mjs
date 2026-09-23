import test from "node:test";
import assert from "node:assert/strict";
import { generationHealth, providerEventLabel } from "../src/lib/generation-health.ts";

const provider = (overrides = {}) => ({
  model: "primary/model",
  kind: "text",
  status: 200,
  ms: 100,
  at: 150,
  ...overrides,
});
const operation = (overrides = {}) => ({
  id: "one",
  user: "teacher",
  lesson: "lesson",
  part: "student",
  target: "",
  source: "server",
  status: "completed",
  started: 100,
  finished: 200,
  failure: null,
  providers: [],
  ...overrides,
});
const failure = (category) => ({
  category,
  explanation: "Recorded issue",
  nextAction: "Review",
  detail: "Diagnostic",
});

test("empty and browser-only history cannot invent confirmed failures or provider requests", () => {
  const empty = generationHealth([]);
  assert.equal(empty.serverOperations, 0);
  assert.equal(empty.requests, 0);
  assert.equal(empty.failed, 0);
  assert.equal(empty.firstStarted, null);
  assert.equal(empty.lastStarted, null);
  assert.deepEqual(empty.models, []);
  assert.deepEqual(empty.parts, []);
  assert.deepEqual(empty.causes, []);
  const browser = generationHealth([
    operation({
      source: "browser",
      status: "failed",
      failure: failure("rate_limit"),
      providers: [provider({ status: 429 })],
    }),
  ]);
  assert.equal(browser.tracked, 1);
  assert.equal(browser.browserReports, 1);
  assert.equal(browser.failed, 0);
  assert.equal(browser.rateLimited, 0);
  assert.equal(browser.requests, 0);
});

test("request counts exclude queue, retry, backup and validation notices; HTTP acceptance is distinct from valid content", () => {
  const row = operation({
    status: "recovered",
    providers: [
      provider({ event: "queued", status: undefined, ms: 500 }),
      provider({ status: 429 }),
      provider({ event: "retry", status: undefined, detail: "Rate-limit retry" }),
      provider({ status: 503 }),
      provider({ event: "fallback", model: "backup/model", status: undefined }),
      provider({ model: "backup/model", event: "request" }),
      provider({ model: "backup/model", event: "validation", status: undefined }),
    ],
  });
  const before = structuredClone(row);
  const result = generationHealth([row]);
  assert.equal(result.requests, 3);
  assert.equal(result.accepted, 1);
  assert.equal(result.rateLimited, 1);
  assert.equal(result.connectionFailures, 1);
  assert.equal(result.queued, 1);
  assert.equal(result.retries, 1);
  assert.equal(result.backups, 1);
  assert.equal(result.validationIssues, 1);
  assert.equal(result.recovered, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.models.find((model) => model.model === "primary/model").requests, 2);
  assert.equal(result.models.find((model) => model.model === "backup/model").validationEvents, 1);
  assert.deepEqual(row, before);
  const queued = generationHealth([
    operation({
      providers: [
        provider({ event: "queued", status: undefined, detail: "Waited for capacity" }),
        provider(),
      ],
    }),
  ]);
  assert.equal(queued.recovered, 0);
  assert.equal(queued.connectionFailures, 0);
  assert.equal(queued.requests, 1);
});

test("status and diagnostic evidence distinguish rejection, connection failure and unrecorded outcome", () => {
  const result = generationHealth([
    operation({
      providers: [
        provider({ status: 201 }),
        provider({ status: 429 }),
        provider({ status: 500 }),
        provider({ status: 502 }),
        provider({ status: 408 }),
        provider({ status: 402 }),
        provider({ status: 401 }),
        provider({ status: 404 }),
        provider({ status: undefined, detail: "fetch failed" }),
        provider({ status: undefined }),
        provider({ status: undefined, detail: "Charge could not be confirmed" }),
        provider({ status: 302 }),
      ],
    }),
  ]);
  assert.equal(result.requests, 12);
  assert.equal(result.accepted, 1);
  assert.equal(result.rateLimited, 1);
  assert.equal(result.connectionFailures, 4);
  assert.equal(result.models[0].otherRejections, 3);
  assert.equal(result.models[0].unknown, 3);
  assert.equal(result.failed, 0, "Provider events alone do not establish final operation failure");
  assert.equal(
    result.recovered,
    0,
    "Provider acceptance alone does not establish retained recovery",
  );
});

test("validation is counted once per operation, while terminal failures and interruptions remain distinct", () => {
  const result = generationHealth([
    operation({
      id: "validation",
      status: "failed",
      failure: failure("content"),
      providers: [provider(), provider({ event: "validation" }), provider({ event: "validation" })],
    }),
    operation({
      id: "transport",
      status: "failed",
      part: "recording",
      failure: failure("connection"),
      providers: [provider({ status: 503 })],
    }),
    operation({
      id: "unrecorded",
      status: "interrupted",
      part: "reading",
      failure: failure("unknown"),
    }),
    operation({ id: "pending", status: "generating", finished: null }),
    operation({ id: "unknown", status: "failed" }),
  ]);
  assert.equal(result.serverOperations, 5);
  assert.equal(result.failed, 3);
  assert.equal(result.interrupted, 1);
  assert.equal(result.validationIssues, 1);
  assert.equal(result.models[0].validationEvents, 2);
  assert.equal(result.accepted, 1);
  assert.deepEqual(result.causes, [
    { category: "connection", count: 1 },
    { category: "content", count: 1 },
    { category: "unknown", count: 1 },
  ]);
  const student = result.parts.find((row) => row.part === "student");
  assert.equal(student.operations, 3);
  assert.equal(student.failed, 2);
  assert.equal(student.validationIssues, 1);
});

test("repeated operation IDs and strict nested wrappers do not double failures, but separate work stays separate", () => {
  const child = operation({
    id: "child",
    status: "failed",
    started: 110,
    finished: 190,
    failure: failure("rate_limit"),
    providers: [provider({ status: 429 })],
  });
  const parent = operation({ id: "parent", status: "failed", failure: failure("rate_limit") });
  const browser = operation({ ...child, id: "browser", source: "browser" });
  const result = generationHealth([child, child, parent, browser]);
  assert.equal(result.tracked, 3);
  assert.equal(result.serverOperations, 1);
  assert.equal(result.nestedWrappers, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.rateLimited, 1);
  assert.equal(result.requests, 1);
  assert.deepEqual(result.causes, [{ category: "rate_limit", count: 1 }]);
  for (const patch of [
    { user: "other" },
    { lesson: "other" },
    { part: "reading" },
    { target: "other" },
    { status: "interrupted" },
    { started: 100, finished: 200 },
  ]) {
    assert.equal(
      generationHealth([parent, { ...child, ...patch }]).serverOperations,
      2,
      JSON.stringify(patch),
    );
  }
  const recovered = generationHealth([
    { ...parent, status: "recovered", failure: null },
    { ...child, status: "recovered", failure: null },
  ]);
  assert.equal(recovered.recovered, 1);
});

test("provider detail labels describe non-request events and do not invent a network failure", () => {
  assert.equal(
    providerEventLabel(provider({ event: "queued", status: undefined })),
    "Queued for capacity",
  );
  assert.equal(
    providerEventLabel(provider({ event: "retry", status: undefined })),
    "Retry scheduled",
  );
  assert.equal(
    providerEventLabel(provider({ event: "fallback", status: undefined })),
    "Backup model selected",
  );
  assert.equal(
    providerEventLabel(provider({ event: "validation", status: undefined })),
    "Content validation failed",
  );
  assert.equal(providerEventLabel(provider()), "HTTP 200 · Provider accepted request");
  assert.equal(providerEventLabel(provider({ status: 429 })), "HTTP 429");
  assert.equal(providerEventLabel(provider({ status: undefined })), "Request outcome not recorded");
});
