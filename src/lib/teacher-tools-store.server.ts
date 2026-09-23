import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { savedClassSchema, feedbackSchema, type SavedClass, type LessonFeedback, type FeedbackEntry } from './teacher-tools.ts';

/** Uses the existing persistent beta database, so its normal backups include these tables. */
export class TeacherToolsStore {
  db: DatabaseSync;
  constructor(file: string) {
    mkdirSync(dirname(file), {recursive:true});
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS tf_classes (user_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, settings TEXT NOT NULL, PRIMARY KEY(user_id,id));
      CREATE TABLE IF NOT EXISTS tf_favorites (user_id TEXT NOT NULL, lesson_id TEXT NOT NULL, PRIMARY KEY(user_id,lesson_id));
      CREATE TABLE IF NOT EXISTS tf_feedback (user_id TEXT NOT NULL, lesson_id TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id,lesson_id));`);
  }
  private user(user: string) { if (!user) throw new Error('Sign in to use your saved tools.'); }
  classes(user: string): SavedClass[] {
    this.user(user);
    return (this.db.prepare('SELECT id,name,settings FROM tf_classes WHERE user_id=? ORDER BY name COLLATE NOCASE').all(user) as {id:string;name:string;settings:string}[])
      .map(row => ({...row, settings:JSON.parse(row.settings)}));
  }
  saveClass(user: string, input: unknown) {
    this.user(user);
    const data = savedClassSchema.parse(input);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (data.id) {
        const result = this.db.prepare('UPDATE tf_classes SET name=?, settings=? WHERE user_id=? AND id=?')
          .run(data.name, JSON.stringify(data.settings), user, data.id);
        if (!result.changes) throw new Error('This saved class is unavailable. Refresh and try again.');
      } else {
        if (this.classes(user).length >= 30) throw new Error('You can save up to 30 classes. Remove one before adding another.');
        data.id = randomUUID();
        this.db.prepare('INSERT INTO tf_classes VALUES (?,?,?,?)').run(user, data.id, data.name, JSON.stringify(data.settings));
      }
      this.db.exec('COMMIT');
      return data.id;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  deleteClass(user: string, id: string) {
    this.user(user);
    this.db.prepare('DELETE FROM tf_classes WHERE user_id=? AND id=?').run(user, id);
  }
  favorites(user: string): string[] {
    this.user(user);
    return (this.db.prepare('SELECT lesson_id FROM tf_favorites WHERE user_id=?').all(user) as {lesson_id:string}[]).map(row => row.lesson_id);
  }
  favorite(user: string, id: string, active: boolean) {
    this.user(user);
    if (active) this.db.prepare('INSERT OR IGNORE INTO tf_favorites VALUES (?,?)').run(user, id);
    else this.db.prepare('DELETE FROM tf_favorites WHERE user_id=? AND lesson_id=?').run(user, id);
  }
  feedback(user: string, id: string): LessonFeedback | null {
    this.user(user);
    const row = this.db.prepare('SELECT body FROM tf_feedback WHERE user_id=? AND lesson_id=?').get(user, id) as {body:string}|undefined;
    return row ? feedbackSchema.parse(JSON.parse(row.body)) : null;
  }
  saveFeedback(user: string, input: unknown, context: {topic:string;level:string;teacher:string}) {
    this.user(user);
    const data = feedbackSchema.parse(input);
    const previous = this.feedback(user, data.lessonId);
    const entry = {...data,
      timeSaved: data.timeSaved === undefined ? previous?.timeSaved ?? null : data.timeSaved,
      wouldPay: data.wouldPay === undefined ? previous?.wouldPay ?? null : data.wouldPay,
      topic:context.topic.slice(0,300), level:context.level.slice(0,30), teacher:context.teacher.slice(0,254)};
    this.db.prepare('INSERT INTO tf_feedback VALUES (?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at')
      .run(user, data.lessonId, JSON.stringify(entry), new Date().toISOString());
  }
  // This method must only be reached after the server verifies owner identity.
  feedbackPage(offset: number): {entries:FeedbackEntry[]; more:boolean} {
    const rows = this.db.prepare('SELECT body,updated_at FROM tf_feedback ORDER BY updated_at DESC,user_id,lesson_id LIMIT 51 OFFSET ?').all(offset) as {body:string;updated_at:string}[];
    return { entries:rows.slice(0,50).map(row => ({...JSON.parse(row.body), updatedAt:row.updated_at})), more:rows.length>50 };
  }
}
let singleton: TeacherToolsStore | undefined;
export function teacherToolsStore() {
  const file = process.env['TEACHERFLOW_BETA_DB'];
  if (!file && process.env['NODE_ENV'] === 'production') throw new Error('Saved teacher tools need the persistent database configured.');
  return singleton ??= new TeacherToolsStore(file || '.teacherflow/beta.sqlite');
}
