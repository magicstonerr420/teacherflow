import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { generationErrorMessage } from './generation-errors.ts';
import type { LessonDraft, LessonDraftSummary } from './lesson-drafts.ts';
import type { LessonRequestInput, LessonPackage } from './lesson-schema.ts';
import type { GenerationStage } from './generation-plan.ts';

const stages: GenerationStage[] = ['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation'];
const stable = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const requestKey = (request: unknown) => createHash('sha256').update(stable(request)).digest('hex');
type Parts = Partial<Record<GenerationStage, Partial<LessonPackage>>>;
type Row = { id:string;user_id:string;request_key:string;request:string;parts:string;error:string|null;lease:string|null;active_until:number|null;updated_at:number;lesson_id:string;saved:number };
export type RetainedLessonProgress = {request:LessonRequestInput;parts:Parts;activeUntil:number|null};
function assembled(parts:Parts):Partial<LessonPackage> {
  let result:Partial<LessonPackage>={};
  for(const stage of stages){const patch=parts[stage];if(!patch)break;result={...result,...patch,...(patch.worksheet?{worksheet:{...result.worksheet,...patch.worksheet}}:{})};}
  return result;
}

/** Durable checkpoints share the persistent beta database and its existing backups. */
export class LessonDraftStore {
  db:DatabaseSync;
  private now:()=>number;
  constructor(file:string, now:()=>number=Date.now) {
    this.now=now;
    mkdirSync(dirname(file),{recursive:true});this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS tf_lesson_drafts (
        id TEXT PRIMARY KEY,user_id TEXT NOT NULL,request_key TEXT NOT NULL,request TEXT NOT NULL,
        parts TEXT NOT NULL DEFAULT '{}',error TEXT,lease TEXT,active_until INTEGER,updated_at INTEGER NOT NULL,
        lesson_id TEXT NOT NULL,saved INTEGER NOT NULL DEFAULT 0,UNIQUE(user_id,request_key));
      CREATE INDEX IF NOT EXISTS tf_drafts_owner ON tf_lesson_drafts(user_id,saved,updated_at);`);
  }
  private transaction<T>(run:()=>T):T {
    this.db.exec('BEGIN IMMEDIATE');try{const result=run();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  private user(user:string){if(!user)throw Error('Sign in to open your unfinished lessons.');}
  private row(user:string,id:string):Row {
    this.user(user);
    const row=this.db.prepare('SELECT * FROM tf_lesson_drafts WHERE id=? AND user_id=?').get(id,user) as Row|undefined;
    if(!row)throw Error('This unfinished lesson could not be found in your account.');
    return row;
  }
  private snapshot(row:Row):LessonDraft {
    const parts=JSON.parse(row.parts) as Parts;
    const completedStages:GenerationStage[]=[];
    for(const stage of stages){if(parts[stage]===undefined)break;completedStages.push(stage);}
    const nextStage=stages[completedStages.length]??null;
    const activeUntil=row.active_until && row.active_until>this.now()?row.active_until:null;
    return {id:row.id,request:JSON.parse(row.request),content:assembled(parts),completedStages,nextStage,
      status:row.saved?'saved':nextStage===null?'complete':activeUntil?'generating':row.error?'failed':'ready',
      error:row.error,updatedAt:row.updated_at,savedLessonId:row.saved?row.lesson_id:null,activeUntil};
  }
  ensure(user:string,request:LessonRequestInput):LessonDraft {
    this.user(user);const body=JSON.stringify(request);
    if(body.length>50000)throw Error('These lesson settings are too long. Shorten the notes before generating.');
    const key=requestKey(request);
    this.db.prepare('INSERT OR IGNORE INTO tf_lesson_drafts(id,user_id,request_key,request,updated_at,lesson_id) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(),user,key,body,this.now(),randomUUID());
    const row=this.db.prepare('SELECT * FROM tf_lesson_drafts WHERE user_id=? AND request_key=?').get(user,key) as Row;
    return this.snapshot(row);
  }
  /** Resume a legacy identity before applying newly introduced schema defaults. */
  ensureRequest(user:string,originalRequest:unknown,validatedRequest:LessonRequestInput,retained:RetainedLessonProgress[]=[]):LessonDraft {
    this.user(user);
    const key=requestKey(originalRequest);
    const progress=retained.find(item=>requestKey(item.request)===key);
    if(progress)return this.retain(user,progress);
    const row=this.db.prepare('SELECT * FROM tf_lesson_drafts WHERE user_id=? AND request_key=?').get(user,key) as Row|undefined;
    return row?this.snapshot(row):this.ensure(user,validatedRequest);
  }
  get(user:string,id:string):LessonDraft {return this.snapshot(this.row(user,id));}
  hasRequest(user:string,request:LessonRequestInput):boolean {
    this.user(user);return !!this.db.prepare('SELECT 1 FROM tf_lesson_drafts WHERE user_id=? AND request_key=?').get(user,requestKey(request));
  }
  list(user:string):LessonDraftSummary[] {
    this.user(user);
    return (this.db.prepare('SELECT * FROM tf_lesson_drafts WHERE user_id=? AND saved=0 ORDER BY updated_at DESC,id').all(user) as Row[])
      .map(row=>{const {content,...summary}=this.snapshot(row);return summary;});
  }
  /** Imports actual server checkpoints, including legacy beta work and lost responses. No quota changes. */
  retain(user:string,progress:RetainedLessonProgress):LessonDraft {
    const draft=this.ensure(user,progress.request);
    this.transaction(()=>{
      const row=this.row(user,draft.id);if(row.saved)return;
      const parts=JSON.parse(row.parts) as Parts;
      let changed=false;
      for(const stage of stages){
        const value=progress.parts[stage];if(value===undefined)break;
        // The beta cache also contains subsequent repaired reading/listening results.
        if(stable(parts[stage])!==stable(value)){parts[stage]=value;changed=true;}
      }
      const count=stages.filter(stage=>parts[stage]!==undefined).length;
      const complete=count===stages.length;
      const activeUntil=complete?null:Math.max(progress.activeUntil??0,row.lease?(row.active_until??0):0)||null;
      if(changed||activeUntil!==row.active_until)this.db.prepare('UPDATE tf_lesson_drafts SET parts=?,error=?,active_until=?,updated_at=? WHERE id=? AND user_id=?')
        .run(JSON.stringify(parts),changed?null:row.error,activeUntil,changed?this.now():row.updated_at,row.id,user);
    });
    return this.get(user,draft.id);
  }
  /** Claim once, generate outside transactions, and persist before replying to the browser. */
  async stage(user:string,id:string,stage:GenerationStage,generate:(request:LessonRequestInput,prior:Partial<LessonPackage>)=>Promise<Partial<LessonPackage>>):Promise<Partial<LessonPackage>> {
    if(!stages.includes(stage))throw Error('Unknown lesson part.');
    const reserved=this.transaction(()=>{
      const row=this.row(user,id);const parts=JSON.parse(row.parts) as Parts;
      if(parts[stage]!==undefined)return {cached:parts[stage]};
      const snapshot=this.snapshot(row);
      if(snapshot.nextStage!==stage)throw Error('Complete the earlier saved lesson parts first.');
      if(snapshot.activeUntil)throw Error('This lesson part is already running. Your progress is saved; wait for it to finish.');
      const lease=randomUUID();
      this.db.prepare('UPDATE tf_lesson_drafts SET lease=?,active_until=?,error=NULL,updated_at=? WHERE id=? AND user_id=?')
        .run(lease,this.now()+15*60_000,this.now(),id,user);
      return {lease,request:snapshot.request,prior:snapshot.content};
    });
    if('cached' in reserved)return reserved.cached!;
    try{
      const value=await generate(reserved.request,reserved.prior);
      this.transaction(()=>{
        const row=this.row(user,id);
        if(row.lease!==reserved.lease)throw Error('This request was superseded. Reload your saved progress before continuing.');
        const parts=JSON.parse(row.parts) as Parts;parts[stage]=value;
        this.db.prepare('UPDATE tf_lesson_drafts SET parts=?,lease=NULL,active_until=NULL,error=NULL,updated_at=? WHERE id=? AND user_id=?')
          .run(JSON.stringify(parts),this.now(),id,user);
      });
      return value;
    }catch(error){
      this.db.prepare('UPDATE tf_lesson_drafts SET lease=NULL,active_until=NULL,error=?,updated_at=? WHERE id=? AND user_id=? AND lease=?')
        .run(generationErrorMessage(error,'lesson'),this.now(),id,user,reserved.lease);
      throw error;
    }
  }
  prepareSave(user:string,id:string):{id:string;request:LessonRequestInput;content:LessonPackage;saved:boolean} {
    const row=this.row(user,id);const draft=this.snapshot(row);
    if(draft.nextStage!==null)throw Error('Finish this lesson before saving it to your completed lessons.');
    return {id:row.lesson_id,request:draft.request,content:draft.content as LessonPackage,saved:!!row.saved};
  }
  markSaved(user:string,id:string,lessonId:string) {
    const prepared=this.prepareSave(user,id);
    if(prepared.id!==lessonId)throw Error('This saved lesson does not match its draft.');
    this.db.prepare('UPDATE tf_lesson_drafts SET saved=1,error=NULL,updated_at=? WHERE id=? AND user_id=?').run(this.now(),id,user);
  }
  /** Only call after verifying this existing library row belongs to the authenticated teacher. */
  linkVerifiedLesson(user:string,id:string,lessonId:string):LessonDraft {
    this.prepareSave(user,id);
    if(!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(lessonId))throw Error('The saved lesson reference is invalid.');
    this.db.prepare('UPDATE tf_lesson_drafts SET lesson_id=?,saved=1,error=NULL,updated_at=? WHERE id=? AND user_id=? AND saved=0')
      .run(lessonId,this.now(),id,user);
    return this.get(user,id);
  }
}
let singleton:LessonDraftStore|undefined;
export function lessonDraftStore(){
  const file=process.env['TEACHERFLOW_BETA_DB'];
  if(!file&&process.env['NODE_ENV']==='production')throw Error('Automatic lesson saving needs the persistent database configured.');
  return singleton??=new LessonDraftStore(file||'.local-runtime/beta.sqlite');
}
