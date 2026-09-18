import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'vite';
import path from 'node:path';
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},resolve:{alias:{'@':path.resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false}});
try{
 const {generateWorksheetAnswers}=await server.ssrLoadModule('/src/lib/worksheet-answers.server.ts');
 const {answerAlignmentIssues,answerAlignmentIssue,STAGE_SCHEMAS,mergeLessonPatch}=await server.ssrLoadModule('/src/lib/generation-plan.ts');
 const {withoutReadingSections,integrateReadingPatch,READING_LABEL}=await server.ssrLoadModule('/src/lib/reading.ts');
 const {withoutListeningSections,integrateListeningPatch,LISTENING_LABEL}=await server.ssrLoadModule('/src/lib/listening.ts');
 const fixture=JSON.parse(await readFile('tests/fixtures/persuasive-communication-answers.json','utf8'));
 const prior={worksheet:{student:fixture.student}};
 for(const teacher of [fixture.rejectedTeacher,fixture.rejectedRepair]){
  const issues=answerAlignmentIssues('teacher',prior,{worksheet:{teacher}});
  assert.ok(issues.some(i=>i.section===3&&i.rule==='count'),'Reproduce the real C2 initial and failed repair count mismatch');
  assert.deepEqual(issues.filter(i=>i.rule==='count').map(i=>i.section),fixture.student.sections.flatMap((s,i)=>s.items.length!==teacher.sections[i].answers.length?[i]:[]),'Report every failed section in both drafts');
 }
 const body={explanation:'Evaluate the evidence and reasoning.',expectedResponses:['Other well-supported responses are valid.'],commonErrors:[],corrections:[],teacherNotes:''};
 function response(doc,answerFor=()=> 'Accept a supported response that addresses every part of this question.'){
  return {overview:'Review each task.',groupWorkGuidance:'',sections:Object.fromEntries(doc.sections.map((s,i)=>['section_'+(i+1),{...body,answers:Object.fromEntries(s.items.map((item,j)=>['item_'+(j+1),answerFor(item,s,j,i)]))}]))};
 }
 const original=JSON.stringify(prior);
 const valid=response(fixture.student);
 let calls=0;
 const repaired=await generateWorksheetAnswers(fixture.request,prior,'teacher',async args=>{
  calls++;
  // The old ambiguous array form, absent answers, extras and blanks cannot pass.
  assert.equal(args.schema.safeParse({worksheet:{teacher:fixture.rejectedTeacher}}).success,false);
  for(const mutate of [r=>delete r.sections.section_4.answers.item_5,r=>r.sections.section_4.answers.item_6='extra',r=>r.sections.section_4.answers.item_5=' ']){
   const bad=structuredClone(valid);mutate(bad);assert.equal(args.schema.safeParse(bad).success,false);
  }
  assert.match(args.input,/Keep all parts of a compound question together/);
  assert.ok(args.noTech);
  return valid;
 });
 assert.equal(calls,1);
 assert.equal(answerAlignmentIssue('teacher',prior,repaired),null);
 STAGE_SCHEMAS.teacher.parse(repaired);
 assert.equal(JSON.stringify(prior),original,'Student worksheet stays unchanged');
 assert.deepEqual(repaired.worksheet.teacher.sections.map(s=>s.answers.length),fixture.student.sections.map(s=>s.items.length));
 assert.deepEqual(repaired.answerKey.sections.map(s=>s.answers),repaired.worksheet.teacher.sections.map(s=>s.answers),'Export key uses the same verified answers');
 const item=(prompt,choices=[])=>({number:1,prompt,choices,answerLines:1,visual:''});
 const section=(items,extra={})=>({label:'A',title:'Practice',format:'short-answer',instructions:'Answer each item.',passage:'',wordBank:[],items,...extra});
 // Every offered level, age band and worksheet format uses the actual question structure.
 const formats=['fill-in-the-blank','multiple-choice','matching','categorisation','rewrite','error-correction','short-answer','reading','table','speaking-prompts','writing','checklist'];
 let matrix=0;
 for(const level of ['A1','A2','B1','B2','C1','C2'])for(const studentAge of ['5-7','8-9','10-12','13-15','16-18','Adults'])for(const stage of ['teacher','teacherB']){
  const doc={title:'Mixed tasks',instructions:'',sections:formats.map((format,i)=>section(Array.from({length:i%5+1},(_,j)=>item(j?'Explain your reasoning.':'State a claim and give two reasons.')),{label:'Section '+(i+1),title:format,format}))};
  const source={worksheet:{[stage==='teacher'?'student':'studentB']:doc}};
  const result=await generateWorksheetAnswers({...fixture.request,level,studentAge,technologyAvailable:'Board only'},source,stage,async args=>args.schema.parse(response(doc)));
  STAGE_SCHEMAS[stage].parse(result);
  assert.equal(answerAlignmentIssue(stage,source,result),null);
  const keys=stage==='teacher'?result.worksheet.teacher.sections:result.worksheet.teacherB;
  assert.deepEqual(keys.map(s=>s.answers.length),doc.sections.map(s=>s.items.length));
  assert.deepEqual(keys.map(s=>s.label),doc.sections.map(s=>s.label));
  matrix++;
 }
 // Preserve correct sections while repairing every invalid item in the affected sections.
 const doc={title:'Clues and personal answers',instructions:'',sections:[
  section([item('Choose the supplied term.',['claim','evidence']),item('Choose another term.',['claim','evidence'])]),
  section([item('Nia is the ______.')],{label:'B',passage:'Nia is the mom.',instructions:'Write one word.',wordBank:['mom','dad']}),
  section([item('What is your name?')],{label:'C'}),
  section([item('Give a reason.')],{label:'D'}),
 ]};
 for(const stage of ['teacher','teacherB']){
  const source={worksheet:{[stage==='teacher'?'student':'studentB']:doc}};
  const draft=response(doc,(item,s,j,i)=>i===0?'rhetoric':i===1?'dad':i===2?'Nia.':'Accept a well-supported reason.');
  const correct=response(doc,(item,s,j,i)=>i===0?'claim':i===1?'mom':i===2?'Accept the student’s own name.':'Accept a well-supported reason.');
  let requests=0;
  const result=await generateWorksheetAnswers(fixture.request,source,stage,async args=>{
   if(requests++===0)return args.schema.parse(draft);
   assert.deepEqual(Object.keys(args.schema.shape.sections.shape),['section_1','section_2','section_3']);
   assert.match(args.input,/section 1, item 1 must match/);assert.match(args.input,/section 1, item 2 must match/);
   assert.match(args.input,/contradicts its printed passage/);assert.match(args.input,/personal information/);
   assert.match(args.input,/PREVIOUS ANSWERS TO CORRECT/);
   const {section_4,...sections}=correct.sections;return args.schema.parse({sections});
  });
  assert.equal(requests,2);assert.equal(answerAlignmentIssue(stage,source,result),null);
  const keys=stage==='teacher'?result.worksheet.teacher.sections:result.worksheet.teacherB;
  assert.equal(keys[3].answers[0],draft.sections.section_4.answers.item_1);
  let failed=0;
  await assert.rejects(generateWorksheetAnswers(fixture.request,source,stage,async args=>{
   failed++;if(failed===1)return draft;
   const {section_4,...sections}=draft.sections;return {sections};
  }),/answer key still needs corrections/);
  assert.equal(failed,2,'Bound repair calls; never bypass unresolved wrong answers');
 }
 let failures=0;
 await assert.rejects(generateWorksheetAnswers(fixture.request,prior,'teacher',async()=>{failures++;throw Error('Provider unavailable');}),/Provider unavailable/);
 assert.equal(failures,1,'Do not repeatedly spend on provider failures');
 await assert.rejects(generateWorksheetAnswers(fixture.request,{},'teacher',async()=>{throw Error('Unexpected call');}),/student worksheet/);
 const empty=await generateWorksheetAnswers(fixture.request,{worksheet:{student:{sections:[]}}},'teacher',async()=>{throw Error('No AI needed for an empty core');});
 assert.deepEqual(empty.worksheet.teacher.sections,[]);
 // Dedicated comprehension retains its separately validated answers after core key generation.
 const reading={status:'ready',fingerprint:'test',value:{cefr:'C2',title:'Evidence',purpose:'Evaluate evidence',instructions:'Read and answer.',word_count:3,text:'Evidence supports claims.',questions:[{type:'main_idea',question:'What supports claims?',choices:[],evidence:'Evidence supports claims.',answerExplanation:'The sentence states this.'}],answers:['Evidence.'],activity:'Discuss.',assessment:'Identify evidence.'}};
 const withReading=integrateReadingPatch({reading},{worksheet:{student:doc}});
 const withState={...withReading,reading};
 const core=withoutListeningSections(withoutReadingSections(withState));
 const answered=await generateWorksheetAnswers(fixture.request,{...core,reading},'teacher',async args=>{
  assert.match(args.system,/Dedicated reading materials/);return response(core.worksheet.student,()=> 'Accept an appropriate response.');
 });
 const integrated=integrateListeningPatch(withState,integrateReadingPatch(withState,answered));
 const complete=mergeLessonPatch(withState,integrated);
 assert.deepEqual(complete.worksheet.student,withState.worksheet.student);
 assert.deepEqual(complete.worksheet.teacher.sections.find(s=>s.label===READING_LABEL).answers,['Evidence.']);
 const listening={status:'ready',fingerprint:'test',value:{title:'Listen for evidence',cefr:'C2',purpose:'Identify support',instructions:'Listen and answer.',script:'Evidence supports claims.',teacherGuidance:'Read aloud twice.',questions:[{question:'What supports claims?',choices:[],answer:'Evidence.',evidence:'Evidence supports claims.',explanation:'Directly stated.'}]}};
 const withBoth={...integrateListeningPatch({...complete,listening},complete),reading,listening};
 const bothCore=withoutListeningSections(withoutReadingSections(withBoth));
 const coreKeys=await generateWorksheetAnswers(fixture.request,{...bothCore,reading,listening},'teacher',async args=>{
  assert.match(args.system,/dedicated listening script/);return response(bothCore.worksheet.student);
 });
 const combined=integrateListeningPatch(withBoth,integrateReadingPatch(withBoth,coreKeys));
 assert.deepEqual(combined.worksheet.student,withBoth.worksheet.student);
 for(const label of [READING_LABEL,LISTENING_LABEL])assert.deepEqual(combined.worksheet.teacher.sections.find(s=>s.label===label).answers,['Evidence.']);
 // A teacher's two failed attempts still resume the same reserved lesson with its saved worksheet.
 const {BetaStore}=await server.ssrLoadModule('/src/lib/beta-store.server.ts');
 const store=new BetaStore(':memory:');
 try{
  const [invite]=store.issue();store.claim('regression-teacher',invite,'test@example.test');
  await store.stage('regression-teacher',fixture.request,'foundation',async()=>({overview:{topic:fixture.request.topic}}));
  await store.stage('regression-teacher',fixture.request,'student',async()=>prior);
  for(let i=0;i<2;i++)await assert.rejects(store.stage('regression-teacher',fixture.request,'teacher',async()=>{throw Error('Old alignment failure');}),/Old alignment failure/);
  const before=store.status('regression-teacher').remaining;
  const recovered=await store.stage('regression-teacher',fixture.request,'teacher',async cached=>{
   assert.deepEqual(cached.worksheet.student,fixture.student);
   return generateWorksheetAnswers(fixture.request,cached,'teacher',async args=>args.schema.parse(valid));
  });
  assert.equal(answerAlignmentIssue('teacher',prior,recovered),null);
  assert.equal(store.status('regression-teacher').remaining,before);
  assert.deepEqual(await store.stage('regression-teacher',fixture.request,'teacher',async()=>{throw Error('Do not regenerate the successful key');}),recovered);
 }finally{store.db.close();}
 console.log(`PASS: reproduced C2 failure and failed repair; keyed answers across ${matrix} age/level/version combinations and all 12 formats; exact counts, immutable worksheets, synchronized export keys, targeted repairs, preserved reading/listening, beta resume without another slot, bounded provider calls. No paid calls.`);
}finally{await server.close();}
