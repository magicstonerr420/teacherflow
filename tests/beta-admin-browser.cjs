// Isolated UI and fake server responses. No invitation or provider calls leave the test browser.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3003';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const errors=[],unexpected=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.routeWebSocket(/.*/,s=>s.close());
  await page.route('**/_serverFn/**',r=>{unexpected.push(r.request().url());return r.abort()});
  await page.route('**/beta-admin-test',r=>r.fulfill({contentType:'text/html',body:'<html><body><script type="module">window.process={env:{NODE_ENV:"development",TSS_SERVER_FN_BASE:"/_serverFn/"}};import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
  await page.route('**/src/hooks/useAuth.ts*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({isAuthenticated:!window.signedOut,loading:false,user:window.signedOut?null:window.profileUser});'}));
  await page.route('**/src/integrations/supabase/client.ts*',r=>r.fulfill({contentType:'application/javascript',body:`export const supabase={auth:{
   async getUser(){return {data:{user:structuredClone(window.profileUser)},error:null};},
   async updateUser(attributes){window.profileWrites++;window.profilePayload=attributes;await new Promise(r=>setTimeout(r,150));if(window.failProfile){window.failProfile=false;return {data:{user:null},error:{message:'Profile save test failure'}};}Object.assign(window.profileUser.user_metadata,attributes.data);return {data:{user:structuredClone(window.profileUser)},error:null};},
   async signOut(){},async getSession(){return {data:{session:null}};}
  }};`}));
  await page.route('**/src/lib/beta.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:`
   export const betaMode=async()=>true;
   export const betaStatus=async()=>({enabled:true,owner:window.owner,claimed:!window.revoked,revoked:window.revoked,remaining:2,completed:0,lessons:[],budget:{limitUsd:10,remainingUsd:9.8,accountedUsd:.2,reservedUsd:0,paused:false}});
   export const claimBeta=async()=>{throw Error('Unexpected claim');};
  `}));
  await page.route('**/src/lib/beta-admin.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:`
   export async function listBetaTeachers(){window.lists++;return structuredClone(window.roster)}
   export async function resetBetaAllowance({data}){
    window.resets++;await new Promise(r=>setTimeout(r,150));
    if(!window.operations[data.operation]){window.operations[data.operation]=true;const seat=window.roster.seats[data.seat-1];seat.remaining=3;seat.completed=0;seat.allowanceRevision='b'.repeat(64);}
    if(window.loseResponse){window.loseResponse=false;throw Error('Reset response interrupted. Retry safely.');}
    return structuredClone(window.roster);
   }
   export async function createBetaInvitation({data}){
    window.creates++;await new Promise(r=>setTimeout(r,150));
    if(!window.operations[data.operation]){
     window.operations[data.operation]=true;
     window.roster.seats.push({seat:window.roster.seats.length+1,active:true,revision:'c'.repeat(64),user:null,email:null,label:'',claimedAt:null,lastSeenAt:null,remaining:3,completed:0,code:'fake-new-invite'});
    }
    if(window.loseResponse){window.loseResponse=false;throw Error('Creation response interrupted. Retry safely.');}
    return structuredClone(window.roster);
   }
   export async function manageBetaTeacher({data}){
    window.mutations++;await new Promise(r=>setTimeout(r,150));
    const seat=window.roster.seats[data.seat-1];
    if(data.revision!==seat.revision || data.user!==seat.user)throw Error('This invitation changed. Refresh the teacher list before trying again.');
    if(data.action==='label')seat.label=data.label;
    else{
     if(seat.user)window.roster.removed.push({user:seat.user,email:seat.email,revokedAt:new Date().toISOString(),savedLessons:1});
     Object.assign(seat,{active:data.action!=='deactivate',revision:'b'.repeat(64),user:null,email:null,label:'',completed:0,remaining:3,code:data.action==='deactivate'?null:'fake-replacement-link'});
    }
    if(window.loseResponse){window.loseResponse=false;throw Error('Response interrupted. Refresh to check teacher access.');}
    return structuredClone(window.roster);
   }
  `}));
  await page.route('**/src/lib/teacher-tools.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:'export const listTeacherFeedback=async()=>({entries:[],more:false});'}));
  await page.route('**/src/lib/management.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:`
   export const loadManagement=async()=>({operations:[],teachers:[],lessons:[],notes:[],audit:[],history:[],budget:{limitUsd:10,remainingUsd:9.8,accountedUsd:.2,reservedUsd:0,paused:false},spending:[],settings:{emailEnabled:false,dailySummary:false},email:{configured:false,to:'owner@example.test',missing:['RESEND_API_KEY','TEACHERFLOW_ALERT_FROM']},alerts:[]});
   export const manageGeneration=async()=>{throw Error('Unexpected generation-management write');};
   export const saveSupportNote=manageGeneration,saveManagementNotifications=manageGeneration;
  `}));
  async function mount(owner=true,revoked=false,path='/beta-management#teachers',signedOut=false){
   await page.goto(origin+'/beta-admin-test');
   await page.evaluate(async({owner,revoked,path,signedOut})=>{
    window.owner=owner;window.revoked=revoked;window.signedOut=signedOut;window.profileWrites=0;window.profileUser={id:owner?'owner-id':'teacher-id',email:'teacher@example.test',user_metadata:{full_name:'Test Teacher'}};window.lists=0;window.mutations=0;window.creates=0;window.resets=0;window.operations={};
    window.roster={seats:[1,2,3].map(seat=>({seat,active:true,revision:'a'.repeat(64),allowanceRevision:'a'.repeat(64),pending:0,user:seat===1?'teacher-id':null,email:seat===1?'teacher@example.test':null,label:'',claimedAt:null,lastSeenAt:null,remaining:seat===1?2:3,completed:0,code:seat===3?'fake-third-invite':null})),removed:[]};
    await (await import('/tests/beta-admin-fixture.tsx')).mount(path);
   },{owner,revoked,path,signedOut});
  }
  await mount();
  await page.getByRole('heading',{name:'Management',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Management',exact:true}).waitFor();
  assert.ok((await page.getByRole('region',{name:'Sharing invitations'}).innerText()).includes('WhatsApp'));
  const panel=page.getByRole('region',{name:'Beta teacher controls'});
  await panel.getByText('1 active teachers · 2 unused invitations',{exact:true}).waitFor();
  const first=panel.getByRole('article',{name:'Invitation 1',exact:true});
  await page.evaluate(()=>window.loseResponse=true);
  await first.getByRole('button',{name:'Reset lesson allowance',exact:true}).evaluate(button=>{button.click();button.click();});
  await panel.getByRole('alert').filter({hasText:'Reset response interrupted'}).waitFor();
  assert.equal(await page.evaluate(()=>window.resets),1,'Double click sends one reset');
  await first.getByRole('button',{name:'Retry allowance reset',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'Lesson allowance reset to three'}).waitFor();
  await first.getByText('0 lessons completed · 3 new lesson slots left').waitFor();
  assert.equal(await first.getByRole('button',{name:'Reset lesson allowance',exact:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.roster.seats[0].user),'teacher-id');
  await first.getByLabel('Private label').fill('Ms. Rivera');await first.getByRole('button',{name:'Save label'}).click();
  await panel.getByRole('status').filter({hasText:'Invitation label saved.'}).waitFor();
  await first.getByRole('button',{name:'Remove access',exact:true}).click();
  const confirm=panel.getByRole('group',{name:'Confirm invitation change'});
  await confirm.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.mutations),1,'Cancel cannot remove access');
  await first.getByRole('button',{name:'Remove access',exact:true}).click();
  await confirm.getByRole('button',{name:'Remove access & replace invitation',exact:true}).evaluate(button=>{button.click();button.click()});
  await panel.getByText('0 active teachers · 3 unused invitations',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.mutations),2,'Double click triggers only one mutation');
  assert.match(await first.getByLabel('Invitation 1 link').inputValue(),/\/builder#invite=fake-replacement-link$/);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedInvitation=text;}}}));
  await first.getByRole('button',{name:'Copy invitation link',exact:true}).click();
  assert.match(await page.evaluate(()=>window.copiedInvitation),/\/builder#invite=fake-replacement-link$/);
  assert.ok((await panel.innerText()).includes('Removed teachers (1)'));
  await page.getByRole('tab',{name:'Budget',exact:true}).click();
  await page.getByRole('region',{name:'Beta budget'}).getByText('$9.80',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Teachers',exact:true}).click();
  await panel.getByText('0 active teachers · 3 unused invitations',{exact:true}).waitFor();
  await fs.mkdir('.local-runtime/teacher-admin/ui',{recursive:true});
  await page.screenshot({path:'.local-runtime/teacher-admin/ui/owner-desktop.png',fullPage:true});
  // Recover a successful rotation even if the response is lost.
  const second=panel.getByRole('article',{name:'Invitation 2',exact:true});
  await second.getByRole('button',{name:'Replace invitation link'}).click();
  await page.evaluate(()=>window.loseResponse=true);
  await confirm.getByRole('button',{name:'Confirm replacement'}).click();
  await panel.getByRole('alert').waitFor();
  await panel.getByRole('button',{name:'Refresh teachers'}).click();
  await second.getByRole('button',{name:'Copy invitation link'}).waitFor();
  assert.equal(await page.evaluate(()=>window.mutations),3,'Refresh recovers link without another rotation');
  // Additional keys and deactivation keep the same shared budget and can recover lost creation responses.
  await panel.getByRole('button',{name:'Create invitation',exact:true}).evaluate(button=>{button.click();button.click()});
  await panel.getByText('0 active teachers · 4 unused invitations',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.creates),1);
  const fourth=panel.getByRole('article',{name:'Invitation 4',exact:true});
  await fourth.getByRole('button',{name:'Deactivate key'}).click();
  await confirm.getByRole('button',{name:'Confirm deactivation'}).click();
  await panel.getByText('0 active teachers · 3 unused invitations · 1 deactivated',{exact:true}).waitFor();
  assert.equal(await fourth.getByRole('button',{name:'Copy invitation link'}).count(),0);
  await fourth.getByRole('button',{name:'Activate with new link'}).click();
  await confirm.getByRole('button',{name:'Confirm replacement'}).click();
  await panel.getByText('0 active teachers · 4 unused invitations',{exact:true}).waitFor();
  await page.evaluate(()=>window.loseResponse=true);
  await panel.getByRole('button',{name:'Create invitation',exact:true}).click();
  await panel.getByRole('alert').waitFor();
  await panel.getByRole('button',{name:'Retry create invitation'}).click();
  await panel.getByText('0 active teachers · 5 unused invitations',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.roster.seats.length),5,'Creation retry recovers same invitation');
  await page.getByRole('tab',{name:'Budget',exact:true}).click();
  await page.getByRole('region',{name:'Beta budget'}).getByText('$9.80',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Teachers',exact:true}).click();
  await panel.getByText('0 active teachers · 5 unused invitations',{exact:true}).waitFor();
  await page.screenshot({path:'.local-runtime/teacher-admin/ui/owner-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow on phones');
  await page.screenshot({path:'.local-runtime/teacher-admin/ui/owner-mobile.png',fullPage:true});
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  async function go(name,group){
   if(await page.getByRole('button',{name:'Menu',exact:true}).isVisible()){
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    await page.getByRole('dialog',{name:'Menu',exact:true}).getByRole('link',{name,exact:true}).click();
   }else if(group){
    await nav.getByRole('button',{name:group,exact:true}).click();
    await page.getByRole('menu',{name:group,exact:true}).getByRole('menuitem',{name,exact:true}).click();
   }else await nav.getByRole('link',{name,exact:true}).click();
  }
  await go('Lesson builder');
  await page.getByRole('region',{name:'Owner workspace'}).waitFor();
  assert.equal(await panel.count(),0,'Builder contains no teacher management form');
  assert.equal(await page.getByRole('button',{name:'Create invitation',exact:true}).count(),0);
  await go('Teachers & invitations','Management');
  await panel.getByText('0 active teachers · 5 unused invitations',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.testRouter.state.location.pathname),'/beta-management');
  // Profiles are available to teachers as well as the owner, and save only profile fields.
  await go('My profile','Account');
  const profile=page.getByRole('form',{name:'My profile details'});
  await profile.getByLabel('Full name',{exact:true}).waitFor();
  await profile.getByLabel('Full name',{exact:true}).fill('María Rivera');
  await profile.getByLabel('School or organization (optional)').fill('Escuela Norte');
  await profile.getByLabel('Teaching role (optional)').fill('English teacher');
  await profile.getByLabel('About me (optional)').fill('I teach beginner classes.');
  await profile.getByRole('button',{name:'Save profile',exact:true}).evaluate(button=>{button.click();button.click()});
  await profile.getByRole('status').filter({hasText:'Profile saved.'}).waitFor();
  assert.equal(await page.evaluate(()=>window.profileWrites),1,'Repeated save clicks make only one update');
  assert.deepEqual(Object.keys(await page.evaluate(()=>window.profilePayload)),['data']);
  assert.ok(await profile.getByLabel('Account email').getAttribute('readonly')!==null);
  await profile.getByLabel('Full name',{exact:true}).fill('Unsaved change');
  await page.evaluate(()=>window.failProfile=true);
  await profile.getByRole('button',{name:'Save profile',exact:true}).click();
  await profile.getByRole('alert').waitFor();
  assert.equal(await profile.getByLabel('Full name',{exact:true}).inputValue(),'Unsaved change');
  assert.equal(await profile.getByRole('status').count(),0,'Failed save cannot show a saved message');
  await go('Lesson builder');
  await go('My profile','Account');
  await page.waitForFunction(()=>document.querySelector('input[autocomplete="name"]')?.value==='María Rivera');
  assert.equal(await profile.getByLabel('School or organization (optional)').inputValue(),'Escuela Norte');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Profile navigation fits mobile');
  await page.screenshot({path:'.local-runtime/teacher-admin/ui/profile-mobile.png',fullPage:true});
  await mount(false,false,'/builder');
  await page.getByRole('region',{name:'Teacher beta access'}).waitFor();
  assert.equal(await panel.count(),0);assert.equal(await page.evaluate(()=>window.lists),0,'Teacher UI never loads private roster');
  assert.equal(await nav.getByRole('button',{name:'Management',exact:true}).count(),0);
  await go('My profile','Account');
  await profile.getByLabel('Full name',{exact:true}).waitFor();
  await mount(false,false,'/beta-management');
  await page.getByRole('status').filter({hasText:'This page is only available to the beta owner.'}).waitFor();
  assert.equal(await panel.count(),0);assert.equal(await page.evaluate(()=>window.lists),0,'Direct teacher visits cannot load the roster');
  await mount(false,false,'/profile',true);
  const signIn=page.getByRole('link',{name:'Sign in to My profile'});
  await signIn.waitFor();assert.match(await signIn.getAttribute('href'),/redirect=%2Fprofile/);
  assert.equal(await profile.count(),0);
  await mount(false,true,'/builder');
  await page.getByRole('status').filter({hasText:'Your beta access has been removed.'}).waitFor();
  assert.equal(await page.evaluate(()=>window.access),false);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({passed:true,checks:['separate management page','owner navigation','copy invitation link','owner roster','labels','confirmation','duplicate clicks','three restored invitations','recover lost response','create more keys','deactivate','reactivate','idempotent creation retry','profile saving','failed profile save','profile reopening','mobile layout','teacher isolation','signed-out profile guard','revoked access'],paidRequests:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
