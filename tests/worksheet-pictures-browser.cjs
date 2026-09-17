// Reproduce the reported worksheet, across age/level branches, without AI requests.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3002';
const dir = '.local-runtime/worksheet-picture-review';
const words = ['sun','rain','shirt','shoes','hat'];
const section = (label,title,instructions,items) => ({label,title,instructions,items,format:'multiple-choice',passage:'',wordBank:[]});
const item = (visual,i,prompt,choices=[]) => ({visual,number:i+1,prompt,choices,answerLines:choices.length?0:1});
const preamble = '<html><body><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>';
(async()=>{
 await fs.mkdir(dir,{recursive:true});
 const data = JSON.parse(await fs.readFile('comparison/budget-lesson.json','utf8'));
 data.request = {...data.request,topic:'Weather and Clothes'};
 const a = {title:'Weather and Clothes',instructions:'Look. Read. Circle. Write.',sections:[
  section('Section A','See the word','Look at each picture. Circle one word.', words.map((w,i)=>item(w,i,'What do you see?', [w,words[(i+1)%5],words[(i+2)%5]]))),
  {...section('Section B','Write the word','Look at each picture. Write the word.', words.map((w,i)=>item(w,i,'I see the ______.'))),wordBank:words,format:'fill-in-the-blank'},
  section('Section C','Choose the clothes','Read each weather sentence. Circle one word.', words.map((w,i)=>item(i%2?'rain':'sun',i,`It is ${i%2?'rainy':'sunny'}. What do you wear on your ${i%3===0?'head':i%3===1?'feet':'body'}?`,['Hat','Shoes','Shirt'])))
 ]};
 const b = {title:'Weather and Clothes',instructions:'Look at each picture.',sections:[
  section('Section D','Circle Yes or No','Read the sentence. Circle Yes or No.',words.map((w,i)=>item('',i,`Picture: ${w}. ${['The weather is sunny.','The weather is sunny.','A child wears it on the body.','A child wears them on the feet.','A child wears it on the head.'][i]} Is this right?`,['Yes','No'])))
 ]};
 const keys = doc=>doc.sections.map(s=>({label:s.label,title:s.title,answers:s.items.map(()=> 'Test key'),explanation:'',expectedResponses:[],commonErrors:[],corrections:[],teacherNotes:''}));
 data.lesson.worksheet = {title:a.title,student:a,studentB:b,teacher:{overview:'',groupWorkGuidance:'',sections:keys(a)},teacherB:keys(b)};
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 const report = [];
 try {
  for (const [studentAge,level] of [['5-7','A1'],['8-9','A1'],['5-7','A2'],['Teens','A1']]) {
   if (process.env.TEST_AGE && studentAge !== process.env.TEST_AGE) continue;
   const page = await browser.newPage({viewport:{width:1400,height:1050}});
   const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
   await page.route('**/picture-test',r=>r.fulfill({contentType:'text/html',body:preamble}));
   // The new exporter must never depend on a deleted, hashed jsPDF chunk.
   const hashedRequests=[];
   await page.route(/\/(?:assets|node_modules\/\.vite\/deps)\/jspdf[^/]*\.js/,r=>{hashedRequests.push(r.request().url());return r.fulfill({status:404,body:'Removed on deployment'});});
   let failFirst=true;const toolRequests=[];
   await page.route('**/export-tools/jspdf-4.2.1.mjs*',r=>{
    toolRequests.push(r.request().url());
    if(failFirst){failFirst=false;return r.fulfill({status:503,body:'Temporary failure'});}
    return r.continue();
   });
   await page.goto(origin+'/picture-test');
   const current={...data,request:{...data.request,studentAge,level}};
   await page.evaluate(async d=>{window.testData=d;(await import('/tests/reading-fixture.tsx')).mount(d)},current);
   await page.locator('nav').getByRole('button',{name:'Worksheet',exact:true}).click();
   const active=page.locator('section.block');
   for(const [version,count] of [['A',15],['B',5]]){
    await active.getByRole('button',{name:`Version ${version}`,exact:true}).click();
    for(const tab of ['Student','Teacher']){
     await active.getByRole('button',{name:tab,exact:true}).click();
     const images=active.locator('img[alt="Picture clue"]');
     assert.equal(await images.count(),count,`${studentAge} ${level} ${version} ${tab}`);
     await images.evaluateAll(async imgs=>{await Promise.all(imgs.map(img=>img.decode()));});
     assert.ok(await images.evaluateAll(imgs=>imgs.every(img=>img.naturalWidth===200)));
     assert.equal(await active.getByText(/Picture: (sun|rain|shirt|shoes|hat)/).count(),0);
    }
   }
   await active.getByRole('button',{name:'Student',exact:true}).click();
   if(studentAge==='8-9')await page.screenshot({path:dir+'/version-b.png',fullPage:true});
   // The first failure leaves the lesson intact; manual retry imports a fresh URL.
   const firstError=await page.evaluate(async()=>{try{await (await import('/src/lib/exports.ts')).buildStudentWorksheetPdf(window.testData.lesson,window.testData.request);return '';}catch(e){return e.message;}});
   assert.match(firstError,/Keep your lesson open/);
   await page.getByRole('button',{name:'Print / Save as PDF',exact:true}).click();
   await page.locator('iframe[title="PDF preview"]').waitFor();
   assert.match(await page.locator('iframe').getAttribute('src'),/^blob:/);
   const downloadPromise=page.waitForEvent('download');
   await page.getByRole('dialog').getByRole('button',{name:'Download PDF',exact:true}).click();
   const download=await downloadPromise;
   assert.equal(await download.failure(),null);
   if(studentAge==='8-9')await download.saveAs(dir+'/complete-lesson.pdf');
   await page.keyboard.press('Escape');
   const result=await page.evaluate(async()=>{
    const {lesson,request}=window.testData;
    const exports=await import('/src/lib/exports.ts');
    const {jsPDF}=await import('/export-tools/jspdf-4.2.1.mjs?retry=1');
    const addImage=jsPDF.API.addImage;let images=0;
    jsPDF.API.addImage=function(...args){images++;return addImage.apply(this,args)};
    const docs=[];
    for(const version of ['A','B']){
     images=0;const blob=await exports.buildStudentWorksheetPdf(lesson,request,version);
     docs.push({version,images,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))});
    }
    images=0;await exports.buildTeacherWorksheetPdf(lesson,request,'B');const teacherImages=images;
    jsPDF.API.addImage=addImage;
    const incomplete=structuredClone(lesson);incomplete.worksheet.student.sections[0].items[1].visual='';
    let missingError='';try{await exports.buildStudentWorksheetPdf(incomplete,request)}catch(e){missingError=e.message;}
    return {docs,teacherImages,missingError};
   });
   assert.equal(result.docs[0].images,15);assert.equal(result.docs[1].images,5);assert.equal(result.teacherImages,5);
   assert.match(result.missingError,/Section A item 2/);
   for(const doc of result.docs){assert.ok(Buffer.from(doc.bytes).toString().startsWith('%PDF-'));if(studentAge==='8-9')await fs.writeFile(dir+`/worksheet-${doc.version}.pdf`,Buffer.from(doc.bytes));}
   assert.ok(toolRequests[1].endsWith('?retry=1'));assert.deepEqual(hashedRequests,[]);assert.deepEqual(errors,[]);
   report.push({studentAge,level,screenPictures:{A:15,B:5},pdfPictures:{A:15,B:5},teacherPictures:5,preview:true,download:true,retry:true,missingClueBlocked:true});
   await page.close();
  }
  await fs.writeFile(dir+'/verification.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
