import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { TeacherToolsStore } from "../src/lib/teacher-tools-store.server.ts";
import { ClassLibraryStore } from "../src/lib/class-library-store.server.ts";
import { taughtOnSchema, updateClassLessonSchema } from "../src/lib/class-library.ts";

const lessonId = "11111111-1111-4111-8111-111111111111";
const otherLessonId = "22222222-2222-4222-8222-222222222222";
const missingClassId = "33333333-3333-4333-8333-333333333333";
const settings = {
  studentAge: "8-9",
  level: "A1",
  durationMinutes: 45,
  technologyAvailable: "No technology",
};

function fakeLessons() {
  const rows = new Map([
    [
      lessonId,
      {
        id: lessonId,
        user_id: "a",
        topic: "Nature",
        level: "A1",
        content: { teacherEdit: "Keep this exact lesson" },
      },
    ],
    [
      otherLessonId,
      {
        id: otherLessonId,
        user_id: "b",
        topic: "Food",
        level: "A2",
        content: { teacherEdit: "Another account" },
      },
    ],
  ]);
  const reads = [];
  let fail = false;
  const client = {
    from(table) {
      assert.equal(table, "lessons");
      return {
        select() {
          const filters = {};
          return {
            eq(key, value) {
              filters[key] = value;
              return this;
            },
            async maybeSingle() {
              reads.push({ ...filters });
              const row = rows.get(filters.id);
              return {
                data: row?.user_id === filters.user_id ? row : null,
                error: fail ? Error("offline") : null,
              };
            },
          };
        },
        insert() {
          assert.fail("Class organization must not insert lessons");
        },
        update() {
          assert.fail("Class organization must not update lessons");
        },
        delete() {
          assert.fail("Class organization must not delete lessons");
        },
      };
    },
  };
  return {
    client,
    rows,
    reads,
    fail(value) {
      fail = value;
    },
  };
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "teacherflow-class-library-"));
  const file = join(dir, "beta.sqlite");
  const tools = new TeacherToolsStore(file);
  let now = new Date("2026-09-20T12:00:00.000Z");
  const store = new ClassLibraryStore(tools, () => now);
  const classId = tools.saveClass("a", { name: "Monday beginners", settings });
  const secondClassId = tools.saveClass("a", { name: "Friday beginners", settings });
  const otherClassId = tools.saveClass("b", { name: "Someone else", settings });
  const library = fakeLessons();
  return {
    dir,
    file,
    tools,
    store,
    classId,
    secondClassId,
    otherClassId,
    ...library,
    advance() {
      now = new Date("2026-09-22T15:00:00.000Z");
    },
    cleanup() {
      tools.db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("one lesson can belong to several classes; history survives restart and leaves lessons and quotas intact", async () => {
  const f = fixture();
  try {
    f.tools.db.exec(`CREATE TABLE beta_state (id INTEGER PRIMARY KEY,body TEXT);
      INSERT INTO beta_state VALUES(1,'{"remaining":2,"images":6}');`);
    const originalLessons = structuredClone([...f.rows.values()]);
    const first = await f.store.assign(f.client, "a", { lessonId, classId: f.classId });
    assert.deepEqual(first, {
      lessonId,
      classId: f.classId,
      taughtOn: null,
      notes: "",
      addedAt: "2026-09-20T12:00:00.000Z",
      updatedAt: "2026-09-20T12:00:00.000Z",
    });
    f.advance();
    const updated = await f.store.update(f.client, "a", {
      lessonId,
      classId: f.classId,
      taughtOn: "2026-09-21",
      notes: "Repeat the pair activity next week.",
    });
    assert.equal(updated.addedAt, first.addedAt);
    assert.equal(updated.updatedAt, "2026-09-22T15:00:00.000Z");
    assert.deepEqual(
      await f.store.assign(f.client, "a", { lessonId, classId: f.classId }),
      updated,
      "Assign retry preserves history",
    );
    await f.store.assign(f.client, "a", { lessonId, classId: f.secondClassId });
    assert.equal(f.store.library("a").links.length, 2);
    assert.deepEqual(f.store.library("b").links, []);
    assert.equal(f.store.library("a").classes.length, 2);

    const child = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        `
      import { TeacherToolsStore } from ${JSON.stringify(new URL("../src/lib/teacher-tools-store.server.ts", import.meta.url).href)};
      import { ClassLibraryStore } from ${JSON.stringify(new URL("../src/lib/class-library-store.server.ts", import.meta.url).href)};
      const tools = new TeacherToolsStore(${JSON.stringify(f.file)});
      const store = new ClassLibraryStore(tools);
      process.stdout.write(JSON.stringify(store.library('a')));
      tools.db.close();
    `,
      ],
      { encoding: "utf8" },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), f.store.library("a"));
    assert.equal(
      f.tools.db.prepare("SELECT body FROM beta_state").get().body,
      '{"remaining":2,"images":6}',
    );
    assert.deepEqual([...f.rows.values()], originalLessons);
    assert.equal(f.tools.feedback("a", lessonId), null);
    assert.deepEqual(f.tools.favorites("a"), []);
  } finally {
    f.cleanup();
  }
});

test("every mutation verifies the owned lesson and fails closed for another account or a Supabase error", async () => {
  const f = fixture();
  try {
    const input = {
      lessonId,
      classId: f.classId,
      taughtOn: "2026-09-21",
      notes: "Keep",
      targetClassId: f.secondClassId,
    };
    await f.store.assign(f.client, "a", input);
    const before = f.store.library("a");
    for (const method of ["assign", "update", "remove", "move"]) {
      await assert.rejects(f.store[method](f.client, "", input), /Sign in/);
      await assert.rejects(f.store[method](f.client, "b", input), /unavailable or belongs/);
      assert.deepEqual(f.reads.at(-1), { id: lessonId, user_id: "b" });
      await assert.rejects(
        f.store[method](f.client, "a", { ...input, lessonId: otherLessonId }),
        /unavailable or belongs/,
      );
      assert.deepEqual(f.reads.at(-1), { id: otherLessonId, user_id: "a" });
      f.fail(true);
      await assert.rejects(f.store[method](f.client, "a", input), /unavailable or belongs/);
      f.fail(false);
      assert.deepEqual(f.store.library("a"), before);
    }
    assert.throws(() => f.store.library(""), /Sign in/);
    f.rows.delete(lessonId);
    for (const method of ["assign", "update", "remove", "move"]) {
      await assert.rejects(f.store[method](f.client, "a", input), /unavailable or belongs/);
    }
    assert.deepEqual(
      f.store.library("a"),
      before,
      "Stale lesson links remain inert for the UI to ignore",
    );
  } finally {
    f.cleanup();
  }
});

test("class ownership cannot be bypassed with an owned lesson or input account fields", async () => {
  const f = fixture();
  try {
    const input = {
      lessonId,
      classId: f.classId,
      taughtOn: null,
      notes: "",
      targetClassId: f.secondClassId,
    };
    await f.store.assign(f.client, "a", input);
    const before = f.store.library("a");
    for (const method of ["assign", "update", "remove", "move"]) {
      for (const classId of [f.otherClassId, missingClassId]) {
        await assert.rejects(
          f.store[method](f.client, "a", { ...input, classId, user_id: "b", userId: "b" }),
          /saved class is unavailable/,
        );
      }
    }
    await assert.rejects(
      f.store.move(f.client, "a", { ...input, targetClassId: f.otherClassId }),
      /saved class is unavailable/,
    );
    assert.deepEqual(f.store.library("a"), before);
    assert.deepEqual(f.store.library("b").links, []);
    assert.equal(f.store.library("b").classes[0].id, f.otherClassId);
  } finally {
    f.cleanup();
  }
});

test("calendar dates and note length are validated and history can be cleared without removing the assignment", async () => {
  for (const value of [null, "2024-02-29", "2026-09-22", "2000-02-29", "0001-01-01"])
    assert.equal(taughtOnSchema.safeParse(value).success, true, String(value));
  for (const value of [
    "",
    "2026-02-29",
    "2026-04-31",
    "1900-02-29",
    "2026-13-01",
    "2026-00-01",
    "2026-09-00",
    "2026-9-22",
    "2026-09-22T00:00:00Z",
    "0000-01-01",
    123,
  ])
    assert.equal(taughtOnSchema.safeParse(value).success, false, String(value));
  const f = fixture();
  try {
    const input = { lessonId, classId: f.classId, taughtOn: "2026-09-22", notes: "x".repeat(2000) };
    assert.equal(updateClassLessonSchema.safeParse(input).success, true);
    assert.equal(
      updateClassLessonSchema.safeParse({ ...input, notes: "x".repeat(2001) }).success,
      false,
    );
    await assert.rejects(f.store.update(f.client, "a", input), /no longer in this class/);
    await f.store.assign(f.client, "a", input);
    await f.store.update(f.client, "a", input);
    const before = f.store.library("a");
    for (const patch of [
      { taughtOn: "2026-02-29" },
      { notes: "x".repeat(2001) },
      { notes: null },
      { classId: "invalid" },
    ]) {
      await assert.rejects(f.store.update(f.client, "a", { ...input, ...patch }));
      assert.deepEqual(f.store.library("a"), before);
    }
    const cleared = await f.store.update(f.client, "a", { ...input, taughtOn: null, notes: "" });
    assert.equal(cleared.taughtOn, null);
    assert.equal(cleared.notes, "");
    assert.equal(f.store.library("a").links.length, 1);
  } finally {
    f.cleanup();
  }
});

test("removing an assignment or class preserves other class history and original lessons", async () => {
  const f = fixture();
  try {
    await f.store.assign(f.client, "a", { lessonId, classId: f.classId });
    await f.store.assign(f.client, "a", { lessonId, classId: f.secondClassId });
    await f.store.assign(f.client, "b", { lessonId: otherLessonId, classId: f.otherClassId });
    assert.deepEqual(await f.store.remove(f.client, "a", { lessonId, classId: f.classId }), {
      ok: true,
    });
    await f.store.remove(f.client, "a", { lessonId, classId: f.classId });
    assert.equal(f.store.library("a").links[0].classId, f.secondClassId);
    const secondHandle = new TeacherToolsStore(f.file);
    try {
      secondHandle.deleteClass("a", f.secondClassId);
    } finally {
      secondHandle.db.close();
    }
    assert.deepEqual(f.store.library("a").links, []);
    assert.equal(
      f.tools.db.prepare("SELECT COUNT(*) AS n FROM tf_class_lessons WHERE user_id=?").get("a").n,
      0,
      "Class deletion through another handle cleans links",
    );
    assert.equal(f.store.library("b").links.length, 1);
    assert.equal(f.rows.size, 2);
    await assert.rejects(
      f.store.assign(f.client, "a", { lessonId, classId: f.secondClassId }),
      /saved class is unavailable/,
    );
    f.tools.db
      .prepare("INSERT INTO tf_class_lessons VALUES (?,?,?,NULL,'',?,?)")
      .run("a", missingClassId, lessonId, "2026-09-22", "2026-09-22");
    assert.deepEqual(f.store.library("a").links, [], "Legacy orphan links are filtered");
  } finally {
    f.cleanup();
  }
});

test("move is atomic, carries source history, and preserves an already assigned target history", async () => {
  const f = fixture();
  try {
    const input = { lessonId, classId: f.classId, targetClassId: f.secondClassId };
    await f.store.assign(f.client, "a", input);
    await f.store.update(f.client, "a", {
      ...input,
      taughtOn: "2026-09-20",
      notes: "Source history",
    });
    const source = f.store.library("a").links[0];
    assert.deepEqual(
      await f.store.move(f.client, "a", { ...input, targetClassId: f.classId }),
      source,
    );
    const moved = await f.store.move(f.client, "a", input);
    assert.equal(moved.classId, f.secondClassId);
    assert.equal(moved.taughtOn, "2026-09-20");
    assert.equal(moved.notes, "Source history");
    assert.equal(f.store.library("a").links.length, 1);
    await f.store.assign(f.client, "a", input);
    await f.store.update(f.client, "a", {
      ...input,
      taughtOn: "2026-09-22",
      notes: "New source history",
    });
    assert.deepEqual(
      await f.store.move(f.client, "a", input),
      moved,
      "Existing target history is preserved",
    );
    assert.equal(f.store.library("a").links.length, 1);
    await assert.rejects(f.store.move(f.client, "a", input), /no longer in this class/);
    await f.store.assign(f.client, "a", input);
    f.tools.db.exec(`CREATE TRIGGER simulate_move_failure BEFORE DELETE ON tf_class_lessons
      BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;`);
    const thirdClassId = f.tools.saveClass("a", { name: "Third class", settings });
    const before = f.store.library("a");
    await assert.rejects(
      f.store.move(f.client, "a", { ...input, targetClassId: thirdClassId }),
      /simulated failure/,
    );
    assert.deepEqual(
      f.store.library("a"),
      before,
      "Failed move rolls back target insertion and keeps source",
    );
    assert.equal(f.rows.size, 2);
  } finally {
    f.cleanup();
  }
});
