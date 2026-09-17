import { lessonImagePrompts } from './image-plan.ts';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const phases = ['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation'];
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const stable = (value: any): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
type Job = { attempts: number; lease?: string; until?: number; value?: any };
type Run = { request: any; parts: Record<string, Job>; images: Record<string, Job>; complete: boolean; credited?: boolean };
type Teacher = { runs: Record<string, Run> };
type State = { invites: { digest: string; user?: string }[]; teachers: Record<string, Teacher> };

/** Durable, transaction-protected beta allowances. Deploy on one persistent disk. */
export class BetaStore {
  db: DatabaseSync;
  constructor(file: string) {
    mkdirSync(dirname(file), {recursive:true});
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS beta_state (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
    this.db.prepare('INSERT OR IGNORE INTO beta_state VALUES (1, ?)').run(JSON.stringify({invites:[],teachers:{}}));
  }
  transact<T>(fn: (state: State) => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = JSON.parse((this.db.prepare('SELECT body FROM beta_state WHERE id=1').get() as any).body) as State;
      const result = fn(state);
      this.db.prepare('UPDATE beta_state SET body=? WHERE id=1').run(JSON.stringify(state));
      this.db.exec('COMMIT');
      return result;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  issue(): string[] {
    return this.transact(s => {
      if (s.invites.length) throw new Error('The three invitations already exist. Refusing to create extra seats.');
      const codes = Array.from({length:3}, () => randomBytes(24).toString('base64url'));
      s.invites = codes.map(code => ({digest:hash(code)}));
      return codes;
    });
  }
  claim(user: string, code: string) {
    return this.transact(s => {
      if (!user) throw new Error('Sign in to claim your invitation.');
      const invite = s.invites.find(i => i.digest === hash(code));
      if (!invite || (invite.user && invite.user !== user)) throw new Error('This invitation is invalid or already claimed.');
      if (s.teachers[user] && invite.user !== user) throw new Error('Your account already has beta access.');
      invite.user = user;
      s.teachers[user] ??= {runs:{}};
    });
  }
  teacher(s: State, user: string): Teacher {
    const t = s.teachers[user];
    if (!user || !t) throw new Error('Claim a teacher invitation before generating lessons.');
    return t;
  }
  status(user: string) {
    return this.transact(s => {
      const t = s.teachers[user];
      if (!t) return {claimed:false, remaining:0, completed:0, lessons:[] as any[]};
      const runs = Object.values(t.runs);
      const counted = runs.filter(r=>!r.credited);
      return {claimed:true, remaining:3-counted.length, completed:counted.filter(r=>r.complete).length,
        lessons:runs.map(r=>({request:r.request, complete:r.complete}))};
    });
  }
  resetAllowance(user: string) {
    return this.transact(s=>{
      const t=this.teacher(s,user);
      if(Object.values(t.runs).some(r=>!r.complete))throw new Error('Finish any pending lessons before resetting the allowance.');
      for(const run of Object.values(t.runs))run.credited=true;
    });
  }
  async stage(user: string, request: any, stage: string, generate: (prior: any) => Promise<any>) {
    const index = phases.indexOf(stage);
    if (index < 0) throw new Error('Unknown lesson part.');
    const key = hash(stable(request));
    const reservation = this.transact(s => {
      const t = this.teacher(s,user);
      if (!t.runs[key]) {
        if (stage !== 'foundation') throw new Error('Start with the first lesson part.');
        if (Object.values(t.runs).filter(r=>!r.credited).length >= 3) throw new Error('Your three beta lesson slots are used. Reopen or resume an existing lesson.');
        t.runs[key] = {request,parts:{},images:{},complete:false};
      }
      const run = t.runs[key];
      if (phases.slice(0,index).some(p => run.parts[p]?.value === undefined)) throw new Error('Complete the earlier lesson parts first.');
      const job = run.parts[stage] ??= {attempts:0};
      if (job.value !== undefined) return {cached:job.value};
      if ((job.until ?? 0)>Date.now()) throw new Error('This lesson part is already running. Please wait before retrying.');
      if (job.attempts >= 3) throw new Error('This part reached the beta retry limit. Contact the beta organizer; your progress is saved.');
      const prior: any = {};
      for (const p of phases.slice(0,index)) {
        const patch = run.parts[p]!.value;
        const worksheet = patch.worksheet ? {...prior.worksheet,...patch.worksheet} : undefined;
        Object.assign(prior,patch);
        if (worksheet) prior.worksheet=worksheet;
      }
      job.attempts++; job.lease=randomUUID(); job.until=Date.now()+15*60_000;
      return {lease:job.lease,prior};
    });
    if ('cached' in reservation) return reservation.cached;
    try {
      const value = await generate(reservation.prior);
      this.transact(s => {
        const run = this.teacher(s,user).runs[key]!;
        const job = run.parts[stage]!;
        if(job.lease!==reservation.lease) throw new Error('This request expired. Resume the lesson.');
        job.value=value; delete job.until; delete job.lease;
        if(stage==='differentiation') run.complete=true;
      });
      return value;
    } catch(e) {
      this.transact(s => {const job=this.teacher(s,user).runs[key]!.parts[stage]!;if(job.lease===reservation.lease){delete job.until;delete job.lease;}});
      throw e;
    }
  }
  async image(user: string, request: any, prompt: string, generate: () => Promise<string>) {
    const key=hash(stable(request)), imageKey=hash(prompt);
    const reservation=this.transact(s=>{
      const run=this.teacher(s,user).runs[key];
      if(!run?.complete) throw new Error('Complete your own lesson before creating illustrations.');
      const prompts=lessonImagePrompts(run.parts['presentation']?.value, request);
      if(!prompts.includes(prompt)) throw new Error('The beta includes only the six selected illustrations from this lesson.');
      if (!run.images[imageKey] && Object.keys(run.images).length >= 6) throw new Error('This lesson already used its six illustration slots. Reuse the existing pictures.');
      const job=run.images[imageKey] ??= {attempts:0};
      if(job.value!==undefined) return {cached:job.value as string};
      if((job.until??0)>Date.now()) throw new Error('This illustration is already running. Please wait.');
      if(job.attempts>=2) throw new Error('This illustration reached the beta retry limit. Export without images or contact the organizer.');
      job.attempts++;job.lease=randomUUID();job.until=Date.now()+5*60_000;
      return {lease:job.lease};
    });
    if('cached' in reservation) return reservation.cached!;
    try {
      const value=await generate();
      this.transact(s=>{const job=this.teacher(s,user).runs[key]!.images[imageKey]!;if(job.lease!==reservation.lease)throw new Error('Image request expired.');job.value=value;delete job.until;delete job.lease;});
      return value;
    }catch(e){this.transact(s=>{const job=this.teacher(s,user).runs[key]!.images[imageKey]!;if(job.lease===reservation.lease){delete job.until;delete job.lease;}});throw e;}
  }
  readingLesson(user: string, request: any) {
    return this.transact(s => {
      const run = this.teacher(s, user).runs[hash(stable(request))];
      if (!run?.complete) throw new Error('Complete your own lesson before regenerating its reading.');
      let lesson: any = {};
      for (const stage of phases) {
        const patch = run.parts[stage]!.value;
        const worksheet = patch.worksheet ? { ...lesson.worksheet, ...patch.worksheet } : lesson.worksheet;
        lesson = { ...lesson, ...patch, worksheet };
      }
      return lesson;
    });
  }
  retainReading(user: string, request: any, apply: (lesson: any) => any) {
    this.transact(s => {
      const run = this.teacher(s, user).runs[hash(stable(request))];
      if (!run?.complete) throw new Error('Complete your own lesson first.');
      let lesson: any = {};
      for (const stage of phases) {
        const patch = run.parts[stage]!.value;
        const worksheet = patch.worksheet ? { ...lesson.worksheet, ...patch.worksheet } : lesson.worksheet;
        lesson = { ...lesson, ...patch, worksheet };
      }
      const next = apply(lesson);
      // Reopening a beta lesson must retain its newest reading without rerunning AI.
      Object.assign(run.parts['differentiation']!.value, { reading: next.reading, worksheet: next.worksheet, answerKey: next.answerKey });
    });
  }
}

export const betaEnabled = () => process.env['TEACHERFLOW_BETA'] === 'true';
let store: BetaStore | undefined;
export function betaStore() { return store ??= new BetaStore(process.env['TEACHERFLOW_BETA_DB'] || '.local-runtime/beta.sqlite'); }
