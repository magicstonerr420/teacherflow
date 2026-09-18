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
  await page.route('**/src/hooks/useAuth.ts*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({isAuthenticated:true,loading:false});'}));
  await page.route('**/src/lib/beta.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:`
   export const betaMode=async()=>true;
   export const betaStatus=async()=>({enabled:true,owner:window.owner,claimed:!window.revoked,revoked:window.revoked,remaining:2,completed:0,lessons:[],budget:{limitUsd:10,remainingUsd:9.8,accountedUsd:.2,reservedUsd:0,paused:false}});
   export const claimBeta=async()=>{throw Error('Unexpected claim');};
  `}));
  await page.route('**/src/lib/beta-admin.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:`
   export async function listBetaTeachers(){window.lists++;return structuredClone(window.roster)}
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
  async function mount(owner=true,revoked=false){
   await page.goto(origin+'/beta-admin-test');
   await page.evaluate(async({owner,revoked})=>{
    window.owner=owner;window.revoked=revoked;window.lists=0;window.mutations=0;window.creates=0;window.operations={};
    window.roster={seats:[1,2,3].map(seat=>({seat,active:true,revision:'a'.repeat(64),user:seat===1?'teacher-id':null,email:seat===1?'teacher@example.test':null,label:'',claimedAt:null,lastSeenAt:null,remaining:seat===1?2:3,completed:0,code:seat===3?'fake-third-invite':null})),removed:[]};
    await (await import('/tests/beta-admin-fixture.tsx')).mount();
   },{owner,revoked});
  }
  await mount();
  const panel=page.getByRole('region',{name:'Beta teacher controls'});
  await panel.getByText('1 active teachers · 2 unused invitations',{exact:true}).waitFor();
  const first=panel.getByRole('article',{name:'Invitation 1',exact:true});
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
  assert.ok((await panel.innerText()).includes('Removed teachers (1)'));
  assert.ok((await page.getByRole('region',{name:'Owner workspace'}).innerText()).includes('$9.80 available'));
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
  assert.ok((await page.getByRole('region',{name:'Owner workspace'}).innerText()).includes('$9.80 available'));
  await page.screenshot({path:'.local-runtime/teacher-admin/ui/owner-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow on phones');
  await page.screenshot({path:'.local-runtime/teacher-admin/ui/owner-mobile.png',fullPage:true});
  await mount(false);
  await page.getByRole('region',{name:'Teacher beta access'}).waitFor();
  assert.equal(await panel.count(),0);assert.equal(await page.evaluate(()=>window.lists),0,'Teacher UI never loads private roster');
  await mount(false,true);
  await page.getByRole('status').filter({hasText:'Your beta access has been removed.'}).waitFor();
  assert.equal(await page.evaluate(()=>window.access),false);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({passed:true,checks:['owner roster','labels','confirmation','duplicate clicks','three restored invitations','recover lost response','create more keys','deactivate','reactivate','idempotent creation retry','mobile layout','teacher isolation','revoked access'],paidRequests:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
