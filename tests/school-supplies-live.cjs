// Opt-in: continue the real-provider School Supplies fixture through the remaining stages.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
const dir='.local-runtime/school-supplies-review';
(async()=>{
 let fixture;try{fixture=JSON.parse(await fs.readFile(dir+'/complete.json','utf8'));}catch{fixture=JSON.parse(await fs.readFile(dir+'/alternate/run-1.json','utf8'));fixture.completed=['foundation','student','teacher','studentB','teacherB'];}
 const {request}=fixture;let {lesson,completed}=fixture;
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1300,height:1000}});await page.goto(process.env.TEST_ORIGIN||'http://127.0.0.1:3002');
  for(const stage of ['presentation','activity','assessment','differentiation']){
   if(completed.includes(stage))continue;console.log('Generating',stage);
   lesson=await page.evaluate(async({request,lesson,stage})=>{const {generateLessonStage}=await import('/src/lib/lesson.functions.ts');const {mergeLessonPatch}=await import('/src/lib/generation-plan.ts');return mergeLessonPatch(lesson,await generateLessonStage({data:{request,stage,prior:lesson}}));},{request,lesson,stage});
   completed.push(stage);await fs.writeFile(dir+'/complete.json',JSON.stringify({request,lesson,completed},null,2));
  }
  await page.route('**/school-picture-test',r=>r.fulfill({contentType:'text/html',body:'<html><body><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
  await page.goto((process.env.TEST_ORIGIN||'http://127.0.0.1:3002')+'/school-picture-test');
  await page.evaluate(async data=>{window.schoolData=data;(await import('/tests/reading-fixture.tsx')).mount(data)},{request,lesson});
  await page.locator('nav').getByRole('button',{name:'Worksheet',exact:true}).click();
  const active=page.locator('section.block');await active.getByRole('button',{name:'Student',exact:true}).click();
  const counts={};
  for(const version of ['A','B']){
   await active.getByRole('button',{name:`Version ${version}`,exact:true}).click();
   await active.locator('img[alt="Picture clue"]').evaluateAll(async imgs=>Promise.all(imgs.map(i=>i.decode())));
   const doc=version==='A'?lesson.worksheet.student:lesson.worksheet.studentB;
   const expected=doc.sections.flatMap(s=>s.items).filter(i=>i.visual).length;
   counts[version]=await active.locator('img[alt="Picture clue"]').count();assert.equal(counts[version],expected);
   await active.screenshot({path:dir+`/version-${version}.png`});
  }
  const result=await page.evaluate(async()=>{
   const {lesson,request}=window.schoolData;const {buildLessonPackageZip}=await import('/src/lib/exports.ts');
   const {worksheetPictureIssues}=await import('/src/lib/young-learners.ts');
   const issues=[...worksheetPictureIssues(lesson.worksheet.student),...worksheetPictureIssues(lesson.worksheet.studentB)];
   const pack=await buildLessonPackageZip(lesson,request);
   const files=[];for(const f of pack.files)files.push({name:f.name,bytes:Array.from(new Uint8Array(await f.blob.arrayBuffer()))});
   return {issues,files};
  });
  assert.deepEqual(result.issues,[]);assert.equal(completed.length,9);
  await fs.mkdir(dir+'/exports',{recursive:true});for(const f of result.files)await fs.writeFile(dir+'/exports/'+f.name,Buffer.from(f.bytes));
  const report={completed,counts,issues:result.issues,files:result.files.map(f=>f.name)};
  await fs.writeFile(dir+'/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
