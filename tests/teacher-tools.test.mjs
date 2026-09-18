import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TeacherToolsStore } from '../src/lib/teacher-tools-store.server.ts';
import { ownedLesson, requireFeedbackOwner } from '../src/lib/teacher-tools-access.server.ts';
import { filterLibrary, savedClassSchema } from '../src/lib/teacher-tools.ts';

const lessonId='11111111-1111-4111-8111-111111111111';
const settings={studentAge:'8-9',level:'A1',durationMinutes:45,technologyAvailable:'No technology'};
test('teacher tools survive reopen, remain account scoped, and do not alter generation quotas',()=>{
  const dir=mkdtempSync(join(tmpdir(),'teacher-tools-')); let store;
  try {
    const file=join(dir,'beta.sqlite');store=new TeacherToolsStore(file);
    store.db.exec(`CREATE TABLE beta_state (id INTEGER PRIMARY KEY,body TEXT); INSERT INTO beta_state VALUES(1,'{"remaining":2,"images":6}')`);
    const id=store.saveClass('teacher-a',{name:' Monday beginners ',settings:{...settings,topic:'never retain a lesson topic',learningObjective:'not a class setting'}});
    assert.deepEqual(store.classes('teacher-a'),[{id,name:'Monday beginners',settings}]);
    assert.deepEqual(store.classes('teacher-b'),[]);
    assert.throws(()=>store.saveClass('teacher-b',{id,name:'hijacked',settings}),/unavailable/);
    store.deleteClass('teacher-b',id);assert.equal(store.classes('teacher-a').length,1);
    store.saveClass('teacher-a',{id,name:'Tuesday beginners',settings});
    store.favorite('teacher-a',lessonId,true);store.favorite('teacher-a',lessonId,true);
    assert.deepEqual(store.favorites('teacher-a'),[lessonId]);assert.deepEqual(store.favorites('teacher-b'),[]);
    store.favorite('teacher-b',lessonId,false);assert.equal(store.favorites('teacher-a').length,1);
    store.saveFeedback('teacher-a',{lessonId,usedInClass:'not_yet',editing:'a_little',comment:'Initial review'},{topic:'Nature',level:'A1',teacher:'teacher@example.test'});
    assert.equal(store.feedback('teacher-b',lessonId),null);
    store.saveFeedback('teacher-a',{lessonId,usedInClass:'yes',editing:'none',comment:'Worked well'},{topic:'Nature',level:'A1',teacher:'teacher@example.test'});
    assert.equal(store.feedbackPage(0).entries.length,1,'Updating feedback does not add duplicates');
    assert.equal(store.feedbackPage(0).entries[0].usedInClass,'yes');
    assert.throws(()=>store.saveFeedback('teacher-a',{lessonId,usedInClass:'yes',editing:'none',comment:'x'.repeat(2001)},{topic:'Nature',level:'A1',teacher:'Teacher'}));
    store.db.close();store=new TeacherToolsStore(file);
    assert.equal(store.classes('teacher-a')[0].name,'Tuesday beginners');
    assert.equal(store.feedback('teacher-a',lessonId).comment,'Worked well');
    assert.deepEqual(store.favorites('teacher-a'),[lessonId]);
    assert.equal(store.db.prepare('SELECT body FROM beta_state').get().body,'{"remaining":2,"images":6}');
    store.favorite('teacher-a',lessonId,false);store.deleteClass('teacher-a',id);
    assert.deepEqual(store.favorites('teacher-a'),[]);assert.deepEqual(store.classes('teacher-a'),[]);
    assert.throws(()=>store.classes(''),/Sign in/);
  } finally {store?.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('class limits, validation, and feedback pagination',()=>{
  const dir=mkdtempSync(join(tmpdir(),'teacher-tools-'));const store=new TeacherToolsStore(join(dir,'test.sqlite'));
  try {
    for(let i=0;i<30;i++)store.saveClass('a',{name:'Class '+i,settings});
    assert.throws(()=>store.saveClass('a',{name:'Too many',settings}),/30 classes/);
    assert.doesNotThrow(()=>store.saveClass('b',{name:'Own class',settings}));
    assert.equal(savedClassSchema.safeParse({name:' ',settings}).success,false);
    assert.equal(savedClassSchema.safeParse({name:'Class',settings:{...settings,level:'invalid'}}).success,false);
    for(let i=0;i<51;i++)store.saveFeedback('teacher-'+i,{lessonId,usedInClass:'yes',editing:'none',comment:''},{topic:'Nature',level:'A1',teacher:'Teacher '+i});
    assert.equal(store.feedbackPage(0).entries.length,50);assert.equal(store.feedbackPage(0).more,true);
    assert.equal(store.feedbackPage(50).entries.length,1);assert.equal(store.feedbackPage(50).more,false);
  } finally {store.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('ownership and owner feedback checks fail closed',async()=>{
  const filters=[];const client={from:()=>({select:()=>({eq(key,value){filters.push([key,value]);return this;},async maybeSingle(){return {data:null,error:null};}})})};
  await assert.rejects(ownedLesson(client,'teacher-a',lessonId),/unavailable/);
  assert.deepEqual(filters,[['id',lessonId],['user_id','teacher-a']]);
  const original=process.env.TEACHERFLOW_OWNER_USER_ID;
  try {
    process.env.TEACHERFLOW_OWNER_USER_ID='owner-a';
    assert.throws(()=>requireFeedbackOwner('teacher-a'),/Only/);
    assert.doesNotThrow(()=>requireFeedbackOwner('owner-a'));
    delete process.env.TEACHERFLOW_OWNER_USER_ID;assert.throws(()=>requireFeedbackOwner('owner-a'),/Only/);
  } finally {if(original===undefined)delete process.env.TEACHERFLOW_OWNER_USER_ID;else process.env.TEACHERFLOW_OWNER_USER_ID=original;}
});
test('library filters combine topic, level, skill and favorite without mutating lessons',()=>{
  const lessons=[{id:'a',topic:'Nature & conservation',level:'A1',main_skill:'Speaking'},{id:'b',topic:'Nature',level:'B1',main_skill:'Reading'},{id:'c',topic:'Food',level:'A1',main_skill:'Speaking'}];
  const filter={search:' NATURE ',level:'A1',skill:'Speaking',favoritesOnly:true};
  assert.deepEqual(filterLibrary(lessons,filter,['a','b']).map(l=>l.id),['a']);
  assert.equal(filterLibrary(lessons,filter,['b']).length,0);
  assert.equal(filterLibrary(lessons,{search:'',level:'',skill:'',favoritesOnly:false},[]).length,3);
  assert.equal(lessons.length,3);
});
