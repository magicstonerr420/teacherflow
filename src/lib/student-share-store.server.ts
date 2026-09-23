import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { teacherToolsStore, type TeacherToolsStore } from "./teacher-tools-store.server.ts";
import { validateMp3DataUrl } from "./media-validation.server.ts";
import { prepareShapeWorksheet } from "./worksheet-shapes.ts";
import {
  createStudentShareSchema,
  studentShareIdSchema,
  studentShareLessonSchema,
  studentShareTokenSchema,
  publicStudentShareSchema,
  type PublicStudentShare,
  type StudentShareSection,
  type StudentShareSummary,
} from "./student-share.ts";

const UNAVAILABLE =
  "This student link is unavailable or has expired. Ask your teacher for a new link.";
const PRIVATE_UNAVAILABLE = "This saved lesson is unavailable for your account.";
type Row = {
  id: string;
  user_id: string;
  lesson_id: string;
  token: string;
  sections: string;
  body: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  revoked: number;
};
type Saved = { id: string; topic: string; content: unknown; inputs?: unknown };
type AudioReader = (id: string, user: string) => { dataUrl: string } | Promise<{ dataUrl: string }>;
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const strings = (v: unknown): string[] =>
  array(v).filter((item): item is string => typeof item === "string");
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

// Every nested object is constructed here. Never spread a saved model object into a public DTO.
function studentDocument(raw: unknown) {
  const doc = record(raw);
  const sections = array(doc["sections"])
    .map(record)
    .filter((s) => s["label"] !== "Reading • DeepSeek" && s["label"] !== "Listening")
    .map((s) => ({
      label: text(s["label"]),
      title: text(s["title"]),
      format: text(s["format"]),
      instructions: text(s["instructions"]),
      passage: text(s["passage"]),
      wordBank: strings(s["wordBank"]),
      items: array(s["items"])
        .map(record)
        .map((item, i) => ({
          number: typeof item["number"] === "number" ? item["number"] : i + 1,
          prompt: text(item["prompt"]),
          choices: strings(item["choices"]),
          answerLines: typeof item["answerLines"] === "number" ? item["answerLines"] : 1,
          visual: text(item["visual"]),
        })),
    }));
  return { title: text(doc["title"]), instructions: text(doc["instructions"]), sections };
}
function available(content: unknown): StudentShareSection[] {
  const lesson = record(content),
    result: StudentShareSection[] = [];
  if (studentDocument(record(lesson["worksheet"])["student"])["sections"].length)
    result.push("worksheet");
  if (
    record(lesson["reading"])["status"] === "ready" &&
    text(record(record(lesson["reading"])["value"])["text"])
  )
    result.push("reading");
  if (
    record(lesson["listening"])["status"] === "ready" &&
    array(record(record(lesson["listening"])["value"])["questions"]).length &&
    /^[a-f0-9]{64}$/.test(text(record(record(lesson["listening"])["audio"])["id"]))
  )
    result.push("listening");
  if (array(record(lesson["homework"])["tasks"]).length) result.push("homework");
  return result;
}
export async function createStudentSnapshot(
  saved: Saved,
  sections: StudentShareSection[],
  dates: { updatedAt: string; expiresAt: string },
  user: string,
  readAudio?: AudioReader,
): Promise<PublicStudentShare> {
  const lesson = record(saved.content);
  if (sections.some((s) => !available(lesson).includes(s)))
    throw new Error("One selected section is not saved yet. Save the completed materials first.");
  const result: PublicStudentShare = { title: text(saved.topic), ...dates };
  if (sections.includes("worksheet")) {
    const vocabulary = { requiredVocabulary: text(record(saved.inputs)["requiredVocabulary"]) };
    const worksheet = record(lesson["worksheet"]),
      studentB = prepareShapeWorksheet(studentDocument(worksheet["studentB"]), vocabulary);
    result["worksheet"] = {
      student: prepareShapeWorksheet(studentDocument(worksheet["student"]), vocabulary),
      ...(studentB["sections"].length ? { studentB } : {}),
    };
  }
  const questions = (v: unknown) =>
    array(v)
      .map(record)
      .map((q) => ({ question: text(q["question"]), choices: strings(q["choices"]) }));
  if (sections.includes("reading")) {
    const r = record(record(lesson["reading"])["value"]);
    result["reading"] = {
      title: text(r["title"]),
      instructions: text(r["instructions"]),
      text: text(r["text"]),
      questions: questions(r["questions"]),
    };
  }
  if (sections.includes("listening")) {
    const state = record(lesson["listening"]),
      l = record(state["value"]);
    result["listening"] = {
      title: text(l["title"]),
      instructions: text(l["instructions"]),
      questions: questions(l["questions"]),
    };
  }
  if (sections.includes("homework")) {
    const h = record(lesson["homework"]);
    result["homework"] = {
      title: text(h["title"]),
      instructions: text(h["instructions"]),
      tasks: strings(h["tasks"]),
      estimatedTime: text(h["estimatedTime"]),
    };
  }
  // Bound text before attaching audio; an unusually large lesson never becomes a public payload.
  if (Buffer.byteLength(JSON.stringify(result)) > 300_000)
    throw new Error("These materials are too large to share in one link. Select fewer sections.");
  if (result["listening"]) {
    if (!readAudio) throw new Error("Save a listening recording before sharing this activity.");
    const audioId = text(record(record(lesson["listening"])["audio"])["id"]);
    if (/^[a-f0-9]{64}$/.test(audioId)) {
      // Account-scoped lookup and byte validation; sharing cannot initiate generation.
      const audio = await readAudio(audioId, user);
      result["listening"]["audio"] = {
        dataUrl: validateMp3DataUrl(audio.dataUrl),
        mime: "audio/mpeg",
      };
    }
  }
  return publicStudentShareSchema.parse(result);
}

/** Share snapshots live in the same persistent/backup database as saved teacher tools. */
export class StudentShareStore {
  readonly db: TeacherToolsStore["db"];
  private now: () => Date;
  private readAudio: AudioReader | undefined;
  constructor(
    tools: TeacherToolsStore,
    now: () => Date = () => new Date(),
    readAudio?: AudioReader,
  ) {
    this.db = tools.db;
    this.now = now;
    this.readAudio = readAudio;
    this.db.exec(`CREATE TABLE IF NOT EXISTS tf_student_shares (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, lesson_id TEXT NOT NULL, token TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE, sections TEXT NOT NULL, body TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id,lesson_id));
      CREATE TABLE IF NOT EXISTS tf_student_share_deleted (user_id TEXT NOT NULL,lesson_id TEXT NOT NULL,PRIMARY KEY(user_id,lesson_id));`);
  }
  setAudioReader(readAudio: AudioReader) {
    this.readAudio = readAudio;
  }
  private transaction<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  private user(user: string) {
    if (!user) throw new Error("Sign in to share a saved lesson.");
  }
  private blocked(user: string, lessonId: string) {
    if (
      this.db
        .prepare("SELECT 1 FROM tf_student_share_deleted WHERE user_id=? AND lesson_id=?")
        .get(user, lessonId)
    )
      throw new Error(
        "Sharing is disabled because this lesson was deleted or its deletion is being checked.",
      );
  }
  private async saved(client: SupabaseClient, user: string, lessonId: string): Promise<Saved> {
    this.user(user);
    const { data, error } = await client
      .from("lessons")
      .select("id,topic,content,inputs")
      .eq("id", lessonId)
      .eq("user_id", user)
      .maybeSingle();
    if (error || !data) throw new Error(PRIVATE_UNAVAILABLE);
    return data as Saved;
  }
  private own(user: string, id: string): Row {
    this.user(user);
    const row = this.db
      .prepare("SELECT * FROM tf_student_shares WHERE user_id=? AND id=?")
      .get(user, id) as Row | undefined;
    if (!row) throw new Error("This student link is unavailable for your account.");
    return row;
  }
  private summary(row: Row): StudentShareSummary {
    return {
      id: row["id"],
      token: row.token,
      sections: JSON.parse(row["sections"]),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      status: row.revoked
        ? "revoked"
        : row.expires_at <= this.now().toISOString()
          ? "expired"
          : "active",
    };
  }
  async list(client: SupabaseClient, user: string, input: unknown) {
    const { lessonId } = studentShareLessonSchema.parse(input),
      saved = await this.saved(client, user, lessonId);
    let availableSections = available(saved.content);
    if (availableSections.includes("listening")) {
      try {
        if (!this.readAudio) throw new Error("Recording reader unavailable");
        const audioId = text(record(record(record(saved.content)["listening"])["audio"])["id"]);
        validateMp3DataUrl((await this.readAudio(audioId, user)).dataUrl);
      } catch {
        availableSections = availableSections.filter((section) => section !== "listening");
      }
    }
    const rows = this.db
      .prepare("SELECT * FROM tf_student_shares WHERE user_id=? AND lesson_id=?")
      .all(user, lessonId) as Row[];
    return { shares: rows.map((row) => this.summary(row)), availableSections };
  }
  async create(client: SupabaseClient, user: string, input: unknown) {
    const data = createStudentShareSchema.parse(input);
    this.user(user);
    // Capture the link generation before any awaited source/audio reads. A slow
    // duplicate create must not recreate a link that the teacher has just revoked.
    const initial = this.db
      .prepare("SELECT id,revoked FROM tf_student_shares WHERE user_id=? AND lesson_id=?")
      .get(user, data.lessonId) as Pick<Row, "id" | "revoked"> | undefined;
    const saved = await this.saved(client, user, data.lessonId);
    const now = this.now(),
      dates = {
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + data.expiresInDays * 86_400_000).toISOString(),
      };
    const body = await createStudentSnapshot(saved, data["sections"], dates, user, this.readAudio);
    return this.transaction(() => {
      this.blocked(user, data.lessonId);
      const existing = this.db
        .prepare("SELECT * FROM tf_student_shares WHERE user_id=? AND lesson_id=?")
        .get(user, data.lessonId) as Row | undefined;
      // A double click / request replay cannot silently replace an active link.
      if (existing && this.summary(existing)["status"] === "active") return this.summary(existing);
      if (existing && (existing.id !== initial?.id || existing.revoked !== initial.revoked)) {
        throw new Error(
          "This link changed while sharing. Reopen Share with students to create a new link.",
        );
      }
      const count = this.db
        .prepare("SELECT count(*) AS n FROM tf_student_shares WHERE user_id=?")
        .get(user) as { n: number };
      if (!existing && count.n >= 1000)
        throw new Error("You have reached the saved student link limit.");
      const id = randomUUID(),
        token = randomBytes(32).toString("base64url");
      this.db
        .prepare(
          `INSERT INTO tf_student_shares (id,user_id,lesson_id,token,token_hash,sections,body,created_at,updated_at,expires_at,revoked)
        VALUES (?,?,?,?,?,?,?,?,?,?,0) ON CONFLICT(user_id,lesson_id) DO UPDATE SET id=excluded.id,token=excluded.token,token_hash=excluded.token_hash,sections=excluded.sections,body=excluded.body,created_at=excluded.created_at,updated_at=excluded.updated_at,expires_at=excluded.expires_at,revoked=0`,
        )
        .run(
          id,
          user,
          data.lessonId,
          token,
          hash(token),
          JSON.stringify(data["sections"]),
          JSON.stringify(body),
          dates.updatedAt,
          dates.updatedAt,
          dates.expiresAt,
        );
      return this.summary(this.own(user, id));
    });
  }
  async refresh(client: SupabaseClient, user: string, input: unknown) {
    const { id } = studentShareIdSchema.parse(input),
      row = this.own(user, id);
    if (this.summary(row)["status"] !== "active")
      throw new Error("Create a new link to replace an expired or revoked link.");
    const saved = await this.saved(client, user, row.lesson_id);
    const now = this.now().toISOString();
    const body = await createStudentSnapshot(
      saved,
      JSON.parse(row["sections"]),
      { updatedAt: now, expiresAt: row.expires_at },
      user,
      this.readAudio,
    );
    return this.transaction(() => {
      this.blocked(user, row.lesson_id);
      const current = this.own(user, id);
      if (this.summary(current)["status"] !== "active")
        throw new Error("This link has expired or was revoked. Create a new link.");
      this.db
        .prepare("UPDATE tf_student_shares SET body=?,updated_at=? WHERE user_id=? AND id=?")
        .run(JSON.stringify(body), now, user, id);
      return this.summary(this.own(user, id));
    });
  }
  async revoke(client: SupabaseClient, user: string, input: unknown) {
    const { id } = studentShareIdSchema.parse(input),
      row = this.own(user, id);
    await this.saved(client, user, row.lesson_id);
    this.db
      .prepare("UPDATE tf_student_shares SET revoked=1,body='{}' WHERE user_id=? AND id=?")
      .run(user, id);
    return { ok: true as const };
  }
  public(input: unknown): PublicStudentShare {
    const valid = studentShareTokenSchema.safeParse(input);
    if (!valid.success) throw new Error(UNAVAILABLE);
    const row = this.db
      .prepare(
        `SELECT s.body,s.expires_at,s.revoked FROM tf_student_shares s
      WHERE s.token_hash=? AND NOT EXISTS (SELECT 1 FROM tf_student_share_deleted d WHERE d.user_id=s.user_id AND d.lesson_id=s.lesson_id)`,
      )
      .get(hash(valid.data.token)) as Pick<Row, "body" | "expires_at" | "revoked"> | undefined;
    if (
      !row ||
      row.revoked ||
      row.expires_at <= this.now().toISOString() ||
      row.body.length > 11_600_000
    )
      throw new Error(UNAVAILABLE);
    try {
      return publicStudentShareSchema.parse(JSON.parse(row.body));
    } catch {
      throw new Error(UNAVAILABLE);
    }
  }
  async deleteLesson(client: SupabaseClient, user: string, lessonId: string) {
    studentShareLessonSchema.parse({ lessonId });
    await this.saved(client, user, lessonId);
    this.transaction(() => {
      this.db
        .prepare("INSERT OR IGNORE INTO tf_student_share_deleted VALUES (?,?)")
        .run(user, lessonId);
      this.db
        .prepare("UPDATE tf_student_shares SET revoked=1,body='{}' WHERE user_id=? AND lesson_id=?")
        .run(user, lessonId);
    });
    // Persist the barrier before the remote delete. Even a timed-out delete cannot resurrect public data.
    const { error } = await client.from("lessons").delete().eq("id", lessonId).eq("user_id", user);
    if (error)
      throw new Error(
        "We could not confirm deletion. Student sharing is disabled; refresh your lessons and retry deleting.",
      );
    return { ok: true };
  }
}

let singleton: StudentShareStore | undefined;
export function studentShareStore(readAudio?: AudioReader) {
  singleton ??= new StudentShareStore(teacherToolsStore(), undefined, readAudio);
  if (readAudio) singleton.setAudioReader(readAudio);
  return singleton;
}
