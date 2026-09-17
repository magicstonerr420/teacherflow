import test from 'node:test';
import assert from 'node:assert/strict';
import {alternateWorksheetIssue} from '../src/lib/worksheet-versions.ts';
import {repairDrawingParagraphs} from '../src/lib/pptx-xml.ts';
import {BetaStore} from '../src/lib/beta-store.server.ts';
const doc=(prefix)=>({sections:[{wordBank:[],passage:'',items:Array.from({length:5},(_,n)=>({number:n+1,prompt:prefix+' '+n,choices:['a','b'],visual:''}))}]});
test('B must differ in content, not titles, numbering, item order or choice order',()=>{
 const a=doc('The cat');const b=structuredClone(a);b.title='Version B';b.sections[0].items.reverse();b.sections[0].items.forEach(i=>{i.choices.reverse();i.number+=10;});
 assert.ok(alternateWorksheetIssue(a,b));assert.equal(alternateWorksheetIssue(a,doc('The dog')),null);
});
test('PPT rich text keeps one paragraph-properties node before all highlighted runs',()=>{
 const input='<a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>My </a:t></a:r><a:pPr><a:buNone/></a:pPr><a:r><a:t>cat</a:t></a:r></a:p>';
 const fixed=repairDrawingParagraphs(input);assert.equal((fixed.match(/<a:pPr>/g)||[]).length,1);assert.ok(fixed.includes('<a:t>cat</a:t>'));assert.equal(repairDrawingParagraphs(fixed),fixed);
});
test('duplicate B repair is isolated, durable, does not consume lesson slots, and is bounded',async()=>{
 const store=new BetaStore(':memory:');const codes=store.issue();store.claim('teacher',codes[0]);const request={topic:'animals'};
 const phases=['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation'];
 const a=doc('cat');
 for(const stage of phases)await store.stage('teacher',request,stage,async()=>stage==='student'?{worksheet:{student:a}}:stage==='studentB'?{worksheet:{studentB:structuredClone(a)}}:{[stage]:{kept:true}});
 let calls=0;let release;const hold=new Promise(r=>release=r);
 const repair=store.repairAlternate('teacher',request,async()=>{calls++;await hold;return {worksheet:{studentB:doc('dog'),teacherB:[{answers:['dog']}]}};});
 await assert.rejects(store.repairAlternate('teacher',request,async()=>assert.fail()),/already running/);release();await repair;
 const result=await store.repairAlternate('teacher',request,async()=>assert.fail('Must reuse repaired B'));
 assert.equal(calls,1);assert.deepEqual(result.worksheet.student,a);assert.equal(alternateWorksheetIssue(a,result.worksheet.studentB),null);assert.equal(store.status('teacher').remaining,2);
 await assert.rejects(store.repairAlternate('stranger',request,async()=>assert.fail()),/invitation/);
 await assert.rejects(store.repairAlternate('teacher',{topic:'foreign'},async()=>assert.fail()),/own lesson/);
 store.db.close();
});

test('failed Version B repairs retain both worksheets and stop after two attempts',async()=>{
 const store=new BetaStore(':memory:');store.claim('teacher',store.issue()[0]);const request={topic:'body'};
 const a=doc('head');
 for(const stage of ['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation'])await store.stage('teacher',request,stage,async()=>stage==='student'?{worksheet:{student:a}}:stage==='studentB'?{worksheet:{studentB:structuredClone(a)}}:{[stage]:{kept:true}});
 let calls=0;
 for(let i=0;i<2;i++)await assert.rejects(store.repairAlternate('teacher',request,async()=>{calls++;return {worksheet:{studentB:structuredClone(a)}};}),/distinct worksheet/);
 await assert.rejects(store.repairAlternate('teacher',request,async()=>assert.fail('No third paid repair')),/two unsuccessful attempts/);
 const saved=store.readingLesson('teacher',request);
 assert.deepEqual(saved.worksheet.student,a);assert.deepEqual(saved.worksheet.studentB,a);
 assert.equal(calls,2);assert.equal(store.status('teacher').remaining,2);store.db.close();
});
