const {chromium}=require('C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');
(async()=>{
 const context=await chromium.launchPersistentContext('.local-runtime/walkthrough-browser',{headless:false,channel:'msedge',args:['--remote-debugging-port=9335']});
 const page=await context.newPage();
 const invite=(await fs.readFile('.local-runtime/walkthrough-invite.txt','utf8')).trim();
 await page.goto('http://127.0.0.1:3000/builder#invite='+encodeURIComponent(invite));
 await page.waitForTimeout(1800);
 const signedIn=await page.evaluate(async()=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const {data}=await supabase.auth.getSession();return !!data.session;});
 console.log('Real browser session present:',signedIn);
 if(!signedIn){console.log('Waiting for sign-in in this Edge window.');return;}
 const button=page.getByRole('button',{name:'Claim invitation',exact:true});
 if(await button.isVisible())await button.click();
 await page.getByText('3 new lesson slots remaining').waitFor();
 await page.reload();
 await page.getByText('3 new lesson slots remaining').waitFor();
 await page.screenshot({path:'../../work/real-signin-claimed.png'});
 await fs.writeFile('.local-runtime/walkthrough-result.json',JSON.stringify({realSignin:true,invitationClaimed:true,refreshRetained:true,at:new Date().toISOString()}));
 console.log('Real sign-in, invitation claim and refresh persistence passed. Test seat only.');
})().catch(e=>{console.error('Walkthrough:',e.message);process.exitCode=1;});
