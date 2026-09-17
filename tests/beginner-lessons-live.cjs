// Opt-in provider audit: one case per previously untested topic; retain every successful stage.
if(process.env.RUN_LIVE_BEGINNER_AUDIT!=='1')throw new Error('Set RUN_LIVE_BEGINNER_AUDIT=1 only against a development server with an explicit provider spending cap.');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
const root='.local-runtime/beginner-audit',origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3003';
const cases=[
 ['all-about-me','All About Me','5-7','A1','Vocabulary',null,'Students can state their name, age, and how they feel today.','Basic greetings like "hello" and "bye," and the numbers 1–10.','No technology','Communicative','Mom, Dad, Brother, Sister, Baby'],
 ['my-family','My Family','5-7','A1','Speaking',null,'Students can name and point to three different family members.','The pronouns "me," "this," "my," and the difference between "boy" and "girl."','Board only','Discussion-led','Mom, Dad, Brother, Sister, Baby'],
 ['colors-and-shapes','Colors and Shapes','5-7','A1','Listening',null,'Students can identify and match basic colors with geometric shapes.','The names of 3–4 basic colors (red, blue, yellow) and the concept of "same" and "different."','Projector / screen','Traditional / structured','Red, Blue, Green, Circle, Square'],
 ['yummy-food','Yummy Food','8-9','A2','Speaking','Vocabulary','Students can say which foods they like and dislike using simple sentences.','Basic food words and simple opinion words such as “like,” “don’t like,” “yes,” and “no.”','Computer lab / student devices','Task-based','Apple, Banana, Carrot, Milk, Bread'],
 ['daily-actions','Daily Actions','8-9','A2','Mixed','Listening','Students can follow and perform simple physical action commands.','Directional cues like "up" and "down," and standard classroom commands like "look" and "listen."','Projector + audio','Task-based','Run, Jump, Sit, Stand, Stop'],
];
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const [id,topic,studentAge,level,mainSkill,secondarySkill,learningObjective,previousKnowledge,technologyAvailable,teachingStyle,requiredVocabulary] of cases){
   if(process.argv[2]&&process.argv[2]!==id)continue;
   const dir=`${root}/${id}`;await fs.mkdir(dir,{recursive:true});
   const request={subject:'English',topic,studentAge,level,durationMinutes:60,mainSkill,secondarySkill,learningObjective,previousKnowledge,technologyAvailable,teachingStyle,requiredVocabulary,groupWorkEnabled:false,studentsPerGroup:null};
   let lesson={},completed=[];try{const saved=JSON.parse(await fs.readFile(dir+'/lesson.json','utf8'));assert.deepEqual(saved.request,request);({lesson,completed}=saved)}catch(e){if(e.code!=='ENOENT')throw e}
   const page=await browser.newPage();await page.routeWebSocket(/.*/,socket=>socket.close());
   await page.goto(origin);
   try{
    for(const stage of ['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation']){
     if(completed.includes(stage))continue;console.log(topic+': '+stage);
     lesson=await page.evaluate(async({request,lesson,stage})=>{const {generateLessonStage}=await import('/src/lib/lesson.functions.ts');const {mergeLessonPatch}=await import('/src/lib/generation-plan.ts');return mergeLessonPatch(lesson,await generateLessonStage({data:{request,stage,prior:lesson}}));},{request,lesson,stage});
     completed.push(stage);await fs.writeFile(dir+'/lesson.json',JSON.stringify({request,lesson,completed},null,2));
    }
    const checks=await page.evaluate(async({request,lesson})=>{
     const {worksheetPictureIssues,youngPresentationIssues,pictureSvg}=await import('/src/lib/young-learners.ts');
     const {alternateWorksheetIssue,repeatedAlternateItems}=await import('/src/lib/worksheet-versions.ts');
     const {withoutListeningSections,needsListening,validateListening}=await import('/src/lib/listening.ts');
     const {withoutReadingSections}=await import('/src/lib/reading.ts');
     const {answerAlignmentIssue}=await import('/src/lib/generation-plan.ts');
     const {findTechTerms,isNoTechRequest}=await import('/src/lib/no-tech.ts');
     const core=withoutListeningSections(withoutReadingSections(lesson));
     return {pictures:[...worksheetPictureIssues(core.worksheet.student),...worksheetPictureIssues(core.worksheet.studentB)],alternate:alternateWorksheetIssue(core.worksheet.student,core.worksheet.studentB),repeated:repeatedAlternateItems(core.worksheet.student,core.worksheet.studentB),answers:[answerAlignmentIssue('teacher',core,core),answerAlignmentIssue('teacherB',core,core)],minutes:lesson.lessonPlan.stages.reduce((n,s)=>n+s.time,0),technology:isNoTechRequest(request.technologyAvailable)?findTechTerms(lesson):[],listening:needsListening(request)?lesson.listening?.status:'optional',words:lesson.listening?.status==='ready'?validateListening(lesson.listening.value,request.level,request.studentAge).script.split(/\s+/).length:null,flashcards:youngPresentationIssues(lesson.presentation,lesson),missingNativeWords:request.requiredVocabulary.split(', ').filter(w=>!pictureSvg(w))};
    },{request,lesson});
    await fs.writeFile(dir+'/checks.json',JSON.stringify(checks,null,2));console.log(topic+': '+JSON.stringify(checks));
   }catch(e){await fs.writeFile(dir+'/failure.json',JSON.stringify({completed,message:e.message},null,2));console.log('FAIL '+topic+': '+e.message)}
   finally{await page.close()}
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
