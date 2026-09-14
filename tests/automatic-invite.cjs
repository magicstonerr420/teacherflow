const {chromium}=require('C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const p=await b.newPage();
  await p.route('**/src/hooks/useAuth.tsx*',r=>r.fulfill({contentType:'application/javascript',body:`export function useAuth(){return {isAuthenticated:true,loading:false,user:{email:'test@example.com'},session:null}}`}));
  await p.route('**/src/lib/beta.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:`export async function betaMode(){return true} export async function betaStatus(){return {enabled:true,claimed:!!localStorage.getItem('mockClaimed'),remaining:3,completed:0,lessons:[]}} export async function claimBeta(){localStorage.setItem('mockClaimed','yes');window.claimCount=(window.claimCount||0)+1;return {ok:true}}`}));
  await p.goto('http://127.0.0.1:3000/builder#invite=automatic-test');
  await p.getByText('3 new lesson slots remaining').waitFor();
  if(await p.evaluate(()=>window.claimCount)!==1)throw Error('Expected one automatic claim');
  await p.reload();await p.getByText('3 new lesson slots remaining').waitFor();
  if(await p.evaluate(()=>window.claimCount||0))throw Error('Repeated claim after refresh');
  console.log('Automatic activation and refresh passed with mocked account; no real seats consumed.');
 }finally{await b.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
