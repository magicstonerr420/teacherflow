import test from 'node:test';
import assert from 'node:assert/strict';
import { studentInteraction, studentPresentationSlide, assertStudentPresentation } from '../src/lib/presentation-audience.ts';
import { youngSlidePages } from '../src/lib/young-slides.ts';

const slide={number:2,title:'Our goal',layout:'goal',studentText:'I can listen and do the action.',bullets:[],vocabulary:[],highlightWords:[],interaction:'Ask: Can you do one action when you hear it?',teacherNote:'Teacher-only answer: jump.',purpose:'Check comprehension.',visualSuggestion:'Teacher-only staging.',imagePrompt:''};
test('presenter prefix becomes a direct learner question',()=>{
  assert.equal(studentInteraction(slide.interaction),'Can you do one action when you hear it?');
  assert.equal(studentInteraction('Ask your partner two questions.'),'Ask your partner two questions.');
});
test('facilitation and answer guidance stay out of student tasks',()=>{
  for(const text of ['Choral drill. Then one student leads one command.','Students act out each command with the teacher.','Ask students to raise their hands.','Monitor and assess pronunciation.','Expected answer: run.','Teacher note: show the answer.']) assert.equal(studentInteraction(text),'',text);
  assert.equal(studentInteraction('Listen and point. Correct answer: B.'),'Listen and point.');
  assert.equal(studentInteraction('Work with a partner; teacher note: demonstrate first.'),'Work with a partner');
});
test('learner commands, role assignments and model language remain intact',()=>{
  for(const text of ['Show me: sit, stand, stop.','Student A says a word. Student B does the action. Then switch.','Which sentence is correct — A or B?','Yes, I have. / No, I haven’t.']) assert.equal(studentInteraction(text),text);
});
test('student projection is nonmutating and is applied before young-slide pagination',()=>{
  const source={...slide,interaction:'Ask students to look at each picture. '.repeat(25)};
  const before=JSON.stringify(source),projected=studentPresentationSlide(source);
  assert.equal(projected.teacherNote,'');assert.equal(projected.purpose,'');assert.equal(projected.visualSuggestion,'');
  assert.equal(youngSlidePages(projected).length,1,'Teacher directions cannot turn into extra Your turn slides');
  assert.equal(JSON.stringify(source),before);
});
test('explicit answer/teacher labels in display fields prevent a misleading student export',()=>{
  for(const patch of [{studentText:'Teacher note: demonstrate the answer.'},{bullets:['Answer key: 1. run']},{vocabulary:[{word:'run',definition:'Expected answer: jump',example:'',imagePrompt:''}]}]) assert.throws(()=>assertStudentPresentation([{...slide,...patch}]),/Slide 2 contains teacher guidance/);
  assert.doesNotThrow(()=>assertStudentPresentation([{...slide,studentText:'Students learn in different ways. Children enjoy games.'}]));
});
