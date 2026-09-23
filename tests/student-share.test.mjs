import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TeacherToolsStore } from "../src/lib/teacher-tools-store.server.ts";
import { StudentShareStore } from "../src/lib/student-share-store.server.ts";
import { mp3Fixture } from "./media-fixtures.mjs";

const id = "11111111-1111-4111-8111-111111111111";
const foreignId = "22222222-2222-4222-8222-222222222222";
const audioId = "a".repeat(64);
const poison = {
  answer: "SECRET_ANSWER",
  teacherNotes: "SECRET_NOTES",
  script: "SECRET_SCRIPT",
  evidence: "SECRET_EVIDENCE",
  answerExplanation: "SECRET_EXPLANATION",
  metadata: { email: "SECRET_EMAIL" },
};
function lesson() {
  const section = {
    label: "A",
    title: "Practice",
    format: "short-answer",
    instructions: "Write.",
    passage: "Student passage.",
    wordBank: ["word", poison],
    items: [
      {
        number: 1,
        prompt: "Student question?",
        choices: ["one", "two", poison],
        answerLines: 2,
        visual: "",
        ...poison,
      },
    ],
    ...poison,
  };
  const student = {
    title: "Worksheet",
    instructions: "Work independently.",
    sections: [
      section,
      { ...section, label: "Listening", passage: "SECRET_SCRIPT" },
      { ...section, label: "Reading • DeepSeek" },
    ],
    ...poison,
  };
  return {
    ...poison,
    worksheet: {
      student,
      studentB: { ...student, title: "Version B" },
      teacher: poison,
      teacherB: [poison],
    },
    reading: {
      status: "ready",
      fingerprint: "SECRET_FINGERPRINT",
      value: {
        title: "Read",
        instructions: "Read and answer.",
        text: "A student story.",
        questions: [{ question: "What happened?", choices: ["one", "two"], ...poison }],
        answers: ["SECRET_ANSWER"],
        ...poison,
      },
    },
    listening: {
      status: "ready",
      audio: { id: audioId },
      value: {
        title: "Listen",
        instructions: "Listen and answer.",
        questions: [{ question: "What did you hear?", choices: ["one", "two"], ...poison }],
        ...poison,
      },
    },
    homework: {
      title: "Homework",
      instructions: "Practice.",
      tasks: ["Write a prediction."],
      estimatedTime: "10 minutes",
      ...poison,
    },
  };
}
function fixture(t, reader) {
  const dir = mkdtempSync(join(tmpdir(), "teacherflow-share-")),
    file = join(dir, "beta.sqlite");
  const tools = new TeacherToolsStore(file);
  let now = new Date("2026-09-23T00:00:00Z");
  const rows = new Map([
    [id, { id, user_id: "a", topic: "Society", content: lesson() }],
    [foreignId, { id: foreignId, user_id: "b", topic: "Foreign", content: lesson() }],
  ]);
  let readError = false,
    deleteError = false,
    calls = 0;
  const client = {
    from(table) {
      assert.equal(table, "lessons");
      const filters = {};
      return {
        select() {
          return this;
        },
        delete() {
          this.deleting = true;
          return this;
        },
        eq(k, v) {
          filters[k] = v;
          return this;
        },
        async maybeSingle() {
          calls++;
          const row = rows.get(filters.id);
          return {
            data: row?.user_id === filters.user_id ? structuredClone(row) : null,
            error: readError ? Error("read offline") : null,
          };
        },
        then(resolve) {
          assert.equal(this.deleting, true);
          assert.equal(filters.user_id, "a");
          if (!deleteError) rows.delete(filters.id);
          return Promise.resolve({ error: deleteError ? Error("uncertain delete") : null }).then(
            resolve,
          );
        },
      };
    },
  };
  const audioReads = [];
  const store = new StudentShareStore(
    tools,
    () => now,
    reader ??
      ((aid, user) => {
        audioReads.push({ aid, user });
        return { dataUrl: `data:audio/mpeg;base64,${mp3Fixture().toString("base64")}` };
      }),
  );
  t.after(() => {
    tools.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    tools,
    store,
    client,
    rows,
    file,
    audioReads,
    setNow: (v) => (now = new Date(v)),
    failRead: (v) => (readError = v),
    failDelete: (v) => (deleteError = v),
    getCalls: () => calls,
  };
}
const input = {
  lessonId: id,
  sections: ["worksheet", "reading", "listening", "homework"],
  expiresInDays: 7,
};

test("strict public snapshot removes nested teacher data and copies only selected student sections", async (t) => {
  const f = fixture(t);
  const share = await f.store.create(f.client, "a", input);
  assert.match(share.token, /^[A-Za-z0-9_-]{43}$/);
  const before = f.getCalls(),
    publicData = f.store.public({ token: share.token });
  assert.equal(f.getCalls(), before, "public access never queries Supabase");
  assert.doesNotMatch(
    JSON.stringify(publicData),
    /SECRET_|user_id|fingerprint|answerExplanation|teacherNotes|answerKey|script/,
  );
  assert.equal(publicData.worksheet.student.sections.length, 1);
  assert.deepEqual(publicData.worksheet.student.sections[0].wordBank, ["word"]);
  assert.equal(publicData.listening.audio.mime, "audio/mpeg");
  assert.deepEqual(f.audioReads, [{ aid: audioId, user: "a" }]);
  assert.equal(publicData.reading.text, "A student story.");
  assert.equal(publicData.homework.tasks[0], "Write a prediction.");
  await f.store.revoke(f.client, "a", { id: share.id });
  const next = await f.store.create(f.client, "a", { ...input, sections: ["homework"] });
  assert.deepEqual(Object.keys(f.store.public({ token: next.token })).sort(), [
    "expiresAt",
    "homework",
    "title",
    "updatedAt",
  ]);
});
test("owner verification applies to create, list, refresh, revoke, and delete", async (t) => {
  const f = fixture(t),
    share = await f.store.create(f.client, "a", input);
  for (const call of [
    () => f.store.create(f.client, "b", input),
    () => f.store.list(f.client, "b", { lessonId: id }),
    () => f.store.refresh(f.client, "b", { id: share.id }),
    () => f.store.revoke(f.client, "b", { id: share.id }),
    () => f.store.deleteLesson(f.client, "b", id),
    () => f.store.create(f.client, "", { ...input }),
  ])
    await assert.rejects(call);
  assert.equal(f.rows.size, 2);
  assert.equal(f.store.public({ token: share.token }).title, "Society");
  f.failRead(true);
  await assert.rejects(f.store.refresh(f.client, "a", { id: share.id }));
});
test("snapshots stay fixed until explicit refresh; replay keeps the active token and expiry", async (t) => {
  const f = fixture(t),
    share = await f.store.create(f.client, "a", input);
  f.rows.get(id).content.homework.tasks = ["New saved assignment"];
  f.setNow("2026-09-24T00:00:00Z");
  assert.equal(f.store.public({ token: share.token }).homework.tasks[0], "Write a prediction.");
  const replay = await f.store.create(f.client, "a", { ...input, expiresInDays: 30 });
  assert.equal(replay.token, share.token);
  assert.equal(replay.expiresAt, share.expiresAt);
  const refreshed = await f.store.refresh(f.client, "a", { id: share.id });
  assert.equal(refreshed.token, share.token);
  assert.equal(refreshed.expiresAt, share.expiresAt);
  assert.equal(f.store.public({ token: share.token }).homework.tasks[0], "New saved assignment");
});
test("expiry, revocation and malformed tokens use one unavailable response; revoked content cleared", async (t) => {
  const f = fixture(t),
    share = await f.store.create(f.client, "a", input);
  const error = /This student link is unavailable or has expired/;
  for (const token of ["", "x".repeat(500_000), "b".repeat(43), `${share.token}/`])
    assert.throws(() => f.store.public({ token }), error);
  f.setNow(share.expiresAt);
  assert.throws(() => f.store.public({ token: share.token }), error);
  await assert.rejects(f.store.refresh(f.client, "a", { id: share.id }));
  const next = await f.store.create(f.client, "a", input);
  assert.notEqual(next.token, share.token);
  assert.throws(() => f.store.public({ token: share.token }), error);
  await f.store.revoke(f.client, "a", { id: next.id });
  assert.throws(() => f.store.public({ token: next.token }), error);
  assert.equal(f.tools.db.prepare("SELECT body FROM tf_student_shares").get().body, "{}");
});
test("persistent snapshots survive independent SQLite handles and remove no source lesson/quota data", async (t) => {
  const f = fixture(t),
    share = await f.store.create(f.client, "a", input);
  const other = new TeacherToolsStore(f.file);
  try {
    const restarted = new StudentShareStore(other, () => new Date("2026-09-23T00:00:00Z"));
    assert.equal(restarted.public({ token: share.token }).title, "Society");
  } finally {
    other.db.close();
  }
  await f.store.revoke(f.client, "a", { id: share.id });
  assert.equal(f.rows.size, 2);
  assert.equal(f.rows.get(id).content.reading.status, "ready");
  const tables = f.tools.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);
  assert.equal(
    tables.some((n) => /beta_grant|budget|reservation|provider_queue/.test(n)),
    false,
  );
});
test("delete revokes before remote deletion and blocks an in-flight share from resurrecting it", async (t) => {
  let release, entered;
  const started = new Promise((r) => (entered = r));
  const hold = new Promise((r) => (release = r));
  const f = fixture(t, async () => {
    entered();
    await hold;
    return { dataUrl: `data:audio/mpeg;base64,${mp3Fixture().toString("base64")}` };
  });
  const pending = f.store.create(f.client, "a", input);
  await started;
  await f.store.deleteLesson(f.client, "a", id);
  release();
  await assert.rejects(pending, /Sharing is disabled/);
  assert.equal(f.tools.db.prepare("SELECT count(*) AS n FROM tf_student_shares").get().n, 0);
  assert.equal(f.rows.has(id), false);
});
test("a failed or uncertain remote deletion keeps existing links revoked and blocks new shares", async (t) => {
  const f = fixture(t),
    share = await f.store.create(f.client, "a", input);
  f.failDelete(true);
  await assert.rejects(f.store.deleteLesson(f.client, "a", id), /could not confirm deletion/);
  assert.throws(() => f.store.public({ token: share.token }), /unavailable/);
  await assert.rejects(f.store.create(f.client, "a", input), /Sharing is disabled/);
  f.failDelete(false);
  await f.store.deleteLesson(f.client, "a", id);
  assert.equal(f.rows.has(id), false);
});
test("revocation during refresh wins and never reopens a link", async (t) => {
  const f = fixture(t),
    share = await f.store.create(f.client, "a", input);
  let release, entered;
  const started = new Promise((r) => (entered = r)),
    hold = new Promise((r) => (release = r));
  f.store.setAudioReader(async () => {
    entered();
    await hold;
    return { dataUrl: `data:audio/mpeg;base64,${mp3Fixture().toString("base64")}` };
  });
  const pending = f.store.refresh(f.client, "a", { id: share.id });
  await started;
  await f.store.revoke(f.client, "a", { id: share.id });
  release();
  await assert.rejects(pending, /expired or was revoked/);
  assert.throws(() => f.store.public({ token: share.token }), /unavailable/);
});
test("invalid audio, oversized text and unavailable selections fail before publication", async (t) => {
  const f = fixture(t, () => ({ dataUrl: "data:audio/mpeg;base64,SUQz" }));
  await assert.rejects(f.store.create(f.client, "a", input));
  assert.deepEqual((await f.store.list(f.client, "a", { lessonId: id })).availableSections, [
    "worksheet",
    "reading",
    "homework",
  ]);
  f.rows.get(id).content.homework.tasks = ["x".repeat(300_001)];
  await assert.rejects(
    f.store.create(f.client, "a", { ...input, sections: ["homework"] }),
    /too large/,
  );
  delete f.rows.get(id).content.reading;
  await assert.rejects(
    f.store.create(f.client, "a", { ...input, sections: ["reading"] }),
    /not saved yet/,
  );
  assert.equal(f.tools.db.prepare("SELECT count(*) AS n FROM tf_student_shares").get().n, 0);
});

test("a delayed duplicate create cannot recreate a just-revoked link", async (t) => {
  let release,
    entered,
    calls = 0;
  const started = new Promise((resolve) => (entered = resolve));
  const hold = new Promise((resolve) => (release = resolve));
  const f = fixture(t, async () => {
    if (++calls === 2) {
      entered();
      await hold;
    }
    return { dataUrl: `data:audio/mpeg;base64,${mp3Fixture().toString("base64")}` };
  });
  const first = f.store.create(f.client, "a", input);
  const second = f.store.create(f.client, "a", input);
  const link = await first;
  await started;
  await f.store.revoke(f.client, "a", { id: link.id });
  release();
  await assert.rejects(second, /link changed while sharing/);
  assert.throws(() => f.store.public({ token: link.token }), /unavailable/);
  assert.equal(f.tools.db.prepare("SELECT revoked FROM tf_student_shares").get().revoked, 1);
  const deliberate = await f.store.create(f.client, "a", input);
  assert.notEqual(deliberate.token, link.token);
  assert.equal(f.store.public({ token: deliberate.token }).title, "Society");
});
