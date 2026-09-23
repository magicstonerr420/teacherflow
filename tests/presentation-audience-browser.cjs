const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4201';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin)&&!route.request().url().includes('/_serverFn/')&&!route.request().url().includes('/api/')?route.continue():route.abort());
  await page.route('**/audience-test',route=>route.fulfill({contentType:'text/html',body:'<html><body><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
  await page.goto(origin+'/audience-test');
  const fixture=JSON.parse(await fs.readFile('tests/young-data.json','utf8'));
  const result=await page.evaluate(async fixture=>{
   const {buildPresentationBlob}=await import('/src/lib/pptx.ts');
   const {buildPresentationTeacherGuidePdf,buildLessonPackageZip}=await import('/src/lib/exports.ts');
   const {JSZip,mount}=await import('/tests/young-fixture.tsx');
   const {picturePng}=await import('/src/lib/young-learners.ts');
   const base={number:1,title:'Our goal',layout:'content',studentText:'I can listen and do the action.',bullets:[],vocabulary:[],highlightWords:['listen'],interaction:'Ask: Can you do one action when you hear it?',teacherNote:'HIDDEN-TEACHER-ANSWER: jump.',purpose:'HIDDEN-TEACHER-PURPOSE',visualSuggestion:'HIDDEN-TEACHER-VISUAL',imagePrompt:''};
   const slides=[base,{...base,number:2,title:'Listen and do',studentText:'Listen. Do the action.',interaction:'Students act out each command with the teacher.'},{...base,number:3,title:'Say it together',studentText:'Say the word.',interaction:'Choral drill. Then one student leads one command.'},{...base,number:4,title:'Pair practice',studentText:'Work with a partner.',interaction:'Student A says a word. Student B does the action. Then switch.'},{...base,number:5,title:'Vocabulary',layout:'vocabulary',studentText:'',vocabulary:[{word:'ball',definition:'A round toy.',example:'I have a ball.',imagePrompt:'test-ball'}],interaction:'Ask students to repeat the word.'},{...base,number:6,title:'Your action',studentText:'Point to the picture.',interaction:'Tell the students to look carefully and check their answers. '.repeat(20)}];
   const lesson={...fixture.lesson,presentation:{slides},lessonPlan:{...fixture.lesson.lessonPlan,stages:[]},activity:{...fixture.lesson.activity,materials:[]},overview:{...fixture.lesson.overview,materialsNeeded:[]}};
   lesson.teacherNotes={problems:[],tips:[]};
   const original=JSON.stringify(lesson),picture=await picturePng('ball');
   const encode=async blob=>{let value='';for(const byte of new Uint8Array(await blob.arrayBuffer()))value+=String.fromCharCode(byte);return btoa(value);};
   const decks=[];
   for(const studentAge of ['5-7','13-15','Adults']){
    const request={...fixture.request,studentAge};
    const blob=await buildPresentationBlob(lesson,request,{'test-ball':picture},{omitMissingFlashcards:true});
    const zip=await JSZip.loadAsync(await blob.arrayBuffer());
    const xml=await Promise.all(Object.keys(zip.files).filter(name=>/^ppt\/.*\.xml$/.test(name)).map(name=>zip.file(name).async('string')));
    const text=xml.map(value=>[...new DOMParser().parseFromString(value,'application/xml').getElementsByTagName('a:t')].map(node=>node.textContent).join('')).join('\n');
    decks.push({age:studentAge,xml:xml.join('\n'),text,blob:await encode(blob),notes: Object.keys(zip.files).filter(name=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name))});
   }
   const request={...fixture.request,studentAge:'13-15'};
   const guide=await buildPresentationTeacherGuidePdf(lesson,request);
   const pack=await buildLessonPackageZip(lesson,request,{'test-ball':picture});
   const zip=await JSZip.loadAsync(await pack.blob.arrayBuffer());
   const ppt=pack.files.find(file=>file.name.endsWith('.pptx'));
   const packageDeck=await JSZip.loadAsync(await ppt.blob.arrayBuffer());
   const packageXml=(await Promise.all(Object.keys(packageDeck.files).filter(name=>/^ppt\/.*\.xml$/.test(name)).map(name=>packageDeck.file(name).async('string')))).join('\n');
   mount({lesson,request});
   return {decks,guide:await encode(guide),files:pack.files.map(file=>file.name),packageXml,unchanged:JSON.stringify(lesson)===original};
  },fixture);
  await fs.mkdir('.local-runtime/student-presentation-review',{recursive:true});
  for(const deck of result.decks){
   assert.doesNotMatch(deck.xml,/HIDDEN-TEACHER|Choral drill|Students act out|Ask students|Tell the students|Then one student leads|Teacher note:|Picture order, left/);
   assert.match(deck.text,/Can you do one action when you hear it\?/);
   assert.match(deck.text,/Student A says a word/);
   assert.match(deck.text,/I have a ball/);
   await fs.writeFile(`.local-runtime/student-presentation-review/${deck.age}.pptx`,Buffer.from(deck.blob,'base64'));
  }
  assert.doesNotMatch(result.packageXml,/HIDDEN-TEACHER|Choral drill|Students act out|Ask students|Tell the students/);
  assert.ok(result.files.some(name=>name.endsWith('_Presentation_Teacher_Guide.pdf')));
  const guide=Buffer.from(result.guide,'base64');
  assert.match(guide.toString('latin1'),/HIDDEN-TEACHER-ANSWER/);
  assert.match(guide.toString('latin1'),/Choral drill/);
  await fs.writeFile('.local-runtime/student-presentation-review/Teacher_Guide.pdf',guide);
  assert.equal(result.unchanged,true);
  await page.locator('[data-audience="student"]').first().waitFor();
  assert.doesNotMatch((await page.locator('[data-audience="student"]').allTextContents()).join('\n'),/HIDDEN-TEACHER|Choral drill|Students act out|Ask students|Tell the students/);
  await page.getByText('Teacher guidance — excluded from PowerPoint',{exact:true}).click();
  await page.getByText('HIDDEN-TEACHER-ANSWER: jump.',{exact:true}).first().waitFor();
  await page.getByText('Teacher guidance — excluded from PowerPoint',{exact:true}).click();
  await page.screenshot({path:'.local-runtime/student-presentation-review/preview.png',fullPage:true});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download teacher guide',exact:true}).click();
  assert.match((await download).suggestedFilename(),/_Teacher_Guide\.pdf$/);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,ages:result.decks.map(deck=>deck.age),studentOnlySlidesAndNotes:true,teacherGuideRetainsInstructions:true,guideInPackage:true,originalUnchanged:result.unchanged,realAiCalls:0}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
