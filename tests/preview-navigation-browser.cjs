const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4201';
const destination=process.env.PREVIEW_QA_DIR||'.local-runtime/preview-navigation-qa';

(async()=>{
  const {previews}=await import('../scripts/preview-content.mjs');
  await fs.mkdir(destination,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[],api=[],lessonRequests=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{
      const url=request.url();
      if(url.includes('/_serverFn/')||url.includes('/api/'))api.push(url);
      if(url.includes('/previews/')&&new URL(url).pathname.endsWith('.json'))lessonRequests.push(new URL(url).pathname);
    });
    const loaded=slug=>page.locator(`[data-preview="${slug}"]`).waitFor();
    const navigation=()=>page.getByRole('navigation',{name:'Preview lesson navigation',exact:true});
    const reading=()=>page.getByRole('region',{name:'Reading',exact:true});

    await page.goto(origin+'/');
    assert.equal(lessonRequests.length,0,'Homepage must not fetch lesson bodies');
    await page.getByRole('link',{name:'View Example',exact:true}).click();
    await loaded(previews[0].slug);
    assert.equal(new URL(page.url()).searchParams.get('lesson'),previews[0].slug);
    assert.ok(await navigation().getByRole('button',{name:'First lesson'}).isDisabled());
    assert.deepEqual([...new Set(lessonRequests)],[`/previews/v1/${previews[0].slug}.json`],'Opening the first example fetches only that lesson');
    const requestsBeforeSectionChange=lessonRequests.length;
    await page.getByRole('navigation',{name:'Lesson sections',exact:true}).getByRole('button',{name:'Reading',exact:true}).click();
    await reading().waitFor();
    assert.equal(lessonRequests.length,requestsBeforeSectionChange,'Changing sections must not refetch lesson data');
    await page.screenshot({path:path.join(destination,'beginner-desktop.png'),fullPage:false});

    // Advance through the entire progression while comparing the same section.
    for(let i=1;i<previews.length;i++){
      await navigation().getByRole('link',{name:`Next lesson: ${previews[i].title}`,exact:true}).click();
      await loaded(previews[i].slug);await reading().waitFor();
      assert.equal(new URL(page.url()).searchParams.get('section'),'reading');
    }
    assert.ok(await navigation().getByRole('button',{name:'Last lesson'}).isDisabled());
    await page.getByText('You’ve reached the final preview.',{exact:false}).waitFor();
    await navigation().getByRole('link',{name:`Previous lesson: ${previews[6].title}`,exact:true}).click();
    await loaded(previews[6].slug);await reading().waitFor();
    await page.goBack();await loaded(previews[7].slug);await reading().waitFor();
    await page.goForward();await loaded(previews[6].slug);await reading().waitFor();

    await page.getByRole('combobox',{name:'Choose a preview lesson',exact:true}).selectOption(previews[2].slug);
    await loaded(previews[2].slug);await reading().waitFor();
    assert.ok((await page.getByRole('link',{name:'Download complete lesson',exact:true}).getAttribute('href')).includes(previews[2].slug+'.zip'));
    await page.reload();await loaded(previews[2].slug);await reading().waitFor();

    // The gallery and the entry in site navigation remain available from every lesson.
    await page.getByRole('link',{name:'Browse all previews'}).click();
    assert.equal(await page.getByRole('link',{name:'Explore lesson',exact:true}).count(),8);
    await page.getByRole('link',{name:'Start with the beginner lesson',exact:true}).click();
    await loaded(previews[0].slug);
    await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('link',{name:'Examples',exact:true}).click();
    await loaded(previews[0].slug);

    await page.setViewportSize({width:390,height:844});
    await page.getByRole('combobox',{name:'Explore this lesson',exact:true}).selectOption('listening');
    await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=2);
    await page.locator('audio').evaluate(async audio=>{await audio.play();window.previewPreviousAudio=audio;});
    await page.getByRole('combobox',{name:'Choose a preview lesson',exact:true}).selectOption(previews[1].slug);
    await loaded(previews[1].slug);
    await page.getByRole('region',{name:'Listening',exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>!window.previewPreviousAudio.isConnected&&window.previewPreviousAudio.paused),'Leaving a lesson stops its audio');
    assert.ok(await page.locator('audio').evaluate(audio=>audio.paused),'The next lesson must not autoplay');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Preview controls must fit mobile');
    await page.screenshot({path:path.join(destination,'mobile-navigation.png'),fullPage:false});
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Examples',exact:true}).click();
    await loaded(previews[0].slug);
    await page.getByRole('dialog').waitFor({state:'hidden'});

    // Failed or superseded fetches must not strand navigation or replace the selected lesson.
    let fail=true;
    await page.route('**/previews/v1/toys-and-play.json?*',route=>fail?route.fulfill({status:503,body:'Temporarily unavailable'}):route.continue());
    await page.getByRole('combobox',{name:'Choose a preview lesson',exact:true}).selectOption(previews[1].slug);
    await page.getByRole('alert').filter({hasText:'could not be loaded'}).waitFor();
    assert.ok(await page.getByRole('combobox',{name:'Choose a preview lesson',exact:true}).isVisible());
    fail=false;await page.getByRole('button',{name:'Retry preview'}).click();await loaded(previews[1].slug);
    await page.unroute('**/previews/v1/toys-and-play.json?*');
    await page.route('**/previews/v1/food-at-a-restaurant.json?*',async route=>{await new Promise(resolve=>setTimeout(resolve,600));await route.continue().catch(()=>{});});
    await page.getByRole('combobox',{name:'Choose a preview lesson',exact:true}).selectOption(previews[2].slug);
    await page.getByRole('combobox',{name:'Choose a preview lesson',exact:true}).selectOption(previews[7].slug);
    await loaded(previews[7].slug);await page.waitForTimeout(700);
    assert.equal(await page.locator('[data-preview]').getAttribute('data-preview'),previews[7].slug);
    await page.goto(origin+'/examples?lesson=weather-and-clothes&section=not-a-section');
    await loaded(previews[0].slug);await page.getByRole('region',{name:'Overview',exact:true}).waitFor();
    assert.deepEqual(errors,[]);assert.deepEqual(api,[],'Public navigation must not invoke generation or account APIs');
    await fs.writeFile(path.join(destination,'result.json'),JSON.stringify({origin,checkedAt:new Date().toISOString(),lessons:8,errors,api,checks:['A1 direct entry','next/previous/selector','preserved section and browser history','desktop/mobile','no eager lesson fetch','audio stops on navigation','failed fetch retry','superseded fetch protection','invalid section fallback']},null,2));
    console.log('Passed public preview navigation: A1 entry, all eight lessons, section comparison, history, mobile, audio lifecycle and recovery.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
