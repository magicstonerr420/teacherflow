const {chromium}=require('C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:3000/builder');
  await page.getByRole('heading',{name:'Private teacher beta'}).waitFor();
  await page.getByText('Sign in or create an account to claim your invitation').waitFor();
  assert.equal(await page.getByRole('button',{name:'Build My Class',exact:true}).isDisabled(),true);
  const results=await page.evaluate(async()=>{
    const {generateLessonStage,regenerateSection}=await import('/src/lib/lesson.functions.ts');
    const {claimBeta}=await import('/src/lib/beta.functions.ts');
    const request={subject:'English',topic:'Test',studentAge:'5-7',level:'A1',durationMinutes:30,mainSkill:'Vocabulary',learningObjective:'Name school objects.',groupWorkEnabled:false,studentsPerGroup:null};
    const failure=async fn=>{try{await fn();return 'UNEXPECTED SUCCESS';}catch(e){return e.message;}};
    const stage=await failure(()=>generateLessonStage({data:{request,stage:'foundation',prior:{}}}));
    const claim=await failure(()=>claimBeta({data:'not-a-real-invite'}));
    const regen=await failure(()=>regenerateSection({data:{request,section:'worksheet',lesson:{}}}));
    const image=await fetch('/api/generate-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request,prompt:'test'})});
    const spoof=await fetch('/api/generate-image',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer forged-token'},body:JSON.stringify({request,prompt:'test'})});
    return {stage,claim,regen,image:image.status,spoof:spoof.status};
  });
  assert.match(results.stage,/Sign in/);assert.match(results.claim,/Sign in/);assert.match(results.regen,/Sign in/);assert.equal(results.image,403);assert.equal(results.spoof,403);
  await page.screenshot({path:'../../work/beta-access.png',fullPage:false});
  console.log('Browser beta gate and direct stage, image, invitation, regeneration, forged-token checks passed. No AI calls made.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
