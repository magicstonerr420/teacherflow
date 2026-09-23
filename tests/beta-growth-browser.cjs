const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const directory = await fs.mkdtemp(path.resolve('.local-runtime/beta-growth-qa-'));
  let project;
  for (const file of (await fs.readdir('.output/public/assets')).filter(file => file.endsWith('.js'))) {
    const source = await fs.readFile(path.join('.output/public/assets', file), 'utf8');
    project ??= source.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/)?.[1];
    assert.ok(!source.includes('node:sqlite') && !source.includes('node:async_hooks'), `Server implementation leaked to ${file}`);
  }
  assert.ok(project);
  const origin = 'http://127.0.0.1:4213'; let serverLog = '', browser;
  const server = spawn(process.execPath, ['--experimental-transform-types', 'tests/beta-growth-runtime-server.mjs'], {windowsHide: true, env: {...process.env, ACCESS_REQUEST_FIXTURE: directory}, stdio: ['ignore', 'pipe', 'pipe']});
  server.stdout.on('data', data => {serverLog += data;}); server.stderr.on('data', data => {serverLog += data;});
  const errors = [], external = [];
  try {
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) throw Error('Fixture server stopped before startup.');
      try {if ((await fetch(origin)).ok) break;} catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    browser = await chromium.launch({headless: true, channel: 'msedge'});
    async function client(id, email, mobile = false) {
      const context = await browser.newContext({viewport: mobile ? {width: 390, height: 844} : {width: 1440, height: 1000}});
      await context.route('**/*', route => {if (route.request().url().startsWith(origin)) return route.continue(); external.push(route.request().url()); return route.abort();});
      if (id) await context.addInitScript(({project, id, email}) => localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({access_token: btoa(JSON.stringify({alg:'HS256',typ:'JWT'})).replaceAll('=','') + '.' + btoa(JSON.stringify({sub:id,email,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).replaceAll('=','') + '.c2lnbmF0dXJl', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user: {id, email, app_metadata: {}, user_metadata: {}}})), {project, id, email});
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); return page;
    }
    const applicant = await client();
    await applicant.goto(origin + '/');
    await applicant.getByRole('link', {name: 'Request beta access', exact: true}).click();
    await applicant.getByRole('heading', {name: 'Try TeacherFlow with your class.'}).waitFor();
    await applicant.getByLabel('Your name', {exact: true}).fill('Runtime Teacher');
    await applicant.getByLabel('Email', {exact: true}).fill('teacher@example.test');
    await applicant.getByLabel('What do you teach?', {exact: true}).fill('English, ages 8–12, A1–A2.');
    await applicant.getByRole('checkbox').check();
    await applicant.route('**/api/access-request', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Temporary fixture failure. Please retry.'})}));
    await applicant.getByRole('button', {name: 'Submit beta request'}).click();
    await applicant.getByRole('alert').filter({hasText: 'Please retry'}).waitFor();
    assert.equal(await applicant.getByLabel('Email', {exact: true}).inputValue(), 'teacher@example.test');
    await applicant.unroute('**/api/access-request');
    await applicant.getByRole('button', {name: 'Submit beta request'}).click();
    await applicant.getByRole('heading', {name: 'Request received'}).waitFor();
    await applicant.getByRole('link', {name: 'Sign in to check your request'}).waitFor();

    const teacher = await client('access-teacher', 'teacher@example.test', true);
    await teacher.goto(origin + '/request-access');
    await teacher.getByRole('button', {name: 'Check request status'}).click();
    await teacher.getByRole('status').filter({hasText: 'waiting for the owner'}).waitFor();
    await teacher.screenshot({path: path.join(directory, 'request-mobile.png'), fullPage: true});
    assert.ok(await teacher.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    const owner = await client('access-owner', 'owner@example.test');
    await owner.goto(origin + '/beta-management#requests');
    const card = owner.getByRole('article', {name: 'Request from Runtime Teacher'});
    await card.waitFor();
    await owner.screenshot({path: path.join(directory, 'owner-requests.png'), fullPage: false});
    await card.getByRole('button', {name: 'Approve — 3 lessons'}).click();
    await owner.getByRole('status').filter({hasText: 'Runtime Teacher is approved'}).waitFor();
    await owner.getByRole('combobox', {name: 'Request status', exact: true}).selectOption('approved');
    await owner.getByRole('article', {name: 'Request from Runtime Teacher'}).waitFor();
    await owner.reload();
    // Filter resets to pending after reload; the persisted approved decision is still selectable.
    await owner.getByRole('combobox', {name: 'Request status', exact: true}).selectOption('approved');
    await owner.getByRole('article', {name: 'Request from Runtime Teacher'}).waitFor();

    const outsider = await client('access-outsider', 'outsider@example.test');
    await outsider.goto(origin + '/request-access');
    await outsider.getByRole('button', {name: 'Check request status'}).click();
    await outsider.getByRole('status').filter({hasText: 'No request was found'}).waitFor();
    await outsider.goto(origin + '/beta-management#requests');
    await outsider.getByRole('status').filter({hasText: 'only available to the beta owner'}).waitFor();
    assert.equal(await outsider.getByText('teacher@example.test', {exact: true}).count(), 0);
    await teacher.getByRole('button', {name: 'Check request status'}).click();
    await teacher.getByRole('status').filter({hasText: 'Your beta access is active'}).waitFor();
    await teacher.getByRole('link', {name: 'Open lesson builder', exact: true}).click();
    await teacher.getByText('3 new lesson slots remaining', {exact: false}).waitFor();

    // Decline through the real owner UI, without creating a second invitation.
    await applicant.goto(origin + '/request-access');
    await applicant.getByLabel('Your name', {exact: true}).fill('Second Applicant');
    await applicant.getByLabel('Email', {exact: true}).fill('second@example.test');
    await applicant.getByLabel('What do you teach?', {exact: true}).fill('English for adult beginners.');
    await applicant.getByRole('checkbox').check();
    await applicant.getByRole('button', {name: 'Submit beta request'}).click();
    await applicant.getByRole('heading', {name: 'Request received'}).waitFor();
    await owner.getByRole('combobox', {name: 'Request status', exact: true}).selectOption('pending');
    await owner.getByRole('button', {name: 'Refresh requests'}).click();
    await owner.getByRole('article', {name: 'Request from Second Applicant'}).getByRole('button', {name: 'Decline request'}).click();
    await owner.getByRole('status').filter({hasText: 'Second Applicant'}).waitFor();
    await owner.getByRole('combobox', {name: 'Request status', exact: true}).selectOption('declined');
    await owner.getByRole('article', {name: 'Request from Second Applicant'}).waitFor();
    await owner.setViewportSize({width: 390, height: 844});
    assert.ok(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await owner.screenshot({path: path.join(directory, 'owner-mobile.png'), fullPage: true});
    await applicant.goto(origin + '/examples?lesson=weather-and-clothes');
    await applicant.getByRole('link', {name: 'Request beta access', exact: true}).click();
    await applicant.getByRole('heading', {name: 'Try TeacherFlow with your class.'}).waitFor();
    // All eight previews render real images in overview and in student slides.
    const {previews}=await import('../scripts/preview-content.mjs');
    for(const preview of previews) {
      await applicant.goto(origin+'/examples?lesson='+preview.slug);
      const figure=applicant.locator('article[data-preview-slug] figure img');
      await figure.waitFor();
      await applicant.waitForFunction(()=>document.querySelector('article[data-preview-slug] figure img')?.naturalWidth===1536);
      await applicant.getByRole('button',{name:'Presentation',exact:true}).click();
      await applicant.locator('[data-audience="student"] img[src*="-illustration.jpg"]').waitFor();
      if(preview.slug==='weather-and-clothes') {
        const [download]=await Promise.all([applicant.waitForEvent('download'),applicant.getByRole('link',{name:'Download student PowerPoint'}).click()]);
        assert.ok(download.suggestedFilename().endsWith('.pptx'));
      }
    }
    // New feedback saves through the real compiled RPC, ownership check and SQLite store.
    await teacher.goto(origin+'/lessons/11111111-1111-4111-8111-111111111111');
    await teacher.getByRole('button',{name:'Give lesson feedback'}).click();
    const dialog=teacher.getByRole('dialog');
    await dialog.getByLabel('Yes',{exact:true}).check();
    await dialog.getByLabel('A little',{exact:true}).check();
    assert.equal(await dialog.getByRole('button',{name:'Send feedback'}).isEnabled(),false);
    await dialog.getByLabel('How much preparation time did TeacherFlow save for this lesson?').selectOption('minutes_30_59');
    await dialog.getByLabel('Would you pay to keep using TeacherFlow?').selectOption('maybe');
    await dialog.getByLabel('What should we improve? (optional)').fill('More pair-work examples, please.');
    await teacher.screenshot({path:path.join(directory,'feedback-mobile.png'),fullPage:true});
    assert.ok(await teacher.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await dialog.getByRole('button',{name:'Send feedback'}).click();
    await dialog.waitFor({state:'hidden'});
    await teacher.reload();
    await teacher.getByRole('button',{name:'Give lesson feedback'}).click();
    assert.equal(await teacher.getByLabel('Would you pay to keep using TeacherFlow?').inputValue(),'maybe');
    await teacher.keyboard.press('Escape');
    // The exact temporary-anchor mechanism used by downloadBlob emits a teacher download.
    const tracked=teacher.waitForResponse(response=>response.url().endsWith('/api/usage')&&response.request().postDataJSON().event==='download');
    await teacher.evaluate(()=>{const a=document.createElement('a');a.href='data:application/pdf;base64,JVBERg==';a.download='fixture.pdf';document.body.appendChild(a);a.click();a.remove();});
    assert.equal((await tracked).status(),204);
    await owner.goto(origin+'/beta-management#feedback');
    await owner.getByRole('region',{name:'Teacher lesson feedback'}).getByText('More pair-work examples, please.').waitFor();
    await owner.getByText('30–59 minutes',{exact:true}).waitFor();
    await owner.goto(origin+'/beta-management#requests');
    await owner.getByText('Email setup needed:',{exact:false}).waitFor();
    await owner.getByRole('combobox',{name:'Request status',exact:true}).selectOption('approved');
    await owner.getByText('Waiting for sender setup',{exact:false}).waitFor();
    await owner.goto(origin+'/beta-management#usage');
    await owner.getByRole('heading',{name:'Beta usage',exact:true}).waitFor();
    await owner.getByText('Waiting for a full week',{exact:true}).waitFor();
    await owner.getByRole('cell',{name:'C2 · Inequality and Social Mobility'}).waitFor();
    await owner.screenshot({path:path.join(directory,'usage-mobile.png'),fullPage:true});
    assert.ok(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await owner.setViewportSize({width:1440,height:1000});
    await owner.screenshot({path:path.join(directory,'usage-desktop.png'),fullPage:true});
    const {DatabaseSync}=require('node:sqlite'), db=new DatabaseSync(path.join(directory,'usage.sqlite'));
    assert.equal(db.prepare("SELECT COUNT(DISTINCT target) AS n FROM usage_events WHERE event='preview'").get().n,8);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM usage_people WHERE download IS NOT NULL").get().n,1);
    db.close();
    const dnt=await client();
    await dnt.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{value:'1'}));
    const dntCalls=[];dnt.on('request',r=>{if(r.url().endsWith('/api/usage'))dntCalls.push(r.url());});
    await dnt.goto(origin+'/examples?lesson=weather-and-clothes');
    await dnt.locator('article[data-preview-slug] figure img').waitFor();
    await dnt.waitForTimeout(500);
    assert.deepEqual(dntCalls,[]);
    assert.deepEqual(errors, []);
    assert.ok(external.every(url => url.startsWith('https://fonts.googleapis.com/')), 'No provider, email or real identity requests');
    await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify({passed: true, errors, externalRequestsSent: 0, checks: ['public submission and failure recovery', 'owner queue and persisted approval', 'decline', 'verified-email activation', 'other-account isolation', 'three-lesson allowance', 'preview CTA', 'desktop/mobile']}, null, 2));
    console.log(JSON.stringify({passed: true, fixtureDirectory: directory}));
  } finally {await fs.writeFile(path.join(directory, 'server.log'), serverLog); await browser?.close(); server.kill();}
})().catch(error => {console.error(error); process.exitCode = 1;});
