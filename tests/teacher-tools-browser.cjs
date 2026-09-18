// Actual UI with isolated test accounts and fake server responses. No AI or live account writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3007';
const out='.local-runtime/teacher-tools';
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  const errors=[],unexpected=[];
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1080}});
    page.on('pageerror',e=>errors.push(e.message));
    await page.routeWebSocket(/.*/,s=>s.close());
    await page.route('**/_serverFn/**',r=>{unexpected.push(r.request().url());return r.abort();});
    await page.route('**/teacher-tools-test',r=>r.fulfill({contentType:'text/html',body:'<html><body><script type="module">window.process={env:{NODE_ENV:"development",TSS_SERVER_FN_BASE:"/_serverFn/"}};import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
    const module=(glob,body)=>page.route(glob,r=>r.fulfill({contentType:'application/javascript',body}));
    await module('**/src/hooks/useAuth.ts*','export const useAuth=()=>({isAuthenticated:window.testUser!=="guest",loading:false,user:window.testUser==="guest"?null:{id:window.testUser,email:window.testUser+"@example.test"}});');
    await module('**/src/integrations/supabase/client.ts*','export const supabase={auth:{async getSession(){return {data:{session:null}};},async signOut(){window.signOutCalls=(window.signOutCalls||0)+1;if(window.failSignOut)return {error:new Error("Test failure")};window.testUser="guest";return {error:null};}}};');
    await module('**/src/lib/beta.functions.ts*',`
      export const betaMode=async()=>true;
      export const betaStatus=async()=>({enabled:true,owner:window.testUser==='owner',claimed:true,remaining:2,completed:1,lessons:[],...(window.testUser==='owner'?{budget:{limitUsd:10,remainingUsd:9,accountedUsd:1,reservedUsd:0,paused:false}}:{})});
      export const claimBeta=async()=>{throw Error('Unexpected invitation claim');};`);
    await module('**/src/lib/beta-admin.functions.ts*',`
      export const listBetaTeachers=async()=>({seats:[],removed:[]});
      export const resetBetaAllowance=async()=>{throw Error('Unexpected reset');};
      export const manageBetaTeacher=async()=>{throw Error('Unexpected management write');};
      export const createBetaInvitation=async()=>{throw Error('Unexpected invitation write');};`);
    await module('**/src/lib/reading.functions.ts*',`export const regenerateReading=async()=>{throw Error('Unexpected AI call');};`);
    await module('**/src/lib/listening.functions.ts*',`export const loadListeningAudio=async()=>null;export const createListening=async()=>{throw Error('Unexpected AI call');};export const createListeningAudio=createListening;`);
    await module('**/src/lib/lesson.functions.ts*',`
      export const listLessons=async()=>window.lessons;
      export const getLesson=async({data})=>({...window.lessons.find(l=>l.id===data.id),content:window.fixture.lesson,inputs:window.fixture.request});
      export const generateLessonStage=async()=>{throw Error('Unexpected AI call');};
      export const saveLesson=generateLessonStage,updateLesson=generateLessonStage,deleteLesson=generateLessonStage,duplicateLesson=generateLessonStage,regenerateSection=generateLessonStage,repairDuplicateVersionB=generateLessonStage;`);
    await module('**/src/lib/teacher-tools.functions.ts*',`
      function read(){return JSON.parse(localStorage.getItem('test-tools')||'{}');}
      function mine(all){return all[window.testUser]??={classes:[],favorites:[],feedback:{}};}
      function save(all){localStorage.setItem('test-tools',JSON.stringify(all));}
      export async function listSavedClasses(){return mine(read()).classes;}
      export async function saveClassSettings({data}){const all=read(),s=mine(all);const id=data.id||crypto.randomUUID();const row={...data,id};s.classes=s.classes.filter(c=>c.id!==id).concat(row);save(all);return {id};}
      export async function removeSavedClass({data}){const all=read(),s=mine(all);s.classes=s.classes.filter(c=>c.id!==data.id);save(all);return {ok:true};}
      export async function listFavorites(){if(window.failFavorites)throw Error('Offline');return mine(read()).favorites;}
      export async function setLessonFavorite({data}){const all=read(),s=mine(all);s.favorites=s.favorites.filter(id=>id!==data.lessonId);if(data.active)s.favorites.push(data.lessonId);save(all);return {ok:true};}
      export async function getLessonFeedback({data}){return mine(read()).feedback[data.lessonId]||null;}
      export async function submitLessonFeedback({data}){const all=read(),s=mine(all);s.feedback[data.lessonId]={...data,topic:window.lessons.find(l=>l.id===data.lessonId).topic,level:'B1',teacher:window.testUser+'@example.test',updatedAt:new Date().toISOString()};save(all);return {ok:true};}
      export async function listTeacherFeedback(){if(window.testUser!=='owner')throw Error('Owner only');return {entries:Object.values(read()).flatMap(s=>Object.values(s.feedback)),more:false};}`);
    const fixture=JSON.parse(await fs.readFile('comparison/budget-lesson.json','utf8'));
    delete fixture.lesson.reading;delete fixture.lesson.listening;
    const lessons=[
      {id:'11111111-1111-4111-8111-111111111111',topic:'Nature and conservation',level:'B1',main_skill:'Speaking',student_age:'14-16',duration_minutes:60,created_at:'2026-09-18T12:00:00Z'},
      {id:'22222222-2222-4222-8222-222222222222',topic:'Nature stories',level:'A1',main_skill:'Reading',student_age:'8-9',duration_minutes:45,created_at:'2026-09-18T12:00:00Z'},
      {id:'33333333-3333-4333-8333-333333333333',topic:'Food',level:'A1',main_skill:'Speaking',student_age:'8-9',duration_minutes:45,created_at:'2026-09-18T12:00:00Z'},
    ];
    async function mount(path,user='teacher',failFavorites=false){
      await page.goto(origin+'/teacher-tools-test');
      await page.evaluate(async({path,user,fixture,lessons,failFavorites})=>{window.testUser=user;window.fixture=fixture;window.lessons=lessons;window.failFavorites=failFavorites;await(await import('/tests/teacher-tools-fixture.tsx')).mount(path);},{path,user,fixture,lessons,failFavorites});
    }
    await mount('/builder');
    await page.getByRole('heading',{name:'Build my class',exact:true}).waitFor();
    await page.getByRole('button',{name:'Fill the example'}).click();
    assert.equal(await page.getByText('Textbook / unit',{exact:true}).count(),0);
    await page.getByLabel('Class name',{exact:true}).fill('Monday beginners');
    await page.getByRole('button',{name:'Save as new class'}).click();
    await page.getByRole('status').filter({hasText:'Class settings saved'}).waitFor();
    const id=await page.getByLabel('Choose a saved class').inputValue();
    await mount('/builder');
    await page.getByLabel('Choose a saved class').selectOption(id);
    await page.getByRole('status').filter({hasText:'Class settings applied'}).waitFor();
    assert.equal(await page.locator('form').getByRole('combobox').nth(1).innerText(),'B1');
    assert.equal(await page.getByPlaceholder('Present Perfect',{exact:true}).inputValue(),'','Applying a class does not restore the previous lesson topic');
    await page.getByPlaceholder('Present Perfect',{exact:true}).fill('A new topic');
    await page.getByLabel('Choose a saved class').selectOption('');
    await page.getByLabel('Choose a saved class').selectOption(id);
    assert.equal(await page.getByPlaceholder('Present Perfect',{exact:true}).inputValue(),'A new topic');
    await page.getByLabel('Class name',{exact:true}).fill('Tuesday beginners');
    await page.getByRole('button',{name:'Update saved class'}).click();
    await page.getByRole('status').filter({hasText:'Class settings saved'}).waitFor();
    await page.screenshot({path:out+'/classes-desktop.png',fullPage:true});
    await mount('/builder','other-teacher');
    await page.getByRole('button',{name:'Save as new class',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('select')&&!document.querySelector('select').disabled);
    assert.equal(await page.getByLabel('Choose a saved class').locator('option').count(),1,'Another account cannot see saved classes');
    await mount('/lessons/');
    await page.getByRole('status').filter({hasText:'3 of 3 lessons'}).waitFor();
    await page.getByLabel('Search by topic').fill('nature');
    await page.getByLabel('English level',{exact:true}).selectOption('B1');
    await page.getByLabel('Main skill',{exact:true}).selectOption('Speaking');
    await page.getByRole('status').filter({hasText:'1 of 3 lessons'}).waitFor();
    await page.getByRole('button',{name:'Favorite Nature and conservation',exact:true}).click();
    await page.getByRole('button',{name:'Unfavorite Nature and conservation',exact:true}).waitFor();
    await page.getByRole('tab',{name:'Favorites',exact:true}).click();
    await page.getByRole('button',{name:'Clear filters'}).click();
    assert.equal(await page.getByRole('tab',{name:'Favorites',exact:true}).getAttribute('aria-selected'),'true','Clearing search filters keeps the selected library tab');
    await page.getByRole('status').filter({hasText:'1 of 3 lessons'}).waitFor();
    await page.screenshot({path:out+'/library-desktop.png',fullPage:true});
    await mount('/lessons/');
    await page.getByRole('button',{name:'Unfavorite Nature and conservation',exact:true}).waitFor();
    await page.getByLabel('Search by topic').fill('no such topic');
    await page.getByText('No lessons match these filters. Try another topic or clear the filters.').waitFor();
    await page.getByRole('button',{name:'Clear filters'}).click();
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:out+'/library-mobile.png',fullPage:true});
    await mount('/lessons/', 'teacher', true);
    await page.getByRole('button',{name:'Retry favorites'}).waitFor();
    assert.equal(await page.getByRole('tab',{name:'Favorites',exact:true}).isDisabled(),true);
    await page.evaluate(()=>window.failFavorites=false);await page.getByRole('button',{name:'Retry favorites'}).click();
    await page.getByRole('button',{name:'Unfavorite Nature and conservation',exact:true}).waitFor();
    await mount('/lessons/'+lessons[0].id);
    await page.getByRole('button',{name:'Give lesson feedback'}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByLabel('Not yet',{exact:true}).check();await dialog.getByLabel('A little',{exact:true}).check();
    await dialog.getByLabel('What should we improve? (optional)').fill('More pair-work examples, please.');
    await dialog.getByRole('button',{name:'Send feedback'}).click();
    await dialog.waitFor({state:'hidden'});
    await mount('/lessons/'+lessons[0].id);
    await page.getByRole('button',{name:'Give lesson feedback'}).click();
    await dialog.getByRole('button',{name:'Update feedback'}).waitFor();
    assert.equal(await dialog.getByLabel('What should we improve? (optional)').inputValue(),'More pair-work examples, please.');
    await dialog.getByLabel('Yes',{exact:true}).check();await dialog.getByLabel('None',{exact:true}).check();
    await page.screenshot({path:out+'/feedback-mobile.png'});
    assert.equal(await dialog.evaluate(e=>e.getBoundingClientRect().right<=innerWidth&&e.getBoundingClientRect().bottom<=innerHeight),true);
    await dialog.getByRole('button',{name:'Update feedback'}).click();await dialog.waitFor({state:'hidden'});
    await mount('/beta-management','owner');
    await page.getByRole('region',{name:'Teacher lesson feedback'}).getByText('More pair-work examples, please.').waitFor();
    assert.equal(await page.getByRole('region',{name:'Teacher lesson feedback'}).getByRole('article').count(),1);
    await page.setViewportSize({width:1440,height:1080});
    await page.screenshot({path:out+'/owner-feedback.png',fullPage:true});
    await mount('/beta-management','teacher');
    await page.getByText('This page is only available to the beta owner.').waitFor();
    assert.equal(await page.getByRole('region',{name:'Teacher lesson feedback'}).count(),0);
    await mount('/builder');await page.getByLabel('Choose a saved class').selectOption(id);
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Remove saved class'}).click();
    await page.getByRole('status').filter({hasText:'Saved class removed'}).waitFor();
    await mount('/lessons/');await page.getByRole('button',{name:'Unfavorite Nature and conservation',exact:true}).click();
    await page.getByRole('button',{name:'Favorite Nature and conservation',exact:true}).waitFor();
    await mount('/about');
    await page.getByRole('heading',{name:'Practical lesson preparation for English teachers.'}).waitFor();
    await page.screenshot({path:out+'/about-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:out+'/about-mobile.png',fullPage:true});
    // Navigation covers guest, teacher and owner, plus desktop keyboard and mobile behavior.
    await page.setViewportSize({width:1440,height:1000});
    await mount('/about','teacher');
    const nav=page.getByRole('navigation',{name:'Main navigation'});
    await nav.getByRole('button',{name:'Account',exact:true}).waitFor();
    assert.deepEqual(await nav.getByRole('link').allTextContents(),['Lesson builder','My lessons','Quick-start guide','About us']);
    assert.equal(await nav.getByRole('button',{name:'Admin',exact:true}).count(),0);
    await nav.getByRole('button',{name:'Account',exact:true}).focus();await page.keyboard.press('Enter');
    const account=page.getByRole('menu',{name:'Account',exact:true});
    await account.waitFor();
    assert.deepEqual(await account.getByRole('menuitem').allTextContents(),['My profile','Set/change password','Sign out']);
    await page.keyboard.press('Escape');
    assert.equal(await nav.getByRole('button',{name:'Account',exact:true}).evaluate(e=>e===document.activeElement),true);
    await nav.getByRole('button',{name:'Account',exact:true}).click();
    await account.getByRole('menuitem',{name:'Set/change password',exact:true}).click();
    await page.getByRole('heading',{name:'Account access'}).waitFor();
    assert.equal(await page.evaluate(()=>window.testRouter.state.location.search.password),true);
    await mount('/about','owner');
    await nav.getByRole('button',{name:'Admin',exact:true}).click();
    const admin=page.getByRole('menu',{name:'Admin',exact:true});
    await admin.getByRole('menuitem',{name:'Teacher feedback',exact:true}).click();
    await page.getByRole('heading',{name:'Teacher lesson feedback',exact:true}).waitFor();
    await page.waitForFunction(()=>document.activeElement?.id==='feedback');
    await nav.getByRole('button',{name:'Admin',exact:true}).click();
    await admin.getByRole('menuitem',{name:'Lesson allowances',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.id==='lesson-allowances');
    await nav.getByRole('button',{name:'Admin',exact:true}).click();
    await admin.getByRole('menuitem',{name:'Beta budget',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.id==='budget');
    await page.screenshot({path:out+'/navigation-owner-desktop.png',animations:'disabled'});
    await page.setViewportSize({width:1024,height:768});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Desktop header fits its breakpoint');
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    const drawer=page.getByRole('dialog',{name:'Menu',exact:true});
    await drawer.getByRole('heading',{name:'Account',exact:true}).waitFor();
    await drawer.getByRole('heading',{name:'Admin',exact:true}).waitFor();
    await page.screenshot({path:out+'/navigation-owner-mobile.png',animations:'disabled'});
    await drawer.getByRole('link',{name:'Teachers & invitations',exact:true}).click();
    await drawer.waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.activeElement?.id==='teachers');
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    await drawer.getByRole('link',{name:'My lessons',exact:true}).click();
    await drawer.waitFor({state:'hidden'});
    await page.getByRole('heading',{name:'My lessons',exact:true}).waitFor();
    await mount('/about','teacher');
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    assert.equal(await drawer.getByRole('heading',{name:'Admin',exact:true}).count(),0);
    await page.screenshot({path:out+'/navigation-teacher-mobile.png',animations:'disabled'});
    await page.keyboard.press('Escape');
    await drawer.waitFor({state:'hidden'});
    assert.equal(await page.getByRole('button',{name:'Menu',exact:true}).evaluate(e=>e===document.activeElement),true);
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    await page.setViewportSize({width:1440,height:1000});
    await drawer.waitFor({state:'hidden'});
    await nav.getByRole('button',{name:'Account',exact:true}).click();
    await page.evaluate(()=>window.failSignOut=true);
    await account.getByRole('menuitem',{name:'Sign out',exact:true}).click();
    await page.getByText('Could not sign out. Please try again.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.testUser),'teacher');
    await page.evaluate(()=>window.failSignOut=false);
    await nav.getByRole('button',{name:'Account',exact:true}).click();
    await account.getByRole('menuitem',{name:'Sign out',exact:true}).click();
    await page.getByRole('heading',{name:'Home',exact:true}).waitFor();
    await nav.getByRole('link',{name:'Sign in',exact:true}).waitFor();
    assert.equal(await nav.getByRole('button',{name:'Account',exact:true}).count(),0);
    assert.equal(await nav.getByRole('button',{name:'Admin',exact:true}).count(),0);
    assert.equal(await nav.getByRole('link',{name:'My lessons',exact:true}).count(),0);
    await page.setViewportSize({width:320,height:640});
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    await drawer.getByRole('link',{name:'Sign in',exact:true}).waitFor();
    assert.equal(await drawer.getByRole('heading',{name:'Account',exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
    console.log('PASS: teacher tools, All lessons/Favorites tabs, guest/teacher/owner navigation, keyboard menus, password link, Admin anchors, mobile menu and focus, sign-out failure/retry; no live writes or AI calls.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
