// Browser-only account and server-function mocks. No real beta invitations are claimed.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4193';
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  const errors=[],unexpected=[];
  try{
    const page=await browser.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.routeWebSocket(/.*/,socket=>socket.close());
    await page.route('**/_serverFn/**',route=>{unexpected.push(route.request().url());return route.abort();});
    await page.route('**/beta-loading-test*',route=>route.fulfill({contentType:'text/html',body:'<html><body><script type="module">window.process={env:{NODE_ENV:"development",TSS_SERVER_FN_BASE:"/_serverFn/"}};import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
    await page.route('**/src/hooks/useAuth.ts*',route=>route.fulfill({contentType:'application/javascript',body:"export function useAuth(){return {isAuthenticated:true,loading:false,error:null,retry(){},user:{id:'teacher-test'}}}"}));
    await page.route('**/src/components/AppShell.tsx*',route=>route.fulfill({contentType:'application/javascript',body:"import {useBetaStatus} from '/src/hooks/useBetaStatus.ts';export function AppShell({children}){useBetaStatus();return children;}"}));
    await page.route('**/src/lib/beta.functions.ts*',route=>route.fulfill({contentType:'application/javascript',body:`
      export async function betaMode(){window.modeReads++;return true;}
      export async function betaStatus(){window.statusReads++;await new Promise(resolve=>setTimeout(resolve,25));if(window.failStatus)throw Error('Access unavailable');return {enabled:true,owner:false,claimed:window.claimed,remaining:3,completed:0,lessons:[]};}
      export async function claimBeta(){window.claimWrites++;window.claimed=true;return {ok:true};}
    `}));
    async function mount(options={}){
      await page.goto(origin+'/beta-loading-test'+(options.invite?'#invite=mock-invitation':''));
      await page.evaluate(async options=>{
        localStorage.removeItem('teacherflow-beta-invite');
        window.claimed=!!options.claimed;window.failStatus=!!options.failStatus;
        window.statusReads=0;window.modeReads=0;window.claimWrites=0;window.access=false;
        await (await import('/tests/beta-admin-fixture.tsx')).mount('/builder');
      },options);
    }
    await mount({claimed:true});
    await page.getByText('3 new lesson slots remaining',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.statusReads),1,'Navigation and builder share one status request');
    assert.equal(await page.evaluate(()=>window.access),true);
    await page.getByRole('button',{name:'Refresh allowance',exact:true}).click();
    await page.waitForFunction(()=>window.statusReads===2);
    await mount({invite:true});
    await page.getByText('3 new lesson slots remaining',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.claimWrites),1,'Automatic invitation claim runs once');
    assert.equal(await page.evaluate(()=>window.statusReads),2,'Claim invalidates the shared account status');
    assert.equal(await page.evaluate(()=>localStorage.getItem('teacherflow-beta-invite')),null);
    await mount({failStatus:true});
    await page.getByRole('alert').filter({hasText:'Could not check your beta access'}).waitFor();
    assert.equal(await page.evaluate(()=>window.access),false,'Failed access reads keep generation locked');
    assert.equal(await page.evaluate(()=>window.statusReads),1);
    await page.evaluate(()=>{window.failStatus=false;window.claimed=true;});
    await page.getByRole('button',{name:'Retry access check',exact:true}).click();
    await page.getByText('3 new lesson slots remaining',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.access),true);
    assert.equal(await page.evaluate(()=>window.statusReads),2);
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
    console.log('Beta account loading passed: one shared read, allowance refresh, one automatic claim, cache invalidation, failed access remains locked, retry recovery.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
