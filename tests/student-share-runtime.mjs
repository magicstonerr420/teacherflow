// Run with --experimental-transform-types after a production build.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { TeacherToolsStore } from "../src/lib/teacher-tools-store.server.ts";
import { StudentShareStore } from "../src/lib/student-share-store.server.ts";
import { mp3Fixture } from "./media-fixtures.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
await mkdir(".local-runtime/student-share", { recursive: true });
const directory = await mkdtemp(resolve(".local-runtime/student-share/runtime-"));
const tools = new TeacherToolsStore(join(directory, "beta.sqlite"));
let audioBytes = mp3Fixture(),
  realRecording = false;
try {
  audioBytes = await readFile(
    process.env.STUDENT_SHARE_TEST_MP3 ||
      ".local-runtime/shape-reading-review/standard-american.mp3",
  );
  realRecording = true;
} catch {}
const store = new StudentShareStore(
  tools,
  () => new Date(),
  () => ({ dataUrl: `data:audio/mpeg;base64,${audioBytes.toString("base64")}` }),
);
const lessonId = "11111111-1111-4111-8111-111111111111";
const poison = {
  answer: "SECRET_ANSWER_RUNTIME",
  teacherNotes: "SECRET_TEACHER_RUNTIME",
  evidence: "SECRET_EVIDENCE_RUNTIME",
  script: "SECRET_SCRIPT_RUNTIME",
  email: "SECRET_EMAIL_RUNTIME",
};
const lesson = {
  id: lessonId,
  user_id: "private-teacher-runtime",
  topic: "Shared student activity",
  inputs: { requiredVocabulary: "red, blue, circle, square", teacherNotes: poison.teacherNotes },
  content: {
    worksheet: {
      student: {
        title: "Student worksheet",
        instructions: "Answer in your notebook.",
        sections: [
          {
            label: "A",
            title: "Your prediction",
            format: "short-answer",
            instructions: "Write one reason.",
            passage: "",
            wordBank: ["prediction"],
            items: [
              {
                number: 1,
                prompt: "What might change in your community?",
                choices: [],
                answerLines: 2,
                visual: "red",
                ...poison,
              },
            ],
            ...poison,
          },
        ],
        ...poison,
      },
      studentB: { title: "Version B", instructions: "", sections: [] },
      teacher: poison,
    },
    reading: {
      status: "ready",
      value: {
        title: "Our changing world",
        instructions: "Read the passage.",
        text: "Communities change when people work together.",
        questions: [
          {
            question: "When do communities change?",
            choices: ["When people work together.", "When nobody helps."],
            ...poison,
          },
        ],
        answers: [poison.answer],
      },
    },
    listening: {
      status: "ready",
      audio: { id: "a".repeat(64) },
      value: {
        title: "Listen and think",
        instructions: "Listen before you answer.",
        questions: [
          {
            question: "What did the speaker predict?",
            choices: ["A new park.", "A new road."],
            ...poison,
          },
        ],
        ...poison,
      },
    },
    homework: {
      title: "Future community",
      instructions: "Use your own ideas.",
      tasks: ["Write three predictions."],
      estimatedTime: "10 minutes",
      ...poison,
    },
    ...poison,
  },
};
const client = {
  from() {
    const filters = {};
    return {
      select() {
        return this;
      },
      eq(key, value) {
        filters[key] = value;
        return this;
      },
      async maybeSingle() {
        return {
          data:
            filters.id === lessonId && filters.user_id === lesson.user_id
              ? structuredClone(lesson)
              : null,
          error: null,
        };
      },
    };
  },
};
let summary = await store.create(client, lesson.user_id, {
  lessonId,
  sections: ["worksheet", "reading", "listening", "homework"],
  expiresInDays: 7,
});
let child,
  browser,
  logs = "";
const errors = [],
  blocked = [],
  responses = [],
  checks = [];
const port = process.env.STUDENT_SHARE_RUNTIME_PORT || "3016",
  origin = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function start() {
  child = spawn(process.execPath, ["tests/student-share-runtime-server.mjs"], {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      STUDENT_SHARE_RUNTIME_FIXTURE: directory,
      STUDENT_SHARE_RUNTIME_PORT: port,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (v) => (logs += v));
  child.stderr.on("data", (v) => (logs += v));
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw Error("Server exited: " + logs);
    try {
      if ((await fetch(origin + "/share/" + summary.token)).ok) return;
    } catch {}
    await sleep(100);
  }
  throw Error("Public share runtime did not start: " + logs);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const ended = new Promise((r) => child.once("exit", r));
  child.kill();
  await ended;
}
async function assertHeaders(response) {
  const h = response.headers();
  assert.match(h["cache-control"], /private.*no-store/);
  assert.match(h["x-robots-tag"], /noindex/);
  assert.equal(h["referrer-policy"], "no-referrer");
}
try {
  await start();
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("**/*", (route) => {
    if (route.request().url().startsWith(origin) || route.request().url().startsWith("data:"))
      return route.continue();
    blocked.push(route.request().url().split("?")[0]);
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", async (response) => {
    if (response.url().includes("/_serverFn/"))
      responses.push({
        headers: response.headers(),
        body: await response.text().catch(() => ""),
        status: response.status(),
      });
  });
  let response = await page.goto(origin + "/share/" + summary.token, { waitUntil: "networkidle" });
  await assertHeaders(response);
  const raw = await response.text();
  assert.doesNotMatch(raw, /SECRET_\w+_RUNTIME|private-teacher-runtime/);
  assert.match(raw, /Shared student activity/);
  await page.getByRole("heading", { name: "Shared student activity", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /sign in|sign up/i }).count(), 0);
  assert.equal(await page.getByRole("link", { name: /sign in|sign up/i }).count(), 0);
  assert.equal(
    await page
      .locator('meta[name="robots"]')
      .getAttribute("content")
      .then((v) => v.includes("noindex")),
    true,
  );
  assert.equal(await page.locator("audio").count(), 1);
  assert.match(await page.locator("audio").getAttribute("src"), /^data:audio\/mpeg;base64,/);
  if (realRecording) {
    await page.waitForFunction(() => {
      const a = document.querySelector("audio");
      return a && Number.isFinite(a.duration) && a.duration > 0;
    });
    await page.locator("audio").evaluate((a) => a.play());
    await page.waitForFunction(() => document.querySelector("audio").currentTime > 0.1);
    await page.locator("audio").evaluate((a) => a.pause());
    checks.push("existing synthetic MP3 loads duration and advances playback");
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.doesNotMatch(await page.locator("body").innerText(), /SECRET_\w+_RUNTIME/);
  await page.screenshot({ path: join(directory, "student-mobile.png"), fullPage: true });
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.getByRole("button", { name: "Print materials" }).isVisible(), false);
  await page.emulateMedia({ media: "screen" });
  checks.push(
    "compiled SSR and hydrated anonymous mobile view, validated audio, picture cues, no private fields, print",
  );
  await stop();
  await start();
  response = await page.reload({ waitUntil: "networkidle" });
  await assertHeaders(response);
  await page.getByRole("heading", { name: "Shared student activity", exact: true }).waitFor();
  checks.push("server restart retains snapshot");
  tools.db
    .prepare("UPDATE tf_student_shares SET expires_at=? WHERE id=?")
    .run(new Date(Date.now() - 1000).toISOString(), summary.id);
  response = await page.reload({ waitUntil: "networkidle" });
  await assertHeaders(response);
  await page.getByRole("heading", { name: "This student link is unavailable" }).waitFor();
  assert.doesNotMatch(await response.text(), /Shared student activity|SECRET_\w+_RUNTIME/);
  checks.push("expired link is unavailable on fresh request");
  summary = await store.create(client, lesson.user_id, {
    lessonId,
    sections: ["homework"],
    expiresInDays: 7,
  });
  await page.goto(origin + "/share/" + summary.token, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Future community", exact: true }).waitFor();
  await store.revoke(client, lesson.user_id, { id: summary.id });
  response = await page.reload({ waitUntil: "networkidle" });
  await assertHeaders(response);
  await page.getByRole("heading", { name: "This student link is unavailable" }).waitFor();
  assert.doesNotMatch(await response.text(), /Future community|SECRET_\w+_RUNTIME/);
  checks.push("revocation clears content and generic invalid view");
  response = await page.goto(origin + "/share/" + "z".repeat(43), { waitUntil: "networkidle" });
  await assertHeaders(response);
  await page.getByRole("heading", { name: "This student link is unavailable" }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked.filter(url => !url.startsWith("https://fonts.googleapis.com/")), []);
  for (const response of responses) {
    assert.doesNotMatch(response.body, /SECRET_\w+_RUNTIME|private-teacher-runtime/);
    assert.match(response.headers["cache-control"], /no-store/);
  }
  let external = "";
  try {
    external = await readFile(join(directory, "blocked-server-requests.jsonl"), "utf8");
  } catch {}
  assert.equal(external, "", "Public routes do not call Supabase, AI, or email");
  await writeFile(
    join(directory, "result.json"),
    JSON.stringify(
      {
        checks,
        errors,
        blocked,
        serverExternalRequests: 0,
        rpcResponses: responses.length,
        audioPlaybackTested: realRecording,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, directory, checks, realProviderCalls: 0 }));
} finally {
  await browser?.close();
  await stop();
  tools.db.close();
  await writeFile(join(directory, "server.log"), logs);
}
