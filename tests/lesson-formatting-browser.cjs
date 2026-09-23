const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4201';
const paragraphs=[
 'Our neighborhood garden brings people together every Saturday morning. The students grow vegetables beside a small library, where families exchange books and share stories about the places they have visited.',
 'Last month, the group decided to improve the empty space behind the library. They discussed several ideas, listened to their neighbors, and chose a plan that would give everyone somewhere comfortable to read.',
 'Next week, each student will explain one part of the project to a visitor. They will describe what changed, give a reason for their decisions, and ask the visitors how the space could become even more useful.'
];
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(origin)&&!r.request().url().includes('/_serverFn/')&&!r.request().url().includes('/api/')?r.continue():r.abort());
  await page.route('**/lesson-formatting-test',r=>r.fulfill({contentType:'text/html',body:'<html lang="en"><body><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
  await page.goto(origin+'/lesson-formatting-test');
  const result=await page.evaluate(async paragraphs=>{
   const passage=paragraphs.join('\n\n');
   const request={subject:'English',topic:'Our neighborhood',studentAge:'13-15',level:'B1',durationMinutes:60,mainSkill:'Reading',learningObjective:'Explain changes in a community.',groupWorkEnabled:false,studentsPerGroup:null};
   const student={title:'Our neighborhood garden',instructions:'Read the passage. Answer the questions.',sections:[{label:'A',title:'Reading',format:'short-answer',instructions:'Read carefully.',passage,wordBank:[],items:[{number:1,prompt:'Why did the students choose to improve the space behind the library?',choices:[],answerLines:2,visual:''}]}]};
   const teacher={label:'A',title:'Reading',answers:['TEACHER-ONLY: To provide a place to read.'],explanation:passage,expectedResponses:[],commonErrors:[],corrections:[],teacherNotes:passage};
   const worksheet={title:student.title,student,studentB:{...student,title:'Version B'},teacher:{overview:passage,groupWorkGuidance:'',sections:[teacher]},teacherB:[teacher]};
   const reading={status:'ready',value:{cefr:'B1',title:student.title,purpose:'Explain a community project.',word_count:105,text:passage,instructions:'Read and answer.',questions:[{question:student.sections[0].items[0].prompt,choices:[],answerExplanation:'They needed a place to read.',evidence:paragraphs[1]}],answers:['TEACHER-ONLY'],activity:passage,assessment:passage}};
   const share={title:student.title,updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),worksheet:{student},reading:{title:student.title,text:passage,instructions:'Read and answer.',questions:reading.value.questions.map(q=>({question:q.question,choices:q.choices}))}};
   const listeningLesson={listening:{status:'ready',value:{title:'Our neighborhood',script:passage,teacherGuidance:passage,instructions:'Listen and answer.',questions:[{question:'Why did the group improve the garden?',choices:[],answer:'TEACHER-ONLY',explanation:paragraphs[1]}]}}};
   const {mount}=await import('/tests/lesson-formatting-fixture.tsx');mount({reading,request,worksheet,share,listeningLesson,dense:paragraphs.join(' ').repeat(3)});
   const {studentPdf,buildTeacherWorksheetPdf}=await import('/src/lib/exports.ts');
   const before=JSON.stringify(worksheet);
   const files=[];
   for(const [name,blob] of [['student.pdf',await studentPdf(student,request)],['teacher.pdf',await buildTeacherWorksheetPdf({worksheet},request,'A')],['long-reading.pdf',await studentPdf({...student,sections:[{...student.sections[0],passage:Array.from({length:15},(_,i)=>`Paragraph ${i+1}. ${paragraphs[i%3]}`).join('\n\n')}]},request)]]){
    let s='';for(const byte of new Uint8Array(await blob.arrayBuffer()))s+=String.fromCharCode(byte);files.push({name,data:btoa(s)});
   }
   return {files,unchanged:before===JSON.stringify(worksheet)};
  },paragraphs);
  const dir='.local-runtime/lesson-formatting-review';await fs.mkdir(dir,{recursive:true});
  for(const file of result.files)await fs.writeFile(`${dir}/${file.name}`,Buffer.from(file.data,'base64'));
  assert.equal(result.unchanged,true);
  const passage=page.locator('[aria-label="Reading passage"] .lesson-copy').filter({hasText:paragraphs[0]}).first();
  await passage.waitFor();assert.equal(await passage.locator('.lesson-paragraph').count(),3);
  const check=await passage.evaluate(el=>{
   const children=[...el.children];return {align:getComputedStyle(el).textAlign,last:getComputedStyle(el).textAlignLast,gap:children[1].getBoundingClientRect().top-children[0].getBoundingClientRect().bottom};
  });
  assert.equal(check.align,'justify');assert.equal(check.last,'start');assert.ok(check.gap>=14);
  const worksheet=page.getByTestId('worksheet');
  const teacherPassage=worksheet.locator('.lesson-copy').filter({hasText:paragraphs[0]}).first();
  assert.deepEqual(await teacherPassage.locator('.lesson-paragraph').allTextContents(),paragraphs);
  await worksheet.getByRole('button',{name:'Student',exact:true}).click();
  const studentPassage=worksheet.locator('.lesson-copy').filter({hasText:paragraphs[0]}).first();
  assert.deepEqual(await studentPassage.locator('.lesson-paragraph').allTextContents(),paragraphs);
  assert.doesNotMatch(await worksheet.innerText(),/TEACHER-ONLY/);
  assert.doesNotMatch(await page.getByTestId('shared').innerText(),/TEACHER-ONLY/);
  assert.ok(await page.getByTestId('dense').locator('.lesson-paragraph').count()>1);
  await page.getByText('Teacher transcript and answers',{exact:true}).click();
  assert.deepEqual(await page.getByTestId('listening').locator('.lesson-copy').filter({hasText:paragraphs[0]}).first().locator('.lesson-paragraph').allTextContents(),paragraphs);
  await page.getByText('Teacher transcript and answers',{exact:true}).click();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`${dir}/desktop.png`});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal scrolling on mobile');
  await page.screenshot({path:`${dir}/mobile.png`});
  await page.emulateMedia({media:'print'});assert.equal(await passage.evaluate(el=>getComputedStyle(el).textAlign),'justify');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,paragraphs:3,teacherStudentMatch:true,desktopMobilePrint:true,pdfExports:3,unchanged:result.unchanged,paidAiCalls:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
