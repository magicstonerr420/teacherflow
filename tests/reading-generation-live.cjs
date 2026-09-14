const {chromium}=require('C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const p=await b.newPage();await p.goto('http://127.0.0.1:3001/builder');
  const request={subject:'English',topic:'A community garden',studentAge:'8-9',level:'A2',durationMinutes:45,mainSkill:'Reading',secondarySkill:'Vocabulary',learningObjective:'Identify the main idea and locate details about what children do in a community garden.',requiredVocabulary:'garden, plant, water, share',previousKnowledge:'Present simple verbs and familiar place words.',technologyAvailable:'No technology',teachingStyle:'Communicative',numberOfStudents:'20',groupWorkEnabled:true,studentsPerGroup:4};
  let lesson={},completed=[];
  const file='.local-runtime/reading-review/full-lesson.json';
  try{const old=JSON.parse(await fs.readFile(file,'utf8'));if(JSON.stringify(old.request)===JSON.stringify(request)){lesson=old.lesson;completed=old.completed}}catch{}
  for(const stage of ['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation']){
   if(completed.includes(stage))continue;
   console.log('Live lesson stage:',stage);
   lesson=await p.evaluate(async({request,stage,lesson})=>{
    const {generateLessonStage}=await import('/src/lib/lesson.functions.ts');
    const {mergeLessonPatch}=await import('/src/lib/generation-plan.ts');
    return mergeLessonPatch(lesson,await generateLessonStage({data:{request,stage,prior:lesson}}));
   },{request,stage,lesson});completed.push(stage);await fs.writeFile(file,JSON.stringify({request,lesson,completed},null,2));
  }
  assert.equal(lesson.reading?.status,'ready');
  const check=await p.evaluate(async lesson=>{
   const {worksheetSchema}=await import('/src/lib/lesson-schema.ts');worksheetSchema.parse(lesson.worksheet);
   const {answerAlignmentIssue}=await import('/src/lib/generation-plan.ts');
   const {findTechTerms}=await import('/src/lib/no-tech.ts');
   return {a:answerAlignmentIssue('teacher',lesson,lesson),b:answerAlignmentIssue('teacherB',lesson,lesson),technology:findTechTerms(lesson)};
  },lesson);
  assert.equal(check.a,null);assert.equal(check.b,null);assert.deepEqual(check.technology,[]);
  console.log('All nine real Gemini stages plus DeepSeek reading passed; A/B questions and answers align, no-technology check passed.');
 }finally{await b.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
