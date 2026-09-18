import test from 'node:test';
import assert from 'node:assert/strict';
import {lessonImagePrompts, vocabularyImagePrompt} from '../src/lib/image-plan.ts';
import {BetaStore} from '../src/lib/beta-store.server.ts';

const request = {studentAge:'14-16',level:'B1',topic:'Conservation',requiredVocabulary:'conservation'};
const presentation = {slides:[
  ...Array.from({length:6},(_,i)=>({layout:'content',imagePrompt:`scene ${i}`})),
  {layout:'vocabulary',vocabulary:[{word:'conservation',imagePrompt:'Protecting an endangered forest'}]},
]};

test('unknown vocabulary pictures precede optional scenes for all ages within six slots',()=>{
  for(const studentAge of ['5-7','8-9','14-16','Adults']) for(const level of ['A1','B1']) {
    const prompts=lessonImagePrompts({presentation},{...request,studentAge,level});
    assert.equal(prompts[0],'Protecting an endangered forest');
    assert.equal(prompts.length,6);
    assert.equal(prompts.includes('scene 5'),false);
  }
});

test('missing prompt and required word missing from vocabulary get the same deterministic plan',()=>{
  const lesson={overview:{materialsNeeded:['Flashcards']},presentation:{slides:[{layout:'vocabulary',vocabulary:[{word:'biodiversity',imagePrompt:''},{word:'cat',imagePrompt:'Optional cat'}]}]}};
  assert.deepEqual(lessonImagePrompts(lesson,request),[vocabularyImagePrompt('biodiversity'),vocabularyImagePrompt('conservation'),'Optional cat']);
  assert.equal(vocabularyImagePrompt('cat'),'');
});

test('beta allows the corrected plan, reuses paid images, and never grants extra image or lesson slots',async()=>{
  const store=new BetaStore(':memory:');store.claim('teacher',store.issue()[0]);
  const stages=['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation'];
  for(const stage of stages) await store.stage('teacher',request,stage,async()=>stage==='presentation'?{presentation}:stage==='foundation'?{overview:{materialsNeeded:['Flashcards']}}:{});
  let calls=0;
  const picture=async()=>{calls++;return 'data:image/png;base64,test';};
  await store.image('teacher',request,'Protecting an endangered forest',picture);
  await store.image('teacher',request,'Protecting an endangered forest',picture);
  assert.equal(calls,1);
  assert.equal(store.status('teacher').remaining,2);
  for(let i=0;i<5;i++) await store.image('teacher',request,`scene ${i}`,picture);
  await assert.rejects(store.image('teacher',request,'scene 5',picture),/six/);
  assert.equal(calls,6);
  // A lesson with six pictures paid under the old ordering keeps them, but cannot buy a seventh.
  store.transact(s=>{const run=Object.values(s.teachers.teacher.runs)[0];run.parts.presentation.value.presentation.slides.push({layout:'vocabulary',vocabulary:[{word:'sustainability',imagePrompt:'New required picture'}]});});
  assert.equal(await store.image('teacher',request,'scene 4',picture),'data:image/png;base64,test');
  await assert.rejects(store.image('teacher',request,'New required picture',picture),/six illustration slots/);
  assert.equal(calls,6);store.db.close();
});

test('beta authorizes a missing required vocabulary picture from retained lesson context',async()=>{
  const store=new BetaStore(':memory:');store.claim('teacher',store.issue()[0]);
  for(const stage of ['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation']) await store.stage('teacher',request,stage,async()=>stage==='foundation'?{overview:{materialsNeeded:['Flashcards']}}:stage==='presentation'?{presentation:{slides:[]}}:{});
  assert.equal(await store.image('teacher',request,vocabularyImagePrompt('conservation'),async()=> 'retained-picture'),'retained-picture');
  assert.equal(store.status('teacher').remaining,2);store.db.close();
});
