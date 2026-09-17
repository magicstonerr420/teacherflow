// Opt-in real-provider regression for the owner's board-only Weather and Clothes lesson.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const dir='.local-runtime/weather-review',origin=process.env.TEST_ORIGIN || 'http://127.0.0.1:3002';
(async()=>{
 await fs.mkdir(dir,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const p=await browser.newPage({viewport:{width:1360,height:1050}});
  await p.route('**/weather-test',r=>r.fulfill({contentType:'text/html',body:'<html><body><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
  await p.goto(origin+'/weather-test');
  const request={subject:'English',topic:'Weather and Clothes',studentAge:'5-7',level:'A1',durationMinutes:60,mainSkill:'Listening',secondarySkill:'Vocabulary',learningObjective:'Students can identify different types of weather and choose appropriate clothes for each type of weather.',requiredVocabulary:'Sun, Rain, Shirt, Shoes, Hat',technologyAvailable:'Board only',teachingStyle:'Traditional / structured',groupWorkEnabled:false,studentsPerGroup:null};
  let lesson={},completed=[];
  try{const old=JSON.parse(await fs.readFile(dir+'/lesson.json','utf8'));if(JSON.stringify(old.request)===JSON.stringify(request)){lesson=old.lesson;completed=old.completed;}}catch{}
  for(const stage of ['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation']){
   if(completed.includes(stage))continue;
   console.log('Generating:',stage);
   try{
    lesson=await p.evaluate(async({request,stage,lesson})=>{const {generateLessonStage}=await import('/src/lib/lesson.functions.ts');const {mergeLessonPatch}=await import('/src/lib/generation-plan.ts');return mergeLessonPatch(lesson,await generateLessonStage({data:{request,stage,prior:lesson}}));},{request,stage,lesson});
   }catch(e){await fs.writeFile(dir+'/failure.json',JSON.stringify({stage,message:e.message},null,2));throw e;}
   completed.push(stage);await fs.writeFile(dir+'/lesson.json',JSON.stringify({request,lesson,completed},null,2));
  }
  const validation=await p.evaluate(async({request,lesson})=>{
   const {youngWorksheetIssues,pictureSvg}=await import('/src/lib/young-learners.ts');
   const {findTechTerms}=await import('/src/lib/no-tech.ts');
   const {alternateWorksheetIssue}=await import('/src/lib/worksheet-versions.ts');
   return {a:youngWorksheetIssues(lesson.worksheet.student),b:youngWorksheetIssues(lesson.worksheet.studentB),tech:findTechTerms(lesson),alternate:alternateWorksheetIssue(lesson.worksheet.student,lesson.worksheet.studentB),pictures:['sun','rain','shirt','shoes','hat'].every(w=>!!pictureSvg(w))};
  },{request,lesson});
  assert.deepEqual(validation.a,[]);assert.deepEqual(validation.b,[]);assert.deepEqual(validation.tech,[]);assert.ok(!validation.alternate);assert.ok(validation.pictures);
  assert.equal(lesson.listening.status,'ready');assert.ok(!lesson.listening.audio);
  assert.equal(lesson.reading,undefined,'Teacher-read listening must not add a separate reading passage');
  await p.evaluate(async data=>{const {mount}=await import('/tests/reading-fixture.tsx');mount(data);},{request,lesson});
  await p.locator('nav').getByRole('button',{name:'Listening',exact:true}).click();
  const active=p.locator('section.block');
  assert.equal(await active.getByRole('button',{name:'Script ready',exact:true}).count(),1);
  assert.equal(await active.locator('audio,select').count(),0);
  await p.locator('nav').getByRole('button',{name:'Worksheet',exact:true}).click();
  await p.locator('section.block').getByRole('button',{name:'Student',exact:true}).click();
  await p.screenshot({path:dir+'/student-worksheet.png',fullPage:true});
  const exports=await p.evaluate(async({request,lesson})=>{
   const {buildStudentWorksheetPdf,buildLessonPackageZip}=await import('/src/lib/exports.ts');
   const a=await buildStudentWorksheetPdf(lesson,request,'A');const b=await buildStudentWorksheetPdf(lesson,request,'B');
   const zip=await buildLessonPackageZip(lesson,request);
   return {a:Array.from(new Uint8Array(await a.arrayBuffer())),b:Array.from(new Uint8Array(await b.arrayBuffer())),zip:Array.from(new Uint8Array(await zip.blob.arrayBuffer())),files:zip.files.map(f=>f.name)};
  },{request,lesson});
  await fs.writeFile(dir+'/Weather_and_Clothes_A.pdf',Buffer.from(exports.a));await fs.writeFile(dir+'/Weather_and_Clothes_B.pdf',Buffer.from(exports.b));await fs.writeFile(dir+'/Weather_and_Clothes.zip',Buffer.from(exports.zip));
  assert.ok(!exports.files.some(f=>f.endsWith('.mp3')));
  await fs.writeFile(dir+'/verification.json',JSON.stringify({completed,validation,files:exports.files},null,2));
  console.log('PASS: all nine stages, A/B picture clues, distinct worksheets, board-only script, no audio generation and PDF/ZIP exports.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
