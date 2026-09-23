// The built application runs unchanged; every outgoing service request is denied.
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const directory = resolve(process.env.STUDENT_SHARE_RUNTIME_FIXTURE);
Object.assign(process.env, {
  NODE_ENV: "production",
  HOST: "127.0.0.1",
  NITRO_HOST: "127.0.0.1",
  PORT: process.env.STUDENT_SHARE_RUNTIME_PORT || "3016",
  NITRO_PORT: process.env.STUDENT_SHARE_RUNTIME_PORT || "3016",
  TEACHERFLOW_BETA: "true",
  TEACHERFLOW_OWNER_USER_ID: "student-share-fixture-owner",
  TEACHERFLOW_BETA_DB: resolve(directory, "beta.sqlite"),
  TEACHERFLOW_MANAGEMENT_DB: resolve(directory, "management.sqlite"),
  TEACHERFLOW_BUDGET_DB: resolve(directory, "budget.sqlite"),
  TEACHERFLOW_READING_DB: resolve(directory, "reading.sqlite"),
  TEACHERFLOW_LISTENING_DB: resolve(directory, "listening.sqlite"),
  TEACHERFLOW_PROVIDER_QUEUE_DB: resolve(directory, "queue.sqlite"),
  SUPABASE_URL: "https://student-share-fixture.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "fixture-only",
  RESEND_API_KEY: "",
  OPENROUTER_API_KEY: "",
  LOVABLE_API_KEY: "",
});
globalThis.fetch = async (input) => {
  appendFileSync(
    resolve(directory, "blocked-server-requests.jsonl"),
    JSON.stringify({ url: String(input instanceof Request ? input.url : input).split("?")[0] }) +
      "\n",
  );
  throw Error("Student share test forbids external network requests");
};
await import(pathToFileURL(resolve(".output/server/index.mjs")).href);
