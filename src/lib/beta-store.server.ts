import { withBetaBudget } from './beta-budget.server.ts';
import { observeGeneration } from './management-store.server.ts';
import {alternateWorksheetIssue} from './worksheet-versions.ts';
import { lessonImagePrompts } from './image-plan.ts';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const phases = ['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation'];
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const stable = (value: any): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
type Job = { attempts: number; retryCredits?: number; lease?: string; until?: number; value?: any };
type Run = { request: any; parts: Record<string, Job>; images: Record<string, Job>; complete: boolean; alternateRepair?: Job; credited?: boolean; recording?: Job & { fingerprint?: string; choice?: string } };
type Teacher = { runs: Record<string, Run>; email?: string; name?:string; joinedAt?: string; lastSeenAt?: string; revokedAt?: string };
type Invite = { digest: string; user?: string; code?: string; label?: string; claimedAt?: string; deactivatedAt?: string };
type State = { managementActions?:Record<string,boolean>; invites: Invite[]; teachers: Record<string, Teacher>; usedEmails?:Record<string,string>; allowanceResets?:Record<string,boolean>; inviteCreations?: Record<string,number>; accessHistory?: { action: string; actor: string; user?: string; seat: number; at: string }[] };
const revision = (invite: Invite) => hash('beta-seat:' + invite.digest + (invite.deactivatedAt??''));
const allowanceRevision = (teacher: Teacher|undefined) => hash(stable(Object.entries(teacher?.runs??{}).map(([key,run])=>[key,!!run.credited,run.complete])));
const emailKey = (email:string) => hash(email.trim().toLowerCase());
function rememberEmails(state:State) {
  const emails=state.usedEmails??={};
  for(const [id,teacher] of Object.entries(state.teachers))if(teacher.email)emails[emailKey(teacher.email)]??=id;
  return emails;
}

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
      s.invites = codes.map(code => ({digest:hash(code),code}));
      return codes;
    });
  }
  claim(user: string, code: string, email?: string, name?:string) {
    return this.transact(s => {
      if (!user) throw new Error('Sign in to claim your invitation.');
      const emails=rememberEmails(s);
      if(email && emails[emailKey(email)] && emails[emailKey(email)]!==user) throw new Error('This email has already been used for the teacher beta. Contact the organizer to reset the original account allowance.');
      if (s.teachers[user]?.revokedAt) throw new Error('Your beta access was removed. Contact the organizer.');
      const invite = s.invites.find(i => i.digest === hash(code));
      if (!invite || invite.deactivatedAt || (invite.user && invite.user !== user)) throw new Error('This invitation is invalid, deactivated, or already claimed.');
      if (s.teachers[user] && invite.user !== user) throw new Error('Your account already has beta access.');
      invite.user = user;
      invite.claimedAt ??= new Date().toISOString();
      delete invite.code;
      s.teachers[user] ??= {runs:{}};
      s.teachers[user].joinedAt ??= invite.claimedAt;
      if (email) s.teachers[user].email = email;
      rememberEmails(s);
      if (name!==undefined) s.teachers[user].name=name.trim().slice(0,80);
    });
  }
  teacher(s: State, user: string): Teacher {
    const t = s.teachers[user];
    if (!user || !t || t.revokedAt || !s.invites.some(i=>i.user===user&&!i.deactivatedAt)) throw new Error('Your beta access is inactive. Claim an invitation or contact the organizer.');
    return t;
  }
  /** A previously authorized request may finish after removal; retain its paid result. */
  private retainedTeacher(s: State, user: string): Teacher {
    const t = s.teachers[user];
    if (!t) throw new Error('The saved teacher record is unavailable.');
    return t;
  }
  status(user: string, email?: string, name?:string) {
    return this.transact(s => {
      const t = s.teachers[user];
      if (!t || t.revokedAt || !s.invites.some(i=>i.user===user&&!i.deactivatedAt)) return {claimed:false, revoked:!!t?.revokedAt, remaining:0, completed:0, lessons:[] as any[]};
      rememberEmails(s);
      if (email) t.email = email;
      if (name!==undefined) t.name=name.trim().slice(0,80);
      t.lastSeenAt = new Date().toISOString();
      const runs = Object.values(t.runs);
      const counted = runs.filter(r=>!r.credited);
      rememberEmails(s);
      return {claimed:true, remaining:Math.max(0,3-counted.length), completed:counted.filter(r=>r.complete).length,
        lessons:runs.map(r=>({request:r.request, complete:r.complete}))};
    });
  }
  /** Called only through the server's verified owner boundary. No lesson content is exposed. */
  administration() {
    return this.transact(s => ({
      seats:s.invites.map((invite,index)=>{
        const t=invite.user?s.teachers[invite.user]:undefined;
        const runs=Object.values(t?.runs??{}), counted=runs.filter(r=>!r.credited);
        return {seat:index+1,revision:revision(invite),active:!invite.deactivatedAt,label:invite.label??'',user:invite.user??null,email:t?.email??null,name:t?.name||null,
          claimedAt:invite.claimedAt??t?.joinedAt??null,lastSeenAt:t?.lastSeenAt??null,
          remaining:invite.user?Math.max(0,3-counted.length):3,completed:counted.filter(r=>r.complete).length,
          allowanceRevision:allowanceRevision(t),pending:runs.filter(r=>!r.complete&&!r.credited).length,
          code:invite.user||invite.deactivatedAt?null:invite.code??null};
      }),
      removed:Object.entries(s.teachers).filter(([,t])=>t.revokedAt).map(([user,t])=>({user,email:t.email??null,name:t.name||null,revokedAt:t.revokedAt!,savedLessons:Object.keys(t.runs).length})),
    }));
  }
  createInvitation(actor:string,operation:string) {
    if (!actor) throw new Error('Owner sign-in is required.');
    return this.transact(s=>{
      const key=hash(actor+':'+operation);
      if(s.inviteCreations?.[key]) return;
      const code=randomBytes(24).toString('base64url');
      s.invites.push({digest:hash(code),code});
      (s.inviteCreations??={})[key]=s.invites.length;
      (s.accessHistory??=[]).push({action:'create',actor,seat:s.invites.length,at:new Date().toISOString()});
    });
  }
  manageSeat(actor: string, data: {seat:number; revision:string; user:string|null; action:'replace'|'label'|'deactivate'; label?:string}) {
    if (!actor) throw new Error('Owner sign-in is required.');
    return this.transact(s=>{
      const invite=s.invites[data.seat-1];
      if (!invite || revision(invite)!==data.revision || (invite.user??null)!==data.user)
        throw new Error('This invitation changed. Refresh the teacher list before trying again.');
      if (data.action==='label') { invite.label=(data.label??'').trim().slice(0,100); return; }
      if (data.action==='deactivate' && invite.deactivatedAt) throw new Error('This key is already deactivated.');
      if (invite.user===actor) throw new Error('The owner account cannot be removed.');
      const at=new Date().toISOString();
      if (invite.user) {
        const teacher=s.teachers[invite.user];
        if (!teacher) throw new Error('The teacher record is missing. No access was changed.');
        teacher.revokedAt=at;
      }
      (s.accessHistory??=[]).push({action:data.action==='deactivate'?'deactivate':invite.user?'remove':'replace-unused',actor,seat:data.seat,at,...(invite.user?{user:invite.user}:{})});
      if (data.action==='deactivate') {
        invite.deactivatedAt=at;delete invite.user;delete invite.code;delete invite.claimedAt;
        return;
      }
      const code=randomBytes(24).toString('base64url');
      s.invites[data.seat-1]={digest:hash(code),code};
    });
  }
  resetAllowance(user: string) {
    return this.transact(s=>{
      const t=this.teacher(s,user);
      if(Object.values(t.runs).some(r=>!r.complete&&!r.credited))throw new Error('Finish any pending lessons before resetting the allowance.');
      for(const run of Object.values(t.runs))run.credited=true;
    });
  }
  /** Owner endpoint supplies a verified actor, a displayed allowance revision and retry token. */
  resetTeacherAllowance(actor:string, data:{seat:number;revision:string;user:string;allowanceRevision:string;operation:string}) {
    if(!actor)throw new Error('Owner sign-in is required.');
    return this.transact(s=>{
      const operation=hash(actor+':'+data.operation);
      if(s.allowanceResets?.[operation])return;
      const invite=s.invites[data.seat-1];
      if(!invite || invite.deactivatedAt || invite.user!==data.user || revision(invite)!==data.revision)throw new Error('This invitation changed. Refresh teachers before resetting.');
      if(invite.user===actor)throw new Error('The owner does not need a lesson allowance reset.');
      const teacher=this.teacher(s,data.user);
      if(allowanceRevision(teacher)!==data.allowanceRevision)throw new Error('This allowance changed. Refresh teachers before resetting.');
      if(Object.values(teacher.runs).some(run=>!run.complete&&!run.credited))throw new Error('Finish any pending lessons before resetting the allowance.');
      for(const run of Object.values(teacher.runs))run.credited=true;
      (s.allowanceResets??={})[operation]=true;
      (s.accessHistory??=[]).push({action:'reset-allowance',actor,user:data.user,seat:data.seat,at:new Date().toISOString()});
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
      if (job.attempts >= 3 && !(job.retryCredits ?? 0)) throw new Error('This part reached the beta retry limit. Contact the beta organizer; your progress is saved.');
      if (job.attempts >= 3) job.retryCredits!--;
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
    return observeGeneration({user,request,part:stage}, async () => {
    try {
      const value = await withBetaBudget(user, () => generate(reservation.prior));
      this.transact(s => {
        const run = this.retainedTeacher(s,user).runs[key]!;
        const job = run.parts[stage]!;
        if(job.lease!==reservation.lease) throw new Error('This request expired. Resume the lesson.');
        job.value=value; delete job.until; delete job.lease;
        if(stage==='differentiation') run.complete=true;
      });
      return value;
    } catch(e) {
      this.transact(s => {const job=this.retainedTeacher(s,user).runs[key]!.parts[stage]!;if(job.lease===reservation.lease){delete job.until;delete job.lease;}});
      throw e;
    }
    });
  }
  /** Read-only recovery after a dropped response: never reserve a slot or buy an image. */
  imageProgress(user: string, request: any, prompt: string) {
    const state = JSON.parse((this.db.prepare('SELECT body FROM beta_state WHERE id=1').get() as any).body) as State;
    const run = this.teacher(state, user).runs[hash(stable(request))];
    if (!run?.complete) throw new Error('Complete your own lesson before loading illustrations.');
    const job = run.images[hash(prompt)];
    return { dataUrl: job?.value as string | undefined, pending: !job?.value && (job?.until ?? 0) > Date.now() };
  }
  async image(user: string, request: any, prompt: string, generate: () => Promise<string>) {
    const key=hash(stable(request)), imageKey=hash(prompt);
    const reservation=this.transact(s=>{
      const run=this.teacher(s,user).runs[key];
      if(!run?.complete) throw new Error('Complete your own lesson before creating illustrations.');
      // Previously paid pictures remain usable when prompt prioritisation changes.
      if (run.images[imageKey]?.value !== undefined) return {cached:run.images[imageKey]!.value as string};
      const prompts=lessonImagePrompts(Object.assign({}, ...phases.map(stage => run.parts[stage]?.value)), request);
      if(!prompts.includes(prompt)) throw new Error('The beta includes only the six selected illustrations from this lesson.');
      if (!run.images[imageKey] && Object.keys(run.images).length >= 6) throw new Error('This lesson already used its six illustration slots. Reuse the existing pictures.');
      const job=run.images[imageKey] ??= {attempts:0};
      if(job.value!==undefined) return {cached:job.value as string};
      if((job.until??0)>Date.now()) throw new Error('This illustration is already running. Please wait.');
      if(job.attempts>=2 && !(job.retryCredits ?? 0)) throw new Error('This illustration reached the beta retry limit. Export without images or contact the organizer.');
      if(job.attempts>=2)job.retryCredits!--;
      job.attempts++;job.lease=randomUUID();job.until=Date.now()+5*60_000;
      return {lease:job.lease};
    });
    if('cached' in reservation) return reservation.cached!;
    return observeGeneration({user,request,part:'illustration',detail:prompt,target:imageKey}, async () => {
    try {
      const value=await withBetaBudget(user, generate);
      this.transact(s=>{const job=this.retainedTeacher(s,user).runs[key]!.images[imageKey]!;if(job.lease!==reservation.lease)throw new Error('Image request expired.');job.value=value;delete job.until;delete job.lease;});
      return value;
    }catch(e){this.transact(s=>{const job=this.retainedTeacher(s,user).runs[key]!.images[imageKey]!;if(job.lease===reservation.lease){delete job.until;delete job.lease;}});throw e;}
    });
  }
  /** Repair an existing duplicate B without consuming a fourth lesson or reopening other AI work. */
  async repairAlternate(user:string, request:any, generate:(lesson:any)=>Promise<any>) {
    const key=hash(stable(request));
    const lesson=this.readingLesson(user,request);
    if(!alternateWorksheetIssue(lesson.worksheet?.student,lesson.worksheet?.studentB))return {worksheet:lesson.worksheet};
    const lease=this.transact(s=>{
      const run=this.teacher(s,user).runs[key]!;
      const job=run.alternateRepair??={attempts:0};
      if((job.until??0)>Date.now())throw new Error('Version B repair is already running.');
      if(job.attempts>=2 && !(job.retryCredits??0))throw new Error('Version B repair needs organizer assistance after two unsuccessful attempts. Your lesson is retained.');
      if(job.attempts>=2)job.retryCredits!--;
      job.attempts++;job.lease=randomUUID();job.until=Date.now()+10*60_000;
      return job.lease;
    });
    return observeGeneration({user,request,part:'alternate'}, async () => {
    try {
      const patch=await withBetaBudget(user, () => generate(lesson));
      if(!patch?.worksheet?.studentB || alternateWorksheetIssue(lesson.worksheet.student,patch.worksheet.studentB))throw new Error('Version B repair did not produce a distinct worksheet.');
      this.transact(s=>{
        const run=this.retainedTeacher(s,user).runs[key]!;
        if(run.alternateRepair?.lease!==lease)throw new Error('Version B repair expired.');
        run.parts['studentB']!.value={worksheet:{studentB:patch.worksheet.studentB}};
        run.parts['teacherB']!.value={worksheet:{teacherB:patch.worksheet.teacherB}};
        if(run.parts['differentiation']?.value?.worksheet) Object.assign(run.parts['differentiation']!.value.worksheet,{studentB:patch.worksheet.studentB,teacherB:patch.worksheet.teacherB});
        delete run.alternateRepair.until;delete run.alternateRepair.lease;
      });
      return {worksheet:{...lesson.worksheet,studentB:patch.worksheet.studentB,teacherB:patch.worksheet.teacherB}};
    }catch(e){this.transact(s=>{const job=this.retainedTeacher(s,user).runs[key]!.alternateRepair!;if(job.lease===lease){delete job.until;delete job.lease;}});throw e;}
    });
  }
  /** One recording per owned lesson, shared by every voice and script fingerprint. */
  async recording(user: string, request: any, fingerprint: string, choice: string, load: (id: string) => any, generate: (choice: string) => Promise<any>) {
    const lesson = this.readingLesson(user, request);
    const key = hash(stable(request));
    if (lesson.listening?.status !== 'ready' || lesson.listening.fingerprint !== fingerprint)
      throw new Error('Generate the listening activity for this lesson first.');
    const reservation = this.transact(s => {
      const run = this.teacher(s, user).runs[key]!;
      const job = run.recording ??= { attempts: 0 };
      if (job.value) {
        if (job.fingerprint !== fingerprint) throw new Error('This beta lesson already has its recording. Contact the organizer if the script needs replacing.');
        return { cached: job.value };
      }
      // Adopt existing paid recordings without buying a replacement on migration.
      if (lesson.listening.audio?.id) {
        job.value = { audio: lesson.listening.audio }; job.fingerprint = fingerprint;
        return { cached: job.value };
      }
      if ((job.until ?? 0) > Date.now()) throw new Error('This lesson recording is already running. Wait, then load the saved recording.');
      if (job.fingerprint && job.fingerprint !== fingerprint) throw new Error('This beta lesson already reserved its recording for a saved script. Contact the organizer to replace it.');
      if (job.attempts >= 3 && !(job.retryCredits ?? 0)) throw new Error('This recording reached the beta retry limit. Your script is saved; contact the organizer.');
      if (job.attempts >= 3) job.retryCredits!--;
      job.attempts++; job.lease = randomUUID(); job.until = Date.now() + 10 * 60_000;
      job.fingerprint = fingerprint; job.choice ??= choice;
      return { lease: job.lease, choice: job.choice };
    });
    if ('cached' in reservation) {
      const value = await load(reservation.cached.audio.id);
      this.retainReading(user, request, saved => ({ ...saved, listening: { ...saved.listening, audio: value.audio } }));
      return value;
    }
    return observeGeneration({user,request,part:'recording',detail:reservation.choice,target:fingerprint}, async () => {
    try {
      const value = await withBetaBudget(user, () => generate(reservation.choice));
      this.transact(s => {
        const job = this.retainedTeacher(s, user).runs[key]!.recording!;
        if (job.lease !== reservation.lease) throw new Error('This recording request expired. Reopen the lesson.');
        job.value = { audio: value.audio }; delete job.lease; delete job.until;
      });
      this.retainReading(user, request, saved => ({ ...saved, listening: { ...saved.listening, audio: value.audio } }));
      return value;
    } catch (error) {
      this.transact(s => {
        const job = this.retainedTeacher(s, user).runs[key]!.recording!;
        if (job.lease === reservation.lease) { delete job.lease; delete job.until; }
      });
      throw error;
    }
    });
  }
  /** Metadata only: never return private invitation tokens or generated lesson contents. */
  managementProgress() {
    const s = JSON.parse((this.db.prepare('SELECT body FROM beta_state WHERE id=1').get() as any).body) as State;
    return {
      teachers:Object.entries(s.teachers).map(([user,t]) => ({user,name:t.name??'',email:t.email??'',revoked:!!t.revokedAt})),
      lessons:Object.entries(s.teachers).flatMap(([user,t]) => Object.entries(t.runs).map(([key,r]) => ({user,key,request:r.request,complete:r.complete,credited:!!r.credited,
        steps:phases.map(part=>({part,complete:r.parts[part]?.value!==undefined,attempts:r.parts[part]?.attempts??0,running:(r.parts[part]?.until??0)>Date.now()}))}))),
      history:s.accessHistory??[],
    };
  }
  /** Read-only recovery for the authenticated owner of these runs, including revoked accounts. */
  draftProgress(user:string) {
    if(!user)throw Error('Sign in to open your unfinished lessons.');
    const s=JSON.parse((this.db.prepare('SELECT body FROM beta_state WHERE id=1').get() as any).body) as State;
    return Object.values(s.teachers[user]?.runs??{}).map(run=>({
      request:run.request,
      complete:run.complete,
      parts:Object.fromEntries(phases.filter(part=>run.parts[part]?.value!==undefined).map(part=>[part,run.parts[part]!.value])),
      activeUntil:Math.max(0,...Object.values(run.parts).map(job=>job.value===undefined?(job.until??0):0))||null,
    }));
  }
  managementRecovery(actor:string, input:{operation:string;user:string;lesson:string;action:'allow_retry'|'restore_slot';part:string;target:string}) {
    return this.transact(s=>{
      if (!actor) throw Error('Owner sign-in is required.');
      const actions=s.managementActions??={}; if(actions[input.operation])return;
      const run=this.teacher(s,input.user).runs[input.lesson]; if(!run)throw Error('This lesson no longer exists.');
      const all=[...Object.values(run.parts),...Object.values(run.images),run.recording,run.alternateRepair].filter(Boolean) as Job[];
      if(all.some(j=>(j.until??0)>Date.now()))throw Error('This lesson still has generation in progress. Wait before changing its allowance.');
      if(input.action==='restore_slot') {
        if(run.complete)throw Error('A completed lesson does not qualify for a failed-lesson slot return.');
        run.credited=true;
      }else{
        const job=input.part==='illustration'?run.images[input.target]:input.part==='recording'?run.recording:input.part==='alternate'?run.alternateRepair:run.parts[input.part];
        if(!job||job.value!==undefined)throw Error('This part has already completed or has no failed attempt to recover.');
        job.retryCredits=Math.max(job.retryCredits??0,1);
      }
      actions[input.operation]=true;
      (s.accessHistory??=[]).push({action:input.action,actor,user:input.user,seat:s.invites.findIndex(i=>i.user===input.user)+1,at:new Date().toISOString()});
    });
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
      Object.assign(run.parts['differentiation']!.value, { reading: next.reading, listening: next.listening, worksheet: next.worksheet, answerKey: next.answerKey });
    });
  }
}

export const betaEnabled = () => process.env['TEACHERFLOW_BETA'] === 'true';
let store: BetaStore | undefined;
export function betaStore() { return store ??= new BetaStore(process.env['TEACHERFLOW_BETA_DB'] || '.local-runtime/beta.sqlite'); }
