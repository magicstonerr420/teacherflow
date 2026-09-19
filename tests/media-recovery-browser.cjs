// Fault injection against real React panels and PPTX exporter; no provider calls.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3008';
const dir='.local-runtime/media-recovery';
(async()=>{
 await fs.mkdir(dir,{recursive:true});
 const data=JSON.parse(await fs.readFile('comparison/budget-lesson.json','utf8'));
 data.request={...data.request,topic:'The Future of Society',studentAge:'Adults',level:'C2',technologyAvailable:'Full technology (internet, devices, audio)'};
 const generated=JSON.parse(await fs.readFile(process.env.TEST_GENERATION||'.local-runtime/rate-limits/generation.json','utf8')).results;
 const script={...generated.listening,fingerprint:'f'.repeat(64)};
 const audioUrl='data:audio/mpeg;base64,'+(await fs.readFile(process.env.TEST_AUDIO||'.local-runtime/listening-review/browser-recording.mp3')).toString('base64');
 const gateway='<!DOCTYPE html><html><title>502</title><style>'+('font-face data:base64,FAKE '.repeat(2000))+'</style></html>';
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2xQAAAABJRU5ErkJggg==';
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],unexpected=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.routeWebSocket(/.*/,s=>s.close());
  await page.route('**/_serverFn/**',r=>{unexpected.push(r.request().url());return r.abort();});
  await page.route('**/media-test',r=>r.fulfill({contentType:'text/html',body:'<html><body><script type="module">window.process={env:{NODE_ENV:"development",TSS_SERVER_FN_BASE:"/_serverFn/"}};import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
  await page.route('**/src/lib/beta.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:'export async function betaStatus(){return {enabled:true,owner:false,claimed:true}}'}));
  await page.route('**/src/lib/reading.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:`export async function regenerateReading({data}){window.operations.push(data.operation);if(window.readingFailures-->0)throw Error(window.gateway);return window.readingResult;}`}));
  await page.route('**/src/lib/listening.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:`
   export async function createListening(){window.scriptCalls++;return window.script;}
   export async function createListeningAudio({data}){window.audioRequests.push(data);if(window.audioMode==='permanent'||window.audioRequests.length===1)throw Error(window.gateway);if(window.audioRequests.length===2)throw Error('This lesson recording is already running. Wait, then load the saved recording.');return {audio:{id:'a'.repeat(64),choice:'standard',mime:'audio/mpeg',accent:'en-US'},dataUrl:window.audioUrl};}
   export async function loadListeningAudio(){return {dataUrl:window.audioUrl};}
  `}));
  await page.route('**/src/integrations/supabase/client.ts*',r=>r.fulfill({contentType:'application/javascript',body:'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"test",user:{id:"teacher"}}}})}};'}));
  async function mount(lesson){
   await page.goto(origin+'/media-test');
   await page.evaluate(async args=>{Object.assign(window,args);window.operations=[];window.audioRequests=[];window.scriptCalls=0;window.readingFailures=0;window.audioMode='recover';await(await import('/tests/reading-fixture.tsx')).mount(args.data);},{data:{request:data.request,lesson},gateway,script,audioUrl,readingResult:generated.reading});
  }
  const lesson={...data.lesson,listening:script};delete lesson.reading;
  await mount(lesson);
  const nav=page.locator('nav'),active=page.locator('section.block');
  await nav.getByRole('button',{name:'Listening',exact:true}).click();
  await active.getByRole('button',{name:'Generate recording',exact:true}).click();
  await active.locator('audio').waitFor({timeout:20000});
  const recording=await page.evaluate(()=>({calls:window.audioRequests,scriptCalls:window.scriptCalls}));
  assert.equal(recording.calls.length,3);assert.equal(recording.scriptCalls,0);
  assert.deepEqual(recording.calls[0],recording.calls[2]);assert.equal(await active.getByRole('alert').count(),0);
  await page.waitForFunction(()=>Number.isFinite(document.querySelector('audio')?.duration));
  const duration=await active.locator('audio').evaluate(a=>a.duration);assert.ok(duration>60);
  await nav.getByRole('button',{name:'Reading',exact:true}).click();
  await page.evaluate(()=>{window.readingFailures=3;});
  await active.getByRole('button',{name:'Generate reading activity',exact:true}).click();
  await active.getByRole('alert').waitFor({timeout:20000});
  assert.doesNotMatch(await active.getByRole('alert').innerText(),/DOCTYPE|base64|font-face/);
  await active.getByRole('button',{name:'Generate reading activity',exact:true}).click();
  await active.getByRole('article',{name:'Reading passage'}).waitFor();
  const operations=await page.evaluate(()=>window.operations);assert.equal(operations.length,4);assert.equal(new Set(operations).size,1,'Manual recovery retains the reading operation');
  await mount(lesson);
  await page.evaluate(()=>{window.audioMode='permanent';});
  await nav.getByRole('button',{name:'Listening',exact:true}).click();
  await active.getByRole('button',{name:'Generate recording',exact:true}).click();
  await active.getByRole('alert').waitFor({timeout:20000});
  const alert=await active.getByRole('alert').innerText();assert.ok(alert.length<300);assert.match(alert,/recording.*interrupted/);assert.doesNotMatch(alert,/DOCTYPE|base64|font-face/);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:dir+'/safe-listening-error-mobile.png',fullPage:true});
  let paidRequests=0,polls=0;
  await page.route('**/api/generate-image',async route=>{
   const body=route.request().postDataJSON();
   if(body.recoverOnly){polls++;return route.fulfill({contentType:'application/json',body:JSON.stringify(polls===1?{pending:true}:{pending:false,dataUrl:image})});}
   paidRequests++;return route.fulfill({status:502,contentType:'text/html',body:gateway});
  });
  const ppt=await page.evaluate(async data=>{
   const {generateSlideImages,buildPresentationBlob}=await import('/src/lib/pptx.ts');
   const images=await generateSlideImages(['future society image'],data.request);
   const again=await generateSlideImages(['future society image'],data.request);
   const lesson=structuredClone(data.lesson);lesson.overview.topic=data.request.topic;
   lesson.presentation.slides=[{...lesson.presentation.slides[0],layout:'content',title:data.request.topic,studentText:'Compare different forecasts and their consequences.',bullets:[],vocabulary:[],imagePrompt:'future society image'}];
   const blob=await buildPresentationBlob(lesson,data.request,images,{omitMissingFlashcards:true});
   return {cached:JSON.stringify(images)===JSON.stringify(again),bytes:blob.size,type:blob.type};
  },data);
  assert.equal(paidRequests,1);assert.equal(polls,2);assert.equal(ppt.cached,true);assert.ok(ppt.bytes>10000);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  const result={passed:true,recordingRecovered:true,scriptRegenerations:0,readingOperationPreserved:true,htmlHidden:true,mobileFits:true,imagePaidRequests:paidRequests,imageReadOnlyPolls:polls,pptx:ppt,duration};
  await fs.writeFile(dir+'/browser-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
