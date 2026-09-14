const{chromium}=require('C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const p=await b.newPage();
  await p.route('**/auth/v1/token*',r=>r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'invalid_credentials',msg:'Invalid login credentials'})}));
  await p.route('**/auth/v1/recover*',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await p.goto('http://127.0.0.1:3000/auth');await p.waitForTimeout(1200);
  await p.getByLabel('Email',{exact:true}).fill('test@example.com');
  await p.getByLabel('Password',{exact:true}).fill('test-password');
  await p.getByRole('button',{name:'Sign in',exact:true}).click();
  await p.getByRole('status').filter({hasText:'may not have set a password'}).waitFor();
  assert.equal(await p.getByRole('button',{name:'Continue with Google'}).count(),0);
  await p.getByRole('button',{name:'Set or reset my password'}).click();
  await p.getByRole('status').filter({hasText:'password reset link'}).waitFor();
  const c=await b.newContext();const q=await c.newPage();
  await q.route('**/src/hooks/useAuth.tsx*',r=>r.fulfill({contentType:'application/javascript',body:`export function useAuth(){return {isAuthenticated:true,loading:false,user:{email:'test@example.com'}}}`}));
  await q.route('**/src/integrations/supabase/client.ts*',r=>r.fulfill({contentType:'application/javascript',body:`export const supabase={auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:null}}),updateUser:async()=>{window.passwordSaved=true;return {data:{},error:null}}}};`}));
  await q.goto('http://127.0.0.1:3000/auth?password=true');
  await q.getByRole('heading',{name:'Set your TeacherFlow password'}).waitFor();
  await q.getByLabel('New password',{exact:true}).fill('test-password-123');
  await q.getByLabel('Confirm new password').fill('different-password');
  await q.getByRole('button',{name:'Save password'}).click();
  await q.getByRole('status').filter({hasText:'do not match'}).waitFor();
  assert.equal(await q.evaluate(()=>!!window.passwordSaved),false);
  await q.getByLabel('Confirm new password').fill('test-password-123');
  await q.getByRole('button',{name:'Save password'}).click();
  await q.waitForURL('**/builder');
  assert.equal(await q.evaluate(()=>window.passwordSaved),true);
  console.log('Invalid-login guidance, reset request, hidden unconfigured Google, recovery form, mismatch rejection and password-save redirect passed (mock auth).');
 }finally{await b.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
