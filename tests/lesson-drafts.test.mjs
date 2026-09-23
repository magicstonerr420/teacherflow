import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LessonDraftStore } from '../src/lib/lesson-drafts-store.server.ts';
import { BetaStore } from '../src/lib/beta-store.server.ts';
import { saveCompletedDraft, linkExistingLesson } from '../src/lib/lesson-drafts-save.server.ts';

const stages=['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation'];
const request={subject:'English',topic:'The Future of Society',studentAge:'Adults',level:'C2',durationMinutes:60,mainSkill:'Mixed',secondarySkill:'Writing',learningObjective:'Synthesize multiple perspectives and predict future social change.',technologyAvailable:'Full technology (internet, devices, audio)',groupWorkEnabled:false,studentsPerGroup:null};
function fixture(clock){
  const dir=mkdtempSync(join(tmpdir(),'teacherflow-drafts-')),file=join(dir,'beta.sqlite');
  const oldMonitoring=process.env.TEACHERFLOW_MANAGEMENT_DB;
  process.env.TEACHERFLOW_MANAGEMENT_DB=join(dir,'management.sqlite');
  const store=new LessonDraftStore(file,clock);
  return {file,store,cleanup(){store.db.close();if(oldMonitoring===undefined)delete process.env.TEACHERFLOW_MANAGEMENT_DB;else process.env.TEACHERFLOW_MANAGEMENT_DB=oldMonitoring;rmSync(dir,{recursive:true,force:true});}};
}
async function complete(store,user,id){for(const stage of stages)await store.stage(user,id,stage,async()=>({[stage==='foundation'?'overview':stage]:{title:stage}}));}

test('draft setup is idempotent, account scoped, immutable and consumes no allowance',()=>{
  const f=fixture(),beta=new BetaStore(f.file);
  try{
    const [code]=beta.issue();beta.claim('a',code);
    const draft=f.store.ensure('a',request);
    assert.equal(f.store.ensure('a',{...request}).id,draft.id);
    assert.notEqual(f.store.ensure('b',request).id,draft.id);
    assert.equal(beta.status('a').remaining,3);
    assert.deepEqual(beta.status('a').lessons,[]);
    assert.throws(()=>f.store.get('b',draft.id),/could not be found/);
    assert.throws(()=>f.store.get('',draft.id),/Sign in/);
    draft.request.topic='tampered';assert.equal(f.store.get('a',draft.id).request.topic,request.topic);
    assert.equal(f.store.list('a')[0].status,'ready');assert.equal('content' in f.store.list('a')[0],false);
  }finally{beta.db.close();f.cleanup();}
});

test('checkpoint survives dropped response and reopen; failure retains only server-owned completed parts',async()=>{
  const f=fixture();let reopened;
  try{
    const {id}=f.store.ensure('a',request);let generated=0;
    await f.store.stage('a',id,'foundation',async()=>{generated++;return {overview:{topic:'server content'}};});
    reopened=new LessonDraftStore(f.file);
    assert.equal(reopened.get('a',id).content.overview.topic,'server content');
    await reopened.stage('a',id,'foundation',async()=>assert.fail('A paid part must be reused'));
    assert.equal(generated,1);
    await assert.rejects(reopened.stage('a',id,'teacher',async()=>assert.fail('Out of order')),/earlier/);
    await assert.rejects(reopened.stage('a',id,'student',async(r,prior)=>{
      assert.deepEqual(r,request);assert.deepEqual(prior,{overview:{topic:'server content'}});
      throw Error('<html><title>502</title>'+('base64:'.repeat(100))+'</html>');
    }));
    const saved=reopened.get('a',id);
    assert.equal(saved.status,'failed');assert.equal(saved.nextStage,'student');assert.deepEqual(saved.completedStages,['foundation']);
    assert.match(saved.error,/interrupted/);assert.doesNotMatch(saved.error,/html|base64/);
    await reopened.stage('a',id,'student',async()=>({worksheet:{student:{title:'retained'}}}));
    assert.equal(reopened.get('a',id).status,'ready');assert.equal(reopened.get('a',id).error,null);
  }finally{reopened?.db.close();f.cleanup();}
});

test('two SQLite handles cannot start duplicate paid work, and tab closure does not discard an in-flight result',async()=>{
  const f=fixture(),other=new LessonDraftStore(f.file);
  try{
    const {id}=f.store.ensure('a',request);let finish,calls=0;
    const pending=f.store.stage('a',id,'foundation',async()=>{calls++;await new Promise(resolve=>finish=resolve);return {overview:{topic:'completed after close'}};});
    assert.equal(other.get('a',id).status,'generating');
    await assert.rejects(other.stage('a',id,'foundation',async()=>{calls++;return {};}),/already running/);
    finish();await pending;
    assert.equal(other.get('a',id).content.overview.topic,'completed after close');assert.equal(calls,1);
  }finally{other.db.close();f.cleanup();}
});

test('expired leases permit explicit resume and stale completion cannot overwrite a newer result',async()=>{
  let now=100;const f=fixture(()=>now),other=new LessonDraftStore(f.file,()=>now);
  try{
    const {id}=f.store.ensure('a',request);let finish;
    const first=f.store.stage('a',id,'foundation',async()=>{await new Promise(resolve=>finish=resolve);return {overview:{topic:'old'}};});
    now+=15*60_000+1;
    assert.equal(other.get('a',id).status,'ready');assert.equal(other.get('a',id).activeUntil,null);
    await other.stage('a',id,'foundation',async()=>({overview:{topic:'new'}}));
    finish();await assert.rejects(first,/superseded/);
    assert.equal(other.get('a',id).content.overview.topic,'new');assert.equal(other.get('a',id).error,null);
  }finally{other.db.close();f.cleanup();}
});

test('beta resume preserves exact request fingerprint, quota and earlier checkpoints even when no slots remain',async()=>{
  const f=fixture(),beta=new BetaStore(f.file);
  try{
    const [code,second]=beta.issue();beta.claim('a',code);beta.claim('b',second);
    const oldRequest={topic:'Legacy lesson',studentAge:'16-18',level:'C2'};let calls=0;
    await beta.stage('a',oldRequest,'foundation',async()=>({overview:{topic:'legacy checkpoint'}}));
    for(const topic of ['Second','Third'])await beta.stage('a',{topic},'foundation',async()=>({}));
    assert.equal(beta.status('a').remaining,0);
    const progress=beta.draftProgress('a').find(p=>p.request.topic==='Legacy lesson');
    const draft=f.store.retain('a',progress);
    await f.store.stage('a',draft.id,'student',async(r)=>beta.stage('a',r,'student',async prior=>{
      calls++;assert.deepEqual(r,oldRequest);assert.deepEqual(prior,{overview:{topic:'legacy checkpoint'}});return {worksheet:{student:{title:'saved'}}};
    }));
    assert.equal(calls,1);assert.equal(beta.status('a').remaining,0);assert.equal(beta.status('a').lessons.length,3);
    assert.deepEqual(beta.draftProgress('b'),[]);
    beta.transact(s=>{s.teachers.a.revokedAt=new Date().toISOString();});
    assert.equal(beta.draftProgress('a').length,3,'Read access to own paid work remains after removal');
    assert.equal(f.store.get('a',draft.id).content.worksheet.student.title,'saved');
    await assert.rejects(f.store.stage('a',draft.id,'teacher',async r=>beta.stage('a',r,'teacher',async()=>assert.fail('Revoked user cannot generate'))),/inactive/);
  }finally{beta.db.close();f.cleanup();}
});

test('beta checkpoint import recovers final results and clears completed external leases',()=>{
  const f=fixture();
  try{
    const initial=f.store.retain('a',{request,parts:{},activeUntil:Date.now()+10000});assert.equal(initial.status,'generating');
    const imported=f.store.retain('a',{request,parts:{foundation:{overview:{topic:'paid result'}}},activeUntil:null});
    assert.equal(imported.status,'ready');assert.equal(imported.activeUntil,null);
    const done=f.store.retain('a',{request,parts:Object.fromEntries(stages.map(s=>[s,{}])),activeUntil:null});
    assert.equal(done.status,'complete');assert.equal(done.nextStage,null);assert.equal(f.store.list('a').length,1);
  }finally{f.cleanup();}
});

test('legacy Resume/Reopen finds the original owned fingerprint before schema defaults are applied',async()=>{
  const f=fixture(),beta=new BetaStore(f.file);
  try{
    const [code,second]=beta.issue();beta.claim('a',code);beta.claim('b',second);
    const {secondarySkill,groupWorkEnabled,studentsPerGroup,...legacy}=request;
    await beta.stage('a',legacy,'foundation',async()=>({overview:{topic:'Original legacy progress'}}));
    const resumed=f.store.ensureRequest('a',legacy,request,beta.draftProgress('a'));
    assert.deepEqual(resumed.request,legacy);assert.equal(resumed.completedStages.length,1);
    assert.equal(f.store.ensureRequest('a',legacy,request,beta.draftProgress('a')).id,resumed.id);
    await f.store.stage('a',resumed.id,'student',async exact=>beta.stage('a',exact,'student',async()=>({worksheet:{student:{title:'Next step'}}})));
    assert.equal(beta.status('a').lessons.length,1);assert.equal(beta.status('a').remaining,2);
    const other=f.store.ensureRequest('b',legacy,request,beta.draftProgress('b'));
    assert.notEqual(other.id,resumed.id);assert.deepEqual(other.request,request);assert.deepEqual(other.completedStages,[]);
    for(const stage of stages.slice(2))await beta.stage('a',legacy,stage,async()=>({}));
    const complete=f.store.ensureRequest('a',legacy,request,beta.draftProgress('a'));
    assert.equal(complete.status,'complete');assert.equal(complete.id,resumed.id);assert.equal(beta.status('a').lessons.length,1);
  }finally{beta.db.close();f.cleanup();}
});

function fakeLibrary(){
  const rows=new Map();let inserts=0,failed=false,lost=false;
  const client={from:()=>({
    select(){const filters={};return {eq(k,v){filters[k]=v;return this;},order(){return this;},limit(){return this;},async maybeSingle(){
      const row=filters.id?rows.get(filters.id):[...rows.values()].find(row=>row.user_id===filters.user_id&&JSON.stringify(row.inputs)===filters.inputs);
      return {data:row?.user_id===filters.user_id?{id:row.id}:null,error:null};
    }};},
    insert(payload){inserts++;return {select:()=>({async single(){if(failed)return {error:Error('offline'),data:null};if(rows.has(payload.id))return {error:{code:'23505'},data:null};rows.set(payload.id,payload);return lost?{error:Error('response lost'),data:null}:{data:{id:payload.id},error:null};}})};}
  })};
  return {client,rows,get inserts(){return inserts;},fail(value){failed=value;},loseResponse(){lost=true;}};
}
test('complete drafts survive failed library saves; retries create one lesson and never overwrite later edits',async()=>{
  const f=fixture(),library=fakeLibrary();
  try{
    const {id}=f.store.ensure('a',request);
    await assert.rejects(saveCompletedDraft(f.store,library.client,'a',id),/Finish/);
    await complete(f.store,'a',id);
    library.fail(true);await assert.rejects(saveCompletedDraft(f.store,library.client,'a',id),/complete draft is retained/);
    assert.equal(f.store.get('a',id).status,'complete');assert.equal(f.store.list('a').length,1);
    library.fail(false);library.loseResponse();const saved=await saveCompletedDraft(f.store,library.client,'a',id);
    assert.equal(library.rows.size,1);assert.equal(f.store.get('a',id).status,'saved');assert.deepEqual(f.store.list('a'),[]);
    library.rows.get(saved.id).content={overview:{topic:'Teacher edit'}};
    const again=await saveCompletedDraft(f.store,library.client,'a',id);
    assert.deepEqual(again,saved);assert.equal(library.inserts,2);assert.equal(library.rows.get(saved.id).content.overview.topic,'Teacher edit');
    await assert.rejects(saveCompletedDraft(f.store,library.client,'b',id),/could not be found/);
  }finally{f.cleanup();}
});

test('simultaneous save attempts share one destination UUID',async()=>{
  const f=fixture(),library=fakeLibrary();
  try{
    const {id}=f.store.ensure('a',request);await complete(f.store,'a',id);
    const saved=await Promise.all([saveCompletedDraft(f.store,library.client,'a',id),saveCompletedDraft(f.store,library.client,'a',id)]);
    assert.equal(saved[0].id,saved[1].id);assert.equal(library.rows.size,1);
  }finally{f.cleanup();}
});

test('legacy completed Reopen links only an exact owned saved lesson and preserves its newer edits',async()=>{
  const f=fixture(),library=fakeLibrary();
  try{
    const {id}=f.store.ensure('a',request);await complete(f.store,'a',id);
    const otherId='11111111-1111-4111-8111-111111111111',ownedId='22222222-2222-4222-8222-222222222222';
    library.rows.set(otherId,{id:otherId,user_id:'b',inputs:request,content:{overview:{topic:'Someone else'}}});
    assert.equal((await linkExistingLesson(f.store,library.client,'a',id)).status,'complete');
    library.rows.set(ownedId,{id:ownedId,user_id:'a',inputs:request,content:{overview:{topic:'Latest teacher edit'}}});
    const linked=await linkExistingLesson(f.store,library.client,'a',id);
    assert.equal(linked.status,'saved');assert.equal(linked.savedLessonId,ownedId);
    assert.deepEqual(await saveCompletedDraft(f.store,library.client,'a',id),{id:ownedId});
    assert.equal(library.inserts,0);assert.equal(library.rows.get(ownedId).content.overview.topic,'Latest teacher edit');
    assert.deepEqual(f.store.list('a'),[]);
    const fresh=f.store.ensure('a',{...request,topic:'Different topic'});await complete(f.store,'a',fresh.id);
    const saved=await saveCompletedDraft(f.store,library.client,'a',fresh.id);
    assert.notEqual(saved.id,ownedId);assert.equal(library.inserts,1);
  }finally{f.cleanup();}
});
