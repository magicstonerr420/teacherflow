import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DAY = 86400000;
const hash = (value: string) => createHash('sha256').update('teacherflow-usage:' + value).digest('hex');
export class UsageStore {
  db: DatabaseSync;
  constructor(file: string, now = Date.now()) {
    mkdirSync(dirname(file), {recursive: true});
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA busy_timeout=2000; CREATE TABLE IF NOT EXISTS usage_settings (id INTEGER PRIMARY KEY, started INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS usage_events (session TEXT NOT NULL,event TEXT NOT NULL,target TEXT NOT NULL,day INTEGER NOT NULL,PRIMARY KEY(session,event,target,day)); CREATE TABLE IF NOT EXISTS usage_people (user TEXT PRIMARY KEY,active INTEGER NOT NULL,first_seen INTEGER NOT NULL,saved INTEGER,download INTEGER); CREATE TABLE IF NOT EXISTS usage_days (user TEXT NOT NULL,day INTEGER NOT NULL,PRIMARY KEY(user,day)); CREATE INDEX IF NOT EXISTS usage_event_day ON usage_events(day);");
    this.db.prepare('INSERT OR IGNORE INTO usage_settings VALUES(1,?)').run(now);
  }
  prune(now: number) {
    const cutoff = Math.floor(now / DAY) - 90;
    this.db.prepare('DELETE FROM usage_events WHERE day<?').run(cutoff);
    this.db.prepare('DELETE FROM usage_days WHERE day<?').run(cutoff);
  }
  event(session: string, event: string, target: string, now = Date.now()) {
    const day = Math.floor(now / DAY);
    this.prune(now);
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM usage_events WHERE day=?').get(day) as {n: number};
    if (count.n >= 100000) return; // A public metric cannot consume unbounded disk.
    this.db.prepare('INSERT OR IGNORE INTO usage_events VALUES(?,?,?,?)').run(hash(session), event, target, day);
  }
  teacher(user: string, kind: 'active' | 'saved' | 'download', now = Date.now()) {
    const id = hash(user), day = Math.floor(now / DAY);
    this.prune(now);
    this.db.prepare('INSERT OR IGNORE INTO usage_people(user,active,first_seen) VALUES(?,?,?)').run(id, day, now);
    this.db.prepare('INSERT OR IGNORE INTO usage_days VALUES(?,?)').run(id, day);
    if (kind !== 'active') this.db.prepare('UPDATE usage_people SET ' + kind + '=COALESCE(' + kind + ',?) WHERE user=?').run(day, id);
  }
  report(days: number, now = Date.now()) {
    this.prune(now);
    const today = Math.floor(now / DAY), since = today - days + 1;
    const counts = this.db.prepare('SELECT event,COUNT(DISTINCT session) AS n FROM usage_events WHERE day>=? GROUP BY event').all(since) as {event: string; n: number}[];
    const milestones = this.db.prepare('SELECT COUNT(*) AS active,COUNT(CASE WHEN saved>=? THEN 1 END) AS saved,COUNT(CASE WHEN download>=? THEN 1 END) AS download FROM usage_people WHERE user IN (SELECT user FROM usage_days WHERE day>=?)').get(since, since, since) as {active: number; saved: number; download: number};
    const retention = this.db.prepare('SELECT COUNT(*) AS eligible,COUNT(CASE WHEN EXISTS (SELECT 1 FROM usage_days d WHERE d.user=p.user AND d.day>p.active AND d.day<=p.active+7) THEN 1 END) AS returned FROM usage_people p WHERE p.active>=? AND p.active<=? AND p.first_seen<=?').get(since - 7, today - 7, now - 7 * DAY) as {eligible: number; returned: number};
    const previews = this.db.prepare("SELECT target,COUNT(DISTINCT CASE WHEN event='preview' THEN session END) AS views,COUNT(DISTINCT CASE WHEN event='preview_download' THEN session END) AS downloads FROM usage_events WHERE day>=? AND event IN ('preview','preview_download') GROUP BY target").all(since) as {target: string; views: number; downloads: number}[];
    return {started: (this.db.prepare('SELECT started FROM usage_settings WHERE id=1').get() as {started: number}).started, days, counts: Object.fromEntries(counts.map(row => [row.event, row.n])), milestones, retention, previews};
  }
}
let store: UsageStore | undefined;
export function usageStore() {
  return store ??= new UsageStore(process.env['TEACHERFLOW_USAGE_DB'] || join(dirname(process.env['TEACHERFLOW_BETA_DB'] || '.local-runtime/beta.sqlite'), 'usage.sqlite'));
}
