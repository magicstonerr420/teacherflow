const {chromium}=require('C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const p=await b.newPage({viewport:{width:1400,height:1000}});
  p.on('pageerror',e=>console.log('Browser error:',e.message));
  await p.route('**/reading-test',r=>r.fulfill({contentType:'text/html',body:'<html><body><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
  const data=JSON.parse(await fs.readFile('comparison/budget-lesson.json','utf8'));
  await p.route('**/src/lib/reading.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:`export async function regenerateReading(){window.readingCalls=(window.readingCalls||0)+1;return window.nextReading}` }));
  await p.goto('http://127.0.0.1:3000/reading-test');
  await p.evaluate(async data=>{
   const {applyReading}=await import('/src/lib/reading.ts');
   const state={status:'ready',fingerprint:'test',value:{cefr:'A1',title:'Our shared books',purpose:'scan for information',word_count:13,text:'Ana has a book. She reads in the park. Ben plays with friends.',instructions:'Read and find the place.',questions:[{type:'scanning',question:'Where does Ana read?',choices:[]}],answers:['SECRET-TEACHER-ANSWER'],activity:'Find a place in the text.',assessment:'Find the place in a new short text.'}};
   data.lesson=applyReading(data.lesson,state);window.fixture=data;window.nextReading={...state,value:{...state.value,title:'New reading title'}};
   const {mount}=await import('/tests/reading-fixture.tsx');mount(data);
  },data);
  const nav=p.locator('nav');
  await nav.getByRole('button',{name:'Worksheet',exact:true}).click();
  const active=p.locator('section.block');
  await active.getByText('SECRET-TEACHER-ANSWER',{exact:true}).first().waitFor();
  await active.getByRole('button',{name:'Student',exact:true}).click();
  assert.equal(await active.getByText('SECRET-TEACHER-ANSWER',{exact:true}).count(),0);
  await active.getByText('Ana has a book.',{exact:false}).first().waitFor();
  await active.getByRole('button',{name:'Preview / Print Student Worksheet',exact:true}).click();
  const dialog=p.getByRole('dialog');await dialog.waitFor();
  assert.equal(await dialog.getByText('SECRET-TEACHER-ANSWER',{exact:true}).count(),0);
  await p.evaluate(async()=>{const {studentPdf}=await import('/src/lib/exports.ts');await studentPdf(window.fixture.lesson.worksheet.student,window.fixture.request,'');});
  const download=p.waitForEvent('download');await dialog.getByRole('button',{name:'Download printable PDF'}).click();
  await (await download).saveAs('../../work/phase1-student.pdf');
  await p.keyboard.press('Escape');
  await active.getByRole('button',{name:'Answer Key',exact:true}).click();
  await active.getByRole('button',{name:'Preview / Print Answer Key',exact:true}).click();
  await dialog.getByText('SECRET-TEACHER-ANSWER',{exact:false}).first().waitFor();
  const keyDownload=p.waitForEvent('download');await dialog.getByRole('button',{name:'Download printable PDF'}).click();
  await (await keyDownload).saveAs('../../work/phase1-teacher.pdf');await p.keyboard.press('Escape');
  await active.getByRole('button',{name:'Version B',exact:true}).click();
  await active.getByText('SECRET-TEACHER-ANSWER',{exact:false}).first().waitFor();
  await p.getByRole('button',{name:'Regenerate reading only',exact:true}).click();
  await p.waitForFunction(()=>window.readingSaved?.reading?.value?.title==='New reading title');
  assert.equal(await p.evaluate(()=>window.readingCalls),1);
  const unchanged=await p.evaluate(()=>['presentation','assessment','supportVersion','challengeVersion','versionB'].every(k=>JSON.stringify(window.fixture.lesson[k])===JSON.stringify(window.readingSaved[k])));assert.ok(unchanged);
  await p.evaluate(()=>{window.nextReading={status:'failed',error:'DeepSeek timed out: reading only.'}});
  await p.getByRole('button',{name:'Regenerate reading only',exact:true}).click();
  await p.getByRole('alert').filter({hasText:'DeepSeek timed out'}).waitFor();
  assert.equal(await p.evaluate(()=>window.readingSaved.reading.value.title),'New reading title');
  for(const label of ['Presentation','Assessment','Version B','Support Version','Challenge Version']){await nav.getByRole('button',{name:label,exact:true}).click();assert.ok((await p.locator('section.block').innerText()).length>30);}
  await nav.getByRole('button',{name:'Worksheet',exact:true}).click();
  await p.locator('section.block').getByRole('button',{name:'Edit',exact:true}).click();
  await p.getByRole('button',{name:'Save Changes',exact:true}).click();
  const exports=await p.evaluate(async()=>{
   const {buildPresentationBlob}=await import('/src/lib/pptx.ts');
   const {default:JSZip}=await import('/node_modules/.vite/deps/jszip.js');
   const {lesson,request}=window.readingSaved?{lesson:window.readingSaved,request:window.fixture.request}:window.fixture;
   const blob=await buildPresentationBlob(lesson,request,{});const zip=await JSZip.loadAsync(await blob.arrayBuffer());
   return {bytes:blob.size,slides:Object.keys(zip.files).filter(x=>/^ppt\/slides\/slide\d+\.xml$/.test(x)).length};
  });assert.ok(exports.bytes>10000&&exports.slides>0);
  await p.screenshot({path:'../../work/phase1-reading-browser.png',fullPage:false});
  console.log('Reading teacher/student A/B, answer hiding, both print previews and PDF downloads, edit, reading-only regeneration, failed regeneration retaining text, support/core/challenge, and PPTX export passed.',exports);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
