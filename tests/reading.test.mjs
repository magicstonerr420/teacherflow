import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const server = await createServer({configFile:false, server:{middlewareMode:true,watch:null}, resolve:{alias:{'@':path.resolve('src')}}});
const originalFetch = globalThis.fetch;
const key = process.env.OPENROUTER_API_KEY;
const oldDb = process.env.TEACHERFLOW_READING_DB;
try {
  const {validateReading, readingContext, applyReading, integrateReadingPatch, READING_LABEL, needsReading} = await server.ssrLoadModule('/src/lib/reading.ts');
  const {generateReading, READING_SYSTEM} = await server.ssrLoadModule('/src/lib/reading.server.ts');
  const {worksheetSchema, normalizeWorksheet} = await server.ssrLoadModule('/src/lib/lesson-schema.ts');
  const fixture = JSON.parse(await readFile('comparison/budget-lesson.json','utf8'));
  const lesson = fixture.lesson ?? fixture.result;
  const request = {...fixture.request, mainSkill:'Reading', level:'A1', studentAge:'Adults'};
  const reading = {title:'Community', cefr:'A1', purpose:'scan for information', instructions:'Read. Find the opening time.',word_count:10,text:'The library opens at nine. It is near the park.',questions:[{type:'scanning',question:'What time does the library open?',choices:[],evidence:'The library opens at nine.',answerExplanation:'The opening time is stated explicitly.'}],answers:['Nine.'],activity:'Find the place and opening time.',assessment:'Locate an opening time in a new notice.'};
  for (const field of ['text','questions','answers','cefr']) {
    const bad = {...reading}; delete bad[field]; assert.throws(()=>validateReading(bad,'A1'));
  }
  for(const bad of [{...reading,text:''},{...reading,questions:[]},{...reading,answers:[]},{...reading,cefr:'A3'},{...reading,answers:['one','two']}]) assert.throws(()=>validateReading(bad,'A1'));
  assert.throws(()=>validateReading(reading,'B1'));
  assert.equal(validateReading({...reading,word_count:999},'A1').word_count,10);
  const indexMismatch={...reading,text:'I have arms.',questions:[{type:'supporting_details',question:'Which sentence is in the passage?',choices:['I have ears.','I have arms.'],evidence:'I have arms.',answerExplanation:"The passage says 'I have arms.'"}],answers:['I have ears.']};
  assert.deepEqual(validateReading(indexMismatch,'A1').answers,['I have arms.']);
  assert.deepEqual(validateReading({...indexMismatch,questions:indexMismatch.questions.map(q=>({...q,question:'Which sentence is not in the passage?'}))},'A1').answers,['I have ears.']);
  const state={status:'ready',value:reading,fingerprint:'test'};
  const applied=applyReading(lesson,state);
  worksheetSchema.parse(applied.worksheet);
  assert.deepEqual(normalizeWorksheet(applied.worksheet),applied.worksheet);
  const s=applied.worksheet.student.sections.find(s=>s.label===READING_LABEL), t=applied.worksheet.teacher.sections.find(s=>s.label===READING_LABEL);
  assert.equal(s.label,READING_LABEL); assert.equal(s.passage,reading.text);
  assert.equal('answers' in s,false); assert.deepEqual(t.answers,reading.answers);
  assert.equal(JSON.stringify(s).includes('Nine.'),false);
  const reapplied=applyReading(applied,state);
  assert.deepEqual(reapplied,applied);
  const b=structuredClone(lesson); b.worksheet.studentB=structuredClone(b.worksheet.student); b.worksheet.teacherB=structuredClone(b.worksheet.teacher.sections);
  const both=applyReading(b,state); assert.equal(both.worksheet.studentB.sections.find(s=>s.label===READING_LABEL).passage,reading.text); assert.deepEqual(both.worksheet.teacherB.find(s=>s.label===READING_LABEL).answers,reading.answers);
  for(const field of ['presentation','activity','assessment','versionB','supportVersion','challengeVersion','lessonPlan']) assert.deepEqual(applied[field],lesson[field]);
  const failure=applyReading(applied,{status:'failed',error:'failed'}); assert.deepEqual(failure.worksheet,applied.worksheet);
  assert.ok(needsReading(request,lesson));
  const listeningOnly={...request,mainSkill:'Listening',secondarySkill:'Vocabulary',learningObjective:'Identify weather and choose suitable clothes.'};
  assert.equal(needsReading(listeningOnly,{lessonPlan:{stages:[{teacherActions:'Read the worksheet items aloud.',studentActions:'Listen and choose the word.'}]}}),false);
  assert.equal(needsReading(listeningOnly,{lessonPlan:{stages:[{teacherActions:'Show the cards.',studentActions:'Read the word cards.'}]}}),false);
  assert.equal(needsReading(listeningOnly,{lessonPlan:{stages:[{studentActions:'Read the short passage and find details.'}]}}),true);
  assert.deepEqual(readingContext(request,lesson),readingContext(request,{...lesson,presentation:{slides:[]}}));
  assert.notDeepEqual(readingContext(request,lesson),readingContext({...request,learningObjective:'Find the sequence of events.'},lesson));
  const partial=integrateReadingPatch({reading:state},{worksheet:{student:lesson.worksheet.student,title:'Practice'}});
  assert.equal(partial.worksheet.student.sections.find(s=>s.label===READING_LABEL).passage,reading.text);
  process.env.OPENROUTER_API_KEY='test-key';
  process.env.TEACHERFLOW_READING_DB=path.join(await mkdtemp(path.join(tmpdir(),'teacherflow-reading-')),'test.sqlite');
  let calls=0;const throttled=new Set();
  globalThis.fetch=async (_url,options)=>{
    const body=JSON.parse(options.body);
    const stage=body.response_format.json_schema.name;
    if(!throttled.has(stage)){throttled.add(stage);return new Response('',{status:429,headers:{'Retry-After':'0'}});}
    calls++;
    assert.equal(body.model,'deepseek/deepseek-v4-flash-0731'); assert.equal(body.max_tokens,6000);
    assert.ok(body.messages[0].content.includes(READING_SYSTEM));
    await new Promise(r=>setTimeout(r,25));
    const result=body.response_format.json_schema.name.endsWith('_passage') ? {cefr:reading.cefr,title:reading.title,purpose:reading.purpose,text:reading.text} : {instructions:reading.instructions,activity:reading.activity,assessment:reading.assessment,questions:[1,2,3].map(()=>({...reading.questions[0],evidence:undefined,evidenceSentence:1,answerChoice:0,answer:reading.answers[0]}))};
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
  };
  const [a,c]=await Promise.all([generateReading(request,lesson,'teacher'),generateReading(request,lesson,'teacher')]);
  assert.equal(a.status,'ready'); assert.deepEqual(a,c); assert.equal(calls,2);
  assert.equal(throttled.size,2,'Both passage and questions recover from a rate limit without restarting the passage');
  await generateReading(request,{...lesson,presentation:{slides:[]}},'teacher'); assert.equal(calls,2);
  await generateReading(request,lesson,'teacher','regen-one'); assert.equal(calls,4);
  await generateReading(request,lesson,'teacher','regen-one'); assert.equal(calls,4);
  let repairs=0;
  globalThis.fetch=async (_url,options)=>{
    const body=JSON.parse(options.body);let candidate;
    if(body.response_format.json_schema.name.endsWith('_passage'))candidate={cefr:reading.cefr,title:reading.title,purpose:reading.purpose,text:reading.text};
    else {repairs++;candidate={instructions:reading.instructions,activity:reading.activity,assessment:reading.assessment,questions:[1,2,3].map(n=>({...reading.questions[0],evidence:undefined,evidenceSentence:repairs===1?99:1,answerChoice:0,answer:'Nine.'}))};}
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(candidate)}}]});
  };
  const corrected=await generateReading(request,lesson,'teacher','bad-evidence-repair');
  assert.equal(corrected.status,'ready');assert.deepEqual(corrected.value.answers,['Nine.','Nine.','Nine.']);assert.equal(repairs,2);
  // A question-only repair cannot fix a no-tech violation inside the passage.
  const phases=[];
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body),stage=body.response_format.json_schema.name;phases.push(stage);
    assert.match(body.messages[0].content,/NO TECHNOLOGY/);
    let candidate;
    if(stage==='teacherflow_reading_passage')candidate={cefr:reading.cefr,title:'Community',purpose:'Scan for information',text:'The library opens at nine. Read the notice on the internet.'};
    else if(stage==='teacherflow_reading_passage_reference_repair'){
      assert.match(body.messages[1].content,/NO-TECHNOLOGY VIOLATION/);
      candidate={cefr:reading.cefr,title:reading.title,purpose:reading.purpose,text:reading.text};
    }else{
      assert.match(body.messages[1].content,/The library opens at nine/);
      assert.ok(!body.messages[1].content.includes('Read the notice on the internet.'));
      candidate={instructions:reading.instructions,activity:reading.activity,assessment:reading.assessment,questions:[1,2,3].map(()=>({...reading.questions[0],evidence:undefined,evidenceSentence:1,answerChoice:0,answer:'Nine.'}))};
    }
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(candidate)}}]});
  };
  const paperReading=await generateReading({...request,technologyAvailable:'No technology'},lesson,'teacher','paper-reading');
  assert.equal(paperReading.status,'ready');assert.equal(paperReading.value.text,reading.text);
  assert.deepEqual(phases,['teacherflow_reading_passage','teacherflow_reading_passage_reference_repair','teacherflow_reading_questions']);
  let rejectedCalls=0;
  globalThis.fetch=async()=>{rejectedCalls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({cefr:'A1',title:'Notice',purpose:'Scan',text:'Read the internet notice.'})}}]});};
  assert.equal((await generateReading({...request,technologyAvailable:'No technology'},lesson,'teacher','paper-reading-failed')).status,'failed');
  assert.equal(rejectedCalls,2,'Do not charge for questions while the source passage remains invalid');
  for(const [name,content,finish] of [['malformed','oops','stop'],['missing',JSON.stringify({cefr:'A1'}),'stop'],['truncated',JSON.stringify(reading),'length']]) {
    globalThis.fetch=async()=>Response.json({choices:[{finish_reason:finish,message:{content}}]});
    const result=await generateReading(request,lesson,'teacher',name); assert.equal(result.status,'failed'); assert.ok(result.error);
  }
  globalThis.fetch=async()=>{throw new Error('network down');};
  assert.equal((await generateReading(request,lesson,'teacher','offline')).status,'failed');
  assert.equal((await generateReading(request,lesson,'teacher','limit',true)).status,'failed');
  console.log('Reading validation, age/CEFR context, teacher/student isolation, A/B integration, unrelated-part preservation, duplicate/concurrent caching, explicit regeneration, failure retention, and beta cost limit passed.');
} finally {
  globalThis.fetch=originalFetch;
  if(key===undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY=key;
  if(oldDb===undefined) delete process.env.TEACHERFLOW_READING_DB; else process.env.TEACHERFLOW_READING_DB=oldDb;
  await server.close();
}
