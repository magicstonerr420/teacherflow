const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');const assert=require('node:assert/strict');const path=require('node:path');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4201';
const destination=process.env.PREVIEW_QA_DIR||'.local-runtime/preview-qa';
(async()=>{
 const {previews}=await import('../scripts/preview-content.mjs');await fs.mkdir(destination,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[],api=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().includes('/_serverFn/')||r.url().includes('/api/'))api.push(r.url());});
  await page.goto(origin+'/');await page.getByRole('link',{name:'View Example',exact:true}).click();
  await page.locator('[data-preview="weather-and-clothes"]').waitFor();
  await page.getByRole('link',{name:'Browse all previews'}).click();
  await page.getByRole('heading',{name:'Start simple.'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Explore lesson'}).count(),8);
  await page.screenshot({path:path.join(destination,'gallery-desktop.png'),fullPage:true});
  const levels=[];
  const sections=['Overview','Lesson Plan','Presentation','Worksheet','Reading','Listening','Activities','Homework','Exit Ticket','Assessment','Support Version','Challenge Version','Teacher Notes','Quality Check'];
  for(const p of previews){
   await page.goto(origin+'/examples?lesson='+p.slug);await page.locator(`[data-preview="${p.slug}"]`).waitFor();
   const nav=page.getByRole('navigation',{name:'Lesson sections'});
   for(const label of sections){
    await nav.getByRole('button',{name:label,exact:true}).click();
    const section=page.getByRole('region',{name:label,exact:true});await section.waitFor();
    assert.ok((await section.innerText()).length>90,p.slug+' '+label+' must contain actual material');
    if(label==='Presentation'){
     const broken=await section.locator('img').evaluateAll(images=>images.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.alt));assert.deepEqual(broken,[]);
     assert.equal(await section.getByText('Teaching guidance',{exact:true}).count(),0);
     if(p.slug==='weather-and-clothes'||p.slug==='toys-and-play')await page.screenshot({path:path.join(destination,p.slug+'-slides.png'),fullPage:true});
    }
    if(label==='Worksheet'){
     await section.getByRole('button',{name:'Student',exact:true}).click();
     assert.equal(await section.getByText('Teacher transcript:',{exact:false}).count(),0);
     await section.getByRole('button',{name:'Version B',exact:true}).click();
     assert.ok(await section.getByText('Version B',{exact:false}).count());
    }
    if(label==='Reading'){
     const paragraph=section.locator('.lesson-copy').first();assert.equal(await paragraph.evaluate(e=>getComputedStyle(e).textAlign),'justify');
     if(p.level==='C2')await page.screenshot({path:path.join(destination,'c2-reading-desktop.png'),fullPage:true});
    }
    if(label==='Listening'){
     await page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&Number.isFinite(a.duration)&&a.duration>40;});
     const result=await page.locator('audio').evaluate(async a=>{await a.play();await new Promise(r=>setTimeout(r,180));a.pause();return {duration:a.duration,decoded:a.readyState>=2};});
     assert.ok(result.decoded);levels.push({slug:p.slug,audioSeconds:result.duration});
    }
   }
   const links=await page.locator('[data-preview] header a[download]').evaluateAll(elements=>elements.map(e=>e.href));
   for(const href of links){const response=await page.request.get(href);assert.equal(response.status(),200);assert.ok(Number(response.headers()['content-length'])>500);}
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin+'/examples');await page.getByRole('heading',{name:'Start simple.'}).waitFor();await page.screenshot({path:path.join(destination,'gallery-mobile.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Gallery must fit mobile');
  await page.goto(origin+'/examples?lesson=inequality-and-social-mobility');await page.locator('[data-preview]').waitFor();await page.getByLabel('Explore this lesson').selectOption('reading');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Reading must fit mobile');await page.screenshot({path:path.join(destination,'c2-reading-mobile.png'),fullPage:true});
  await page.goto(origin+'/examples?lesson=unknown');await page.getByRole('alert').filter({hasText:'That preview does not exist'}).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(api,[],'Public preview browsing must not call generation/account APIs');
  await fs.writeFile(path.join(destination,'browser-result.json'),JSON.stringify({origin,lessons:8,sectionsPerLesson:14,errors,api,audio:levels},null,2));
  console.log('Passed: 8 public lessons × 14 sections; decoded audio; images; download links; mobile; no server API calls.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
