const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const origin=process.env.TEST_ORIGIN || 'http://127.0.0.1:3002';
const dir='.local-runtime/listening-review';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/listening-test',r=>r.fulfill({contentType:'text/html',body:'<html><body><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
  await page.goto(origin+'/listening-test');
  const fixture=JSON.parse(await fs.readFile('comparison/budget-lesson.json','utf8'));
  const request={...fixture.request,studentAge:'13-15',level:'B1',topic:'A school garden',mainSkill:'Listening',secondarySkill:'Reading',learningObjective:'Identify the sequence and reasons for a school gardening project.',requiredVocabulary:'plant, soil, water, harvest',previousKnowledge:'Past simple and sequencing words.',technologyAvailable:'Projector + audio'};
  let lesson={},completed=[];const file=dir+'/full-lesson.json';
  try{const old=JSON.parse(await fs.readFile(file,'utf8'));if(JSON.stringify(old.request)===JSON.stringify(request)){lesson=old.lesson;completed=old.completed}}catch{}
  for(const stage of ['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation']){
   if(completed.includes(stage))continue;
   console.log('Generating integrated stage:',stage);
   lesson=await page.evaluate(async({request,stage,lesson})=>{
    const {generateLessonStage}=await import('/src/lib/lesson.functions.ts');const {mergeLessonPatch}=await import('/src/lib/generation-plan.ts');
    return mergeLessonPatch(lesson,await generateLessonStage({data:{request,stage,prior:lesson}}));
   },{request,stage,lesson});
   completed.push(stage);await fs.writeFile(file,JSON.stringify({request,lesson,completed},null,2));
  }
  assert.equal(lesson.listening.status,'ready');
  // Exercise recovery on saved lessons if a previous reading attempt failed.
  if(lesson.reading?.status==='failed'){
   lesson=await page.evaluate(async({request,lesson})=>{const {regenerateReading}=await import('/src/lib/reading.functions.ts');const {applyReading}=await import('/src/lib/reading.ts');return applyReading(lesson,await regenerateReading({data:{request,lesson,operation:crypto.randomUUID()}}));},{request,lesson});
   await fs.writeFile(file,JSON.stringify({request,lesson,completed},null,2));
  }
  assert.equal(lesson.reading.status,'ready',lesson.reading.error);
  await page.evaluate(async data=>{window.fixture=data;const {mount}=await import('/tests/reading-fixture.tsx');mount(data);},{request,lesson});
  await page.locator('nav').getByRole('button',{name:'Listening',exact:true}).click();
  const active=page.locator('section.block');
  await active.getByRole('button',{name:'Generate recording',exact:true}).click();
  const player=active.locator('audio');await player.waitFor({timeout:180000});
  await page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&Number.isFinite(a.duration)&&a.duration>0},{},{timeout:60000});
  const duration=await player.evaluate(a=>a.duration);assert.ok(duration>60&&duration<240,`Duration ${duration}`);
  await player.evaluate(a=>a.play());await page.waitForTimeout(1200);assert.ok(await player.evaluate(a=>a.currentTime>0));await player.evaluate(a=>a.pause());
  const download=page.waitForEvent('download');await active.getByRole('link',{name:'Download MP3'}).click();await (await download).saveAs(dir+'/browser-recording.mp3');
  const saved=await page.evaluate(()=>window.readingSaved);assert.ok(saved.listening.audio);
  const before=await fs.readFile('.local-runtime/generation-events.jsonl','utf8');
  await active.getByRole('button',{name:'Generate recording',exact:true}).click();
  await active.getByRole('button',{name:'Generate recording',exact:true}).waitFor();
  assert.equal(await fs.readFile('.local-runtime/generation-events.jsonl','utf8'),before,'No text-generation request on audio replay');
  const data=await page.evaluate(async ({request,lesson})=>{
   const {buildLessonPackageZip,buildStudentWorksheetPdf}=await import('/src/lib/exports.ts');
   const {loadListeningAudio}=await import('/src/lib/listening.functions.ts');
   const {JSZip}=await import('/tests/young-fixture.tsx');
   const audio=await loadListeningAudio({data:{id:lesson.listening.audio.id}});
   const out=await buildLessonPackageZip(lesson,request,{},audio.dataUrl);const zip=await JSZip.loadAsync(await out.blob.arrayBuffer());
   const files=Object.keys(zip.files);const student=await buildStudentWorksheetPdf(lesson,request,'A');
   return {files,zip:Array.from(new Uint8Array(await out.blob.arrayBuffer())),student:Array.from(new Uint8Array(await student.arrayBuffer())),mp3Size:(await zip.file(files.find(x=>x.endsWith('.mp3'))).async('uint8array')).length};
  },{request,lesson:saved});
  assert.ok(data.files.some(f=>f.endsWith('_Listening_Teacher_Copy.pdf')));assert.ok(data.mp3Size>10000);
  await fs.writeFile(dir+'/verified-full-lesson.zip',Buffer.from(data.zip));await fs.writeFile(dir+'/student-worksheet.pdf',Buffer.from(data.student));
  await page.locator('nav').getByRole('button',{name:'Worksheet',exact:true}).click();
  await page.locator('section.block').getByRole('button',{name:'Student',exact:true}).click();
  const studentText=await page.locator('section.block').innerText();assert.equal(studentText.includes(saved.listening.value.script),false);assert.ok(studentText.includes(saved.listening.value.questions[0].question));
  // Remount persisted lesson and load cached recording through the authenticated server function.
  await page.reload();await page.evaluate(async data=>{const {mount}=await import('/tests/reading-fixture.tsx');mount(data);},{request,lesson:saved});
  await page.locator('nav').getByRole('button',{name:'Listening',exact:true}).click();
  await page.locator('section.block audio').waitFor({timeout:30000});
  await page.screenshot({path:dir+'/listening-browser.png',fullPage:true});
  const decoded=[];
  for(const name of ['grok','orpheus','flux']){
   const bytes=await fs.readFile(`${dir}/${name}-probe.mp3`);
   decoded.push(await page.evaluate(async({name,bytes})=>{const ctx=new AudioContext();try{const audio=await ctx.decodeAudioData(Uint8Array.from(bytes).buffer);const channel=audio.getChannelData(0);return {name,seconds:audio.duration,peak:channel.reduce((m,x)=>Math.max(m,Math.abs(x)),0)}}finally{await ctx.close()}},{name,bytes:Array.from(bytes)}));
  }
  assert.ok(decoded.every(x=>x.seconds>2&&x.peak>0.001));assert.deepEqual(errors,[]);
  const report={duration,decoded,files:data.files,checks:'Full generation, playback, MP3 download, cached replay, persisted reopen, student answer isolation and ZIP export passed.'};
  await fs.writeFile(dir+'/browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
