const {chromium}=require('C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');
(async()=>{
 const context=await chromium.launchPersistentContext('.local-runtime/walkthrough-browser',{headless:false,channel:'msedge'});
 const page=await context.newPage();
 const invite=(await fs.readFile('.local-runtime/walkthrough-invite.txt','utf8')).trim();
 await page.goto('http://127.0.0.1:3000/builder#invite='+encodeURIComponent(invite));
 await page.getByText('Sign in or create an account to claim your invitation').click();
 await page.getByLabel('Email',{exact:true}).fill(process.env.TEACHERFLOW_TEST_EMAIL || (()=>{throw new Error('Set TEACHERFLOW_TEST_EMAIL to an address you control.');})());
 await page.getByRole('button',{name:'Email me a sign-in link',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Check your email'}).waitFor({timeout:30000});
 console.log('Sign-in email requested successfully. Waiting for the user to confirm in the test Edge window.');
 for(let attempt=0;attempt<120;attempt++){
   await new Promise(r=>setTimeout(r,5000));
   for(const p of context.pages()){
    if(!p.url().startsWith('http://127.0.0.1:3000'))continue;
    const signedIn=await p.evaluate(async()=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const {data}=await supabase.auth.getSession();return !!data.session;}).catch(()=>false);
    if(!signedIn)continue;
    await p.goto('http://127.0.0.1:3000/builder');
    await p.getByRole('button',{name:'Claim invitation',exact:true}).click();
    await p.getByText('3 new lesson slots remaining').waitFor();
    await p.reload();
    await p.getByText('3 new lesson slots remaining').waitFor();
    await p.screenshot({path:'../../work/real-signin-claimed.png'});
    await fs.writeFile('.local-runtime/walkthrough-result.json',JSON.stringify({realSignin:true,invitationClaimed:true,refreshRetained:true,at:new Date().toISOString()}));
    console.log('Real Supabase sign-in, invitation claim and retained access after refresh passed.');
    return;
   }
 }
 console.log('Still awaiting email confirmation; browser remains available.');
})().catch(e=>{console.error('Walkthrough stopped:',e.message);process.exitCode=1;});
