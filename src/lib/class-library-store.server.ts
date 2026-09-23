import type { DatabaseSync } from "node:sqlite";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classLessonSchema,
  updateClassLessonSchema,
  moveClassLessonSchema,
  type ClassLessonLink,
  type ClassLibrary,
} from "./class-library.ts";
import { teacherToolsStore, type TeacherToolsStore } from "./teacher-tools-store.server.ts";
import { ownedLesson } from "./teacher-tools-access.server.ts";

type LinkRow = {
  class_id: string;
  lesson_id: string;
  taught_on: string | null;
  notes: string;
  added_at: string;
  updated_at: string;
};
function snapshot(row: LinkRow): ClassLessonLink {
  return {
    classId: row.class_id,
    lessonId: row.lesson_id,
    taughtOn: row.taught_on,
    notes: row.notes,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}

/** Shares saved classes, the persistent beta database, and its existing backup lifecycle. */
export class ClassLibraryStore {
  readonly db: DatabaseSync;
  private tools: TeacherToolsStore;
  private now: () => Date;

  constructor(tools: TeacherToolsStore, now: () => Date = () => new Date()) {
    this.tools = tools;
    this.db = tools.db;
    this.now = now;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tf_class_lessons (
        user_id TEXT NOT NULL, class_id TEXT NOT NULL, lesson_id TEXT NOT NULL,
        taught_on TEXT, notes TEXT NOT NULL DEFAULT '', added_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id,class_id,lesson_id));
      CREATE TRIGGER IF NOT EXISTS tf_class_lessons_remove_class
        AFTER DELETE ON tf_classes BEGIN
          DELETE FROM tf_class_lessons WHERE user_id=OLD.user_id AND class_id=OLD.id;
        END;`);
  }

  private user(user: string) {
    if (!user) throw new Error("Sign in to open your class library.");
  }
  private ownClass(user: string, classId: string) {
    this.user(user);
    if (!this.db.prepare("SELECT 1 FROM tf_classes WHERE user_id=? AND id=?").get(user, classId)) {
      throw new Error("This saved class is unavailable. Refresh and try again.");
    }
  }
  private transaction<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private link(user: string, classId: string, lessonId: string): ClassLessonLink {
    const row = this.db
      .prepare("SELECT * FROM tf_class_lessons WHERE user_id=? AND class_id=? AND lesson_id=?")
      .get(user, classId, lessonId) as LinkRow | undefined;
    if (!row) throw new Error("This lesson is no longer in this class. Refresh and try again.");
    return snapshot(row);
  }

  library(user: string): ClassLibrary {
    this.user(user);
    // The join also hides any old orphan links created before the deletion trigger existed.
    const rows = this.db
      .prepare(
        `SELECT l.* FROM tf_class_lessons l
      INNER JOIN tf_classes c ON c.user_id=l.user_id AND c.id=l.class_id
      WHERE l.user_id=? ORDER BY l.added_at DESC,l.class_id,l.lesson_id`,
      )
      .all(user) as LinkRow[];
    return { classes: this.tools.classes(user), links: rows.map(snapshot) };
  }

  async assign(supabase: SupabaseClient, user: string, input: unknown): Promise<ClassLessonLink> {
    this.user(user);
    const data = classLessonSchema.parse(input);
    await ownedLesson(supabase, user, data.lessonId);
    return this.transaction(() => {
      this.ownClass(user, data.classId);
      const now = this.now().toISOString();
      // Repeated clicks or retries preserve existing teaching dates and notes.
      this.db
        .prepare(
          `INSERT OR IGNORE INTO tf_class_lessons
        (user_id,class_id,lesson_id,taught_on,notes,added_at,updated_at) VALUES (?,?,?,NULL,'',?,?)`,
        )
        .run(user, data.classId, data.lessonId, now, now);
      return this.link(user, data.classId, data.lessonId);
    });
  }

  async update(supabase: SupabaseClient, user: string, input: unknown): Promise<ClassLessonLink> {
    this.user(user);
    const data = updateClassLessonSchema.parse(input);
    await ownedLesson(supabase, user, data.lessonId);
    return this.transaction(() => {
      this.ownClass(user, data.classId);
      const result = this.db
        .prepare(
          `UPDATE tf_class_lessons SET taught_on=?,notes=?,updated_at=?
        WHERE user_id=? AND class_id=? AND lesson_id=?`,
        )
        .run(
          data.taughtOn,
          data.notes,
          this.now().toISOString(),
          user,
          data.classId,
          data.lessonId,
        );
      if (!result.changes)
        throw new Error("This lesson is no longer in this class. Refresh and try again.");
      return this.link(user, data.classId, data.lessonId);
    });
  }

  async remove(supabase: SupabaseClient, user: string, input: unknown): Promise<{ ok: true }> {
    this.user(user);
    const data = classLessonSchema.parse(input);
    await ownedLesson(supabase, user, data.lessonId);
    return this.transaction(() => {
      this.ownClass(user, data.classId);
      this.db
        .prepare("DELETE FROM tf_class_lessons WHERE user_id=? AND class_id=? AND lesson_id=?")
        .run(user, data.classId, data.lessonId);
      return { ok: true };
    });
  }

  async move(supabase: SupabaseClient, user: string, input: unknown): Promise<ClassLessonLink> {
    this.user(user);
    const data = moveClassLessonSchema.parse(input);
    await ownedLesson(supabase, user, data.lessonId);
    return this.transaction(() => {
      this.ownClass(user, data.classId);
      this.ownClass(user, data.targetClassId);
      const source = this.link(user, data.classId, data.lessonId);
      if (data.classId === data.targetClassId) return source;
      const now = this.now().toISOString();
      // Existing target history wins; otherwise carry the teacher's date and notes across.
      this.db
        .prepare(
          `INSERT OR IGNORE INTO tf_class_lessons
        (user_id,class_id,lesson_id,taught_on,notes,added_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
        )
        .run(user, data.targetClassId, data.lessonId, source.taughtOn, source.notes, now, now);
      this.db
        .prepare("DELETE FROM tf_class_lessons WHERE user_id=? AND class_id=? AND lesson_id=?")
        .run(user, data.classId, data.lessonId);
      return this.link(user, data.targetClassId, data.lessonId);
    });
  }
}

let singleton: ClassLibraryStore | undefined;
export function classLibraryStore(): ClassLibraryStore {
  return (singleton ??= new ClassLibraryStore(teacherToolsStore()));
}
