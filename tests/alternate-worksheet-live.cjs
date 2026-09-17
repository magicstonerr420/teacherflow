// Opt-in live-provider recovery test. Supply a saved {request,lesson} fixture.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
(async()=>{
 const fixture=JSON.parse(await fs.readFile(process.argv[2] || '.local-runtime/weather-review/lesson.json','utf8'));
 const dir='.local-runtime/alternate-review';await fs.mkdir(dir,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage();await page.goto(process.env.TEST_ORIGIN || 'http://127.0.0.1:3002');
  const prior=structuredClone(fixture.lesson);delete prior.worksheet.studentB;delete prior.worksheet.teacherB;
  for(let run=1;run<=3;run++){
   const result=await page.evaluate(async({request,prior})=>{
    const {generateLessonStage}=await import('/src/lib/lesson.functions.ts');
    const {mergeLessonPatch,answerAlignmentIssue}=await import('/src/lib/generation-plan.ts');
    const {alternateWorksheetIssue,repeatedAlternateItems}=await import('/src/lib/worksheet-versions.ts');
    const {youngWorksheetIssues}=await import('/src/lib/young-learners.ts');
    const {withoutListeningSections}=await import('/src/lib/listening.ts');
    const {withoutReadingSections}=await import('/src/lib/reading.ts');
    let lesson=mergeLessonPatch(prior,await generateLessonStage({data:{request,stage:'studentB',prior}}));
    lesson=mergeLessonPatch(lesson,await generateLessonStage({data:{request,stage:'teacherB',prior:lesson}}));
    const core=withoutListeningSections(withoutReadingSections(lesson));
    return {lesson,duplicate:alternateWorksheetIssue(core.worksheet.student,core.worksheet.studentB),repeated:repeatedAlternateItems(core.worksheet.student,core.worksheet.studentB),clarity:youngWorksheetIssues(core.worksheet.studentB),answers:answerAlignmentIssue('teacherB',core,core)};
   },{request:fixture.request,prior});
   assert.equal(result.duplicate,null);assert.deepEqual(result.clarity,[]);assert.equal(result.answers,null);
   assert.deepEqual(result.lesson.worksheet.student,prior.worksheet.student);
   assert.deepEqual(result.lesson.worksheet.teacher,prior.worksheet.teacher);
   assert.deepEqual(result.lesson.overview,prior.overview);assert.deepEqual(result.lesson.lessonPlan,prior.lessonPlan);
   await fs.writeFile(`${dir}/run-${run}.json`,JSON.stringify({request:fixture.request,...result},null,2));
   console.log(`PASS run ${run}: Version B and its answer key completed; ${result.repeated.length}/25 repeated core items; Version A and completed lesson sections unchanged.`);
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
