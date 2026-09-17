// Free export/browser audit of checkpointed live lessons. --audio permits one cached recording.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
const root='.local-runtime/beginner-audit',origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3003';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const reports=[];
  for(const id of ['all-about-me','my-family','colors-and-shapes','yummy-food','daily-actions']){
   console.log('Export audit: '+id);
   const file=`${root}/${id}/lesson.json`,data=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(data.completed.length,9,id);
   const page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>console.log('Browser error: '+e.message));await page.routeWebSocket(/.*/,s=>s.close());await page.goto(origin);
   const env=await page.evaluate(()=>({NODE_ENV:'development',TSS_SERVER_FN_BASE:window.process?.env?.TSS_SERVER_FN_BASE||'/_serverFn/'}));
   await page.route('**/beginner-export',r=>r.fulfill({contentType:'text/html',body:'<html><body><script type="module">window.process={env:'+JSON.stringify(env)+'};import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
   await page.goto(origin+'/beginner-export');
   console.log('Mounting worksheet view');
   await page.evaluate(async data=>{window.auditData=data;(await import('/tests/reading-fixture.tsx')).mount(data)},data);
   console.log('Checking rendered pictures');
   const counts={};await page.locator('nav').getByRole('button',{name:'Worksheet',exact:true}).click();const active=page.locator('section.block');await active.getByRole('button',{name:'Student',exact:true}).click();
   for(const version of ['A','B']){
    await active.getByRole('button',{name:`Version ${version}`,exact:true}).click();
    await active.locator('img[alt="Picture clue"]').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
    counts[version]=await active.locator('img[alt="Picture clue"]').count();
    await active.screenshot({path:`${root}/${id}/worksheet-${version}.png`});
   }
   let listeningAudio,seconds;
   if(id==='daily-actions'&&process.argv.includes('--audio')){
    const spendBefore=JSON.parse(await fs.readFile(root+'/spend.json','utf8')).calls.length;
    await page.locator('nav').getByRole('button',{name:'Listening',exact:true}).click();
    const panel=page.locator('section.block');await panel.getByRole('button',{name:'Generate recording',exact:true}).click();
    await panel.locator('audio').waitFor({timeout:180000});await page.waitForFunction(()=>Number.isFinite(document.querySelector('audio')?.duration),{},{timeout:60000});
    seconds=await panel.locator('audio').evaluate(a=>a.duration);assert.ok(seconds>60&&seconds<240);
    await panel.locator('audio').evaluate(a=>a.play());await page.waitForTimeout(800);assert.ok(await panel.locator('audio').evaluate(a=>a.currentTime>0));await panel.locator('audio').evaluate(a=>a.pause());
    const saved=await page.evaluate(()=>window.readingSaved);assert.ok(saved.listening.audio);data.lesson=saved;
    await fs.writeFile(file,JSON.stringify(data,null,2));
    const after=JSON.parse(await fs.readFile(root+'/spend.json','utf8')).calls.length;
    listeningAudio=await page.evaluate(async data=>{const {createListeningAudio,loadListeningAudio}=await import('/src/lib/listening.functions.ts');const cached=await createListeningAudio({data:{request:data.request,fingerprint:data.lesson.listening.fingerprint,choice:'standard'}});const loaded=await loadListeningAudio({data:{id:cached.audio.id}});return loaded.dataUrl;},data);
    assert.equal(JSON.parse(await fs.readFile(root+'/spend.json','utf8')).calls.length,after,'Replaying a saved recording must be free');
    assert.ok(after-spendBefore<=1,'Only one new recording is allowed');
    await fs.writeFile(`${root}/${id}/recording.mp3`,Buffer.from(listeningAudio.split(',')[1],'base64'));
    await page.screenshot({path:`${root}/${id}/listening.png`,fullPage:true});
   }
   console.log('Building exports');
   const result=await page.evaluate(async({data,listeningAudio})=>{
    const {lesson,request}=data;const {buildLessonPackageZip}=await import('/src/lib/exports.ts');
    const {youngWorksheetIssues,worksheetPictureIssues,worksheetPictureKey}=await import('/src/lib/young-learners.ts');
    const {answerAlignmentIssue}=await import('/src/lib/generation-plan.ts');const {withoutListeningSections}=await import('/src/lib/listening.ts');const {withoutReadingSections}=await import('/src/lib/reading.ts');
    const {flashcardsFor}=await import('/src/lib/pptx.ts');
    const core=withoutListeningSections(withoutReadingSections(lesson));
    const check=request.studentAge==='5-7'&&request.level==='A1'?youngWorksheetIssues:worksheetPictureIssues;
    const issues=[...check(core.worksheet.student),...check(core.worksheet.studentB),answerAlignmentIssue('teacher',core,core),answerAlignmentIssue('teacherB',core,core)].filter(Boolean);
    if(issues.length)return{issues};
    const expected={A:lesson.worksheet.student.sections.flatMap(s=>s.items).filter(i=>worksheetPictureKey(i)).length,B:lesson.worksheet.studentB.sections.flatMap(s=>s.items).filter(i=>worksheetPictureKey(i)).length};
    const pack=await buildLessonPackageZip(lesson,request,{},listeningAudio);const files=[];
   for(const f of pack.files){const bytes=new Uint8Array(await f.blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));files.push({name:f.name,base64:btoa(text)});}
    return{issues,expected,files,cards:flashcardsFor(lesson,request).length};
   },{data,listeningAudio});
   assert.deepEqual(result.issues,[],id);assert.deepEqual(counts,result.expected,id+' every picture renders');
   await fs.mkdir(`${root}/${id}/exports`,{recursive:true});for(const f of result.files)await fs.writeFile(`${root}/${id}/exports/${f.name}`,Buffer.from(f.base64,'base64'));
   const report={id,age:data.request.studentAge,level:data.request.level,counts,cards:result.cards,seconds,files:result.files.map(f=>f.name)};reports.push(report);await fs.writeFile(root+'/exports.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(report));await page.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
