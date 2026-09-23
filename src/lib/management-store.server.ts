import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { explainFailure, safeDiagnostic } from './management.ts';

const stable = (v: any) => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
export const managementKey = (v: any) => createHash('sha256').update(typeof v === 'string' ? v : stable(v)).digest('hex');
export const managementFile = () => process.env['TEACHERFLOW_MANAGEMENT_DB'] || join(dirname(process.env['TEACHERFLOW_BETA_DB'] || '.local-runtime/beta.sqlite'), 'management.sqlite');
export type OperationInput = { user: string; request: any; part: string; detail?: string; target?: string; source?: 'server' | 'browser' };
type ProviderEvent = { model: string; kind: string; status?: number | undefined; ms: number; detail?: string; at: number };
export type ManagedOperation = { id: string; user: string; lesson: string; part: string; detail: string; target: string; source: string;
  status: string; issue: string; started: number; updated: number; finished: number | null; request: any;
  failure: ReturnType<typeof explainFailure> | null; providers: ProviderEvent[] };
const current = new AsyncLocalStorage<{ file: string; id: string }>();
const rowOperation = (r: any): ManagedOperation => ({ ...r, request: JSON.parse(r.request), failure: r.failure ? JSON.parse(r.failure) : null, providers: JSON.parse(r.providers) });

export class ManagementStore {
  db: DatabaseSync;
  constructor(public file = managementFile()) {
    mkdirSync(dirname(file), { recursive: true }); this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY,user TEXT NOT NULL,lesson TEXT NOT NULL,part TEXT NOT NULL,detail TEXT NOT NULL,target TEXT NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL,issue TEXT NOT NULL,started INTEGER NOT NULL,updated INTEGER NOT NULL,finished INTEGER,request TEXT NOT NULL,failure TEXT,providers TEXT NOT NULL DEFAULT '[]');
      CREATE INDEX IF NOT EXISTS operation_lookup ON operations(user,lesson,part,started);
      CREATE TABLE IF NOT EXISTS management_audit (id TEXT PRIMARY KEY,actor TEXT NOT NULL,user TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS support_notes (user TEXT PRIMARY KEY,note TEXT NOT NULL,updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS retry_grants (issue TEXT PRIMARY KEY,user TEXT NOT NULL,target TEXT NOT NULL,part TEXT NOT NULL,used_by TEXT);
      CREATE TABLE IF NOT EXISTS management_settings (id INTEGER PRIMARY KEY,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS alert_outbox (id TEXT PRIMARY KEY,body TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next INTEGER NOT NULL,lease INTEGER NOT NULL DEFAULT 0,error TEXT);
      INSERT OR IGNORE INTO management_settings VALUES(1,'{"emailEnabled":true,"dailySummary":false}');`);
  }
  close() { this.db.close(); }
  begin(input: OperationInput, id: string = randomUUID()) {
    const at = Date.now();
    this.db.prepare('INSERT OR IGNORE INTO operations(id,user,lesson,part,detail,target,source,status,issue,started,updated,request) VALUES(?,?,?,?,?,?,?,\'generating\',\'none\',?,?,?)')
      .run(id, input.user, managementKey(input.request), input.part, (input.detail ?? '').slice(0, 4000), input.target ?? '', input.source ?? 'server', at, at, JSON.stringify(input.request));
    return id;
  }
  get(id: string) { const row = this.db.prepare('SELECT * FROM operations WHERE id=?').get(id); return row ? rowOperation(row) : undefined; }
  provider(id: string, value: ProviderEvent) {
    const row = this.get(id); if (!row) return;
    this.db.prepare('UPDATE operations SET providers=?,updated=? WHERE id=?').run(JSON.stringify([...row.providers.slice(-39), value]), Date.now(), id);
  }
  finish(id: string, error?: unknown) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.get(id);
      // A terminal report is immutable. A real server response may still arrive
      // after monitoring conservatively marked an old request interrupted.
      if (!row || !['generating','interrupted'].includes(row.status)) { this.db.exec('COMMIT'); return; }
      const at = Date.now();
      if (error !== undefined) {
        const failure = explainFailure(error, row.providers.at(-1)?.status);
        this.db.prepare("UPDATE operations SET status='failed',issue=?,failure=?,finished=?,updated=? WHERE id=?")
          .run(row.issue === 'resolved' ? 'resolved' : 'open', JSON.stringify(failure), at, at, id);
      } else {
        // Browser reports cannot vouch for server completion. Only an earlier
        // failure of this same item and source can be recovered by this result.
        const earlier = "user=? AND lesson=? AND part=? AND detail=? AND target=? AND source=? AND started<=? AND rowid<(SELECT rowid FROM operations WHERE id=?) AND issue='open' AND status IN ('failed','interrupted')";
        const args = [row.user,row.lesson,row.part,row.detail,row.target,row.source,row.started,id];
        const prior = this.db.prepare(`SELECT count(*) AS n FROM operations WHERE ${earlier}`).get(...args) as any;
        const recovered = row.status === 'interrupted' || prior.n > 0 || row.providers.some(p => (p.status ?? 0) >= 400 || p.detail);
        this.db.prepare('UPDATE operations SET status=?,issue=?,finished=?,updated=? WHERE id=?').run(recovered ? 'recovered' : 'completed', recovered ? 'recovered' : 'none', at, at, id);
        this.db.prepare(`UPDATE operations SET issue='recovered' WHERE ${earlier}`).run(...args);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  interruptStale(now = Date.now()) {
    const failure = explainFailure('No completion was recorded before the request stopped reporting progress. The cause is unknown.');
    this.db.prepare("UPDATE operations SET status='interrupted',issue='open',failure=?,finished=?,updated=? WHERE status='generating' AND updated<?")
      .run(JSON.stringify(failure), now, now, now - 20 * 60_000);
  }
  list(limit = 1000) { this.interruptStale(); return (this.db.prepare('SELECT * FROM operations ORDER BY started DESC LIMIT ?').all(limit) as any[]).map(rowOperation); }
  audit(actor: string, user: string, action: string, detail: string, id: string = randomUUID()) {
    this.db.prepare('INSERT OR IGNORE INTO management_audit VALUES(?,?,?,?,?,?)').run(id, actor, user, action, detail.slice(0, 1200), Date.now());
  }
  notes() { return this.db.prepare('SELECT * FROM support_notes').all() as {user:string;note:string;updated:number}[]; }
  saveNote(actor: string, user: string, note: string) {
    this.db.prepare('INSERT INTO support_notes VALUES(?,?,?) ON CONFLICT(user) DO UPDATE SET note=excluded.note,updated=excluded.updated').run(user, note.slice(0, 3000), Date.now());
    this.audit(actor,user,'support_note','Updated private support note.');
  }
  history() { return this.db.prepare('SELECT * FROM management_audit ORDER BY created DESC LIMIT 300').all() as {id:string;actor:string;user:string;action:string;detail:string;created:number}[]; }
  resolve(actor: string, id: string) {
    const row = this.get(id); if (!row || row.issue !== 'open') return;
    const changed=this.db.prepare("UPDATE operations SET issue='resolved' WHERE id=? AND issue='open'").run(id); if(changed.changes)this.audit(actor,row.user,'resolve',id);
  }
  grant(actor: string, id: string) {
    const row = this.get(id);
    if (!row || row.source !== 'server' || !['failed','interrupted'].includes(row.status) || !row.target || !['reading','listening','recording'].includes(row.part)) throw Error('This issue does not support an extra generation attempt.');
    const newer = this.db.prepare("SELECT id FROM operations WHERE user=? AND lesson=? AND part=? AND rowid>(SELECT rowid FROM operations WHERE id=?) AND status IN ('generating','completed','recovered')").get(row.user,row.lesson,row.part,row.id);
    if (newer || row.issue !== 'open') throw Error('This work has already resumed or recovered. Refresh the dashboard.');
    const saved = this.db.prepare('INSERT OR IGNORE INTO retry_grants VALUES(?,?,?,?,NULL)').run(row.id,row.user,row.target,row.part);
    if(saved.changes) this.audit(actor,row.user,'allow_retry',`${row.part}: ${row.id}`);
  }
  consumeGrant(user: string, part: string, target: string, operation: string) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db.prepare('SELECT issue FROM retry_grants WHERE user=? AND part=? AND target=? AND used_by=?').get(user,part,target,operation);
      if(existing) {this.db.exec('COMMIT');return true;}
      const row = this.db.prepare('SELECT issue FROM retry_grants WHERE user=? AND part=? AND target=? AND used_by IS NULL LIMIT 1').get(user,part,target) as any;
      if(row)this.db.prepare('UPDATE retry_grants SET used_by=? WHERE issue=?').run(operation,row.issue);
      this.db.exec('COMMIT');return !!row;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  settings(): {emailEnabled:boolean;dailySummary:boolean} { return JSON.parse((this.db.prepare('SELECT body FROM management_settings WHERE id=1').get() as any).body); }
  saveSettings(actor: string, settings: {emailEnabled:boolean;dailySummary:boolean}) {
    this.db.prepare('UPDATE management_settings SET body=? WHERE id=1').run(JSON.stringify(settings)); this.audit(actor,'','notification_settings',JSON.stringify(settings));
  }
}

function safely<T>(work: (store: ManagementStore) => T, fallback: T, file?: string): T {
  let store: ManagementStore | undefined;
  try { store = new ManagementStore(file); return work(store); }
  catch { console.error('Management monitoring could not write an event.'); return fallback; }
  finally { store?.close(); }
}
export async function observeGeneration<T>(input: OperationInput, run: () => Promise<T>): Promise<T> {
  const file = managementFile(), id = safely(s => s.begin(input), '', file);
  const work = async () => {
    try {
      const value = await run();
      const failed = value && typeof value === 'object' && 'status' in value && value.status === 'failed';
      safely(s => s.finish(id, failed ? (value as any).error : undefined), undefined, file);
      return value;
    } catch (error) { safely(s => s.finish(id, error), undefined, file); throw error; }
  };
  return id ? current.run({file,id}, work) : run();
}
export function recordProvider(model: string, kind: string, status: number | undefined, ms: number, error?: unknown) {
  const c = current.getStore(); if (!c) return;
  safely(s => s.provider(c.id, {model,kind,status,ms,...(error ? {detail:safeDiagnostic(error)} : {}),at:Date.now()}), undefined, c.file);
}
export function consumeManagementRetry(user: string, part: string, target: string, operation: string) {
  return safely(s => s.consumeGrant(user,part,target,operation), false);
}
