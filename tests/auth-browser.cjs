const {chromium}=require('C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext();
  await context.route('**/auth/v1/otp*',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await context.route('**/auth/v1/signup*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'test-user',email:'test@example.com',identities:[]})}));
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:3000/builder#invite=test-browser-invite');
  await page.getByText('Sign in or create an account to claim your invitation').waitFor();
  await page.waitForFunction(()=>!!localStorage.getItem('teacherflow-beta-invite'));
  assert.ok(!page.url().includes('invite='));
  const second=await context.newPage();
  await second.goto('http://127.0.0.1:3000/auth?redirect=%2Fbuilder');
  await second.waitForTimeout(1500);
  assert.equal(await second.evaluate(()=>JSON.parse(localStorage.getItem('teacherflow-beta-invite')).code),'test-browser-invite');
  await second.getByLabel('Email',{exact:true}).fill('test@example.com');
  await second.getByRole('button',{name:'Email me a sign-in link',exact:true}).click();
  await second.getByRole('status').filter({hasText:'Check your email for a sign-in link'}).waitFor();
  await second.getByRole('button',{name:'Create an account',exact:true}).click();
  await second.getByLabel('Password',{exact:true}).fill('test-only-password-456');
  await second.getByRole('button',{name:'Create account',exact:true}).click();
  await second.getByRole('status').filter({hasText:'Check your email to confirm your account'}).waitFor();
  console.log('Confirmation-required signup, passwordless email notice, and invitation persistence across tabs passed with mocked email delivery.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
