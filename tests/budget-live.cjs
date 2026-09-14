const { chromium } = require('C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs/promises');
(async () => {
  const browser = await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page = await browser.newPage();
    page.on('console', msg => { if (msg.text().startsWith('Budget test:')) console.log(msg.text()); });
    await page.goto('http://127.0.0.1:3000/builder');
    const result = await page.evaluate(async () => {
      const {generateLessonStage} = await import('/src/lib/lesson.functions.ts');
      const {GENERATION_PHASES,mergeLessonPatch} = await import('/src/lib/generation-plan.ts');
      const request={subject:'English',topic:'Sharing school supplies',studentAge:'5-7',level:'A1',durationMinutes:30,mainSkill:'Vocabulary',learningObjective:'Name a pencil, book and ruler and ask Can I have a pencil please?',technologyAvailable:'Projector / screen',groupWorkEnabled:false,studentsPerGroup:null};
      let lesson={};
      for(const {key} of GENERATION_PHASES){
        console.log('Budget test: generating '+key);
        const patch=await generateLessonStage({data:{request,stage:key,prior:lesson}});
        lesson=mergeLessonPatch(lesson,patch);
      }
      return {request,lesson};
    });
    await fs.writeFile('comparison/budget-lesson.json',JSON.stringify(result,null,2));
    console.log('All nine real backend stages completed; saved comparison/budget-lesson.json');
  } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
