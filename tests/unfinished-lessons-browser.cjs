// UI states and account isolation. Server persistence and quota use real-RPC integration tests.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3000';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const errors = [], unexpected = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.route('**/_serverFn/**', route => { unexpected.push(route.request().url()); return route.abort(); });
    await page.route('**/unfinished-test', route => route.fulfill({ contentType: 'text/html', body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module">window.process={env:{NODE_ENV:"development",TSS_SERVER_FN_BASE:"/_serverFn/"}};import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>' }));
    await page.route('**/src/lib/lesson-drafts.functions.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `export async function listLessonDrafts() {
      const user=window.testUser;
      window.calls=(window.calls||0)+1;
      if (window.delayDrafts) await new Promise(resolve=>window.releaseDrafts=resolve);
      if (window.failDrafts) throw new Error('Offline');
      return window.rows[user] || [];
    }` }));
    await page.goto(origin + '/unfinished-test');
    const phases = ['foundation', 'student', 'teacher', 'studentB', 'teacherB', 'presentation', 'activity', 'assessment', 'differentiation'];
    const draft = (id, topic, status, completed, extra = {}) => ({ id, request: { topic, studentAge: 'Adults', level: 'C2', durationMinutes: 60, mainSkill: 'Mixed' }, status, completedStages: phases.slice(0, completed), nextStage: phases[completed] || null, error: null, updatedAt: Date.now(), savedLessonId: null, activeUntil: null, ...extra });
    const rows = { 'teacher-a': [
      draft('11111111-1111-4111-8111-111111111111', 'The Future of Society', 'failed', 2),
      draft('22222222-2222-4222-8222-222222222222', 'Ready lesson', 'complete', 9),
      draft('33333333-3333-4333-8333-333333333333', 'Active lesson', 'generating', 3, { activeUntil: Date.now() + 600000 }),
      draft('44444444-4444-4444-8444-444444444444', 'Paused lesson', 'ready', 0),
    ], 'teacher-b': [draft('55555555-5555-4555-8555-555555555555', 'Private second account', 'ready', 1)] };
    await page.evaluate(async rows => { window.rows = rows; window.testUser = 'teacher-a'; await (await import('/tests/unfinished-lessons-fixture.tsx')).mount(); }, rows);
    const failed = page.getByRole('article', { name: 'The Future of Society', exact: true });
    await failed.waitFor();
    assert.equal(await failed.getByText('Needs retry', { exact: true }).count(), 1);
    assert.equal(await failed.getByText('2 of 9 parts completed', { exact: true }).count(), 1);
    assert.equal(await failed.getByRole('link', { name: 'Continue unfinished lesson', exact: true }).getAttribute('href'), '/builder?draft=11111111-1111-4111-8111-111111111111');
    assert.equal(await page.getByRole('article', { name: 'Ready lesson', exact: true }).getByRole('link', { name: 'Finish saving lesson', exact: true }).count(), 1);
    assert.equal(await page.getByRole('article', { name: 'Active lesson', exact: true }).getByText('Generating', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('article', { name: 'Paused lesson', exact: true }).getByText('Ready to continue', { exact: true }).count(), 1);
    await fs.mkdir('.local-runtime/unfinished-lessons', { recursive: true });
    await page.screenshot({ path: '.local-runtime/unfinished-lessons/desktop.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'No narrow-screen horizontal overflow');
    await page.screenshot({ path: '.local-runtime/unfinished-lessons/mobile.png', fullPage: true });

    // A late response for the previous account must not be visible in the new account.
    await page.evaluate(() => { window.delayDrafts = true; });
    await page.getByRole('button', { name: 'Refresh unfinished lessons', exact: true }).click();
    await page.waitForFunction(() => !!window.releaseDrafts);
    await page.evaluate(() => { window.delayDrafts = false; window.testUser = 'teacher-b'; window.setDraftUser('teacher-b'); });
    await page.getByRole('article', { name: 'Private second account', exact: true }).waitFor();
    await page.evaluate(() => window.releaseDrafts());
    assert.equal(await failed.count(), 0, 'Previous teacher draft stays private after a late response');

    await page.evaluate(() => { window.failDrafts = true; window.testUser = 'new-teacher'; window.setDraftUser('new-teacher'); });
    await page.getByRole('button', { name: 'Retry unfinished lessons', exact: true }).waitFor();
    assert.equal(await page.getByRole('article').count(), 0, 'No previous account cards during query failure');
    await page.evaluate(() => { window.failDrafts = false; });
    await page.getByRole('button', { name: 'Retry unfinished lessons', exact: true }).click();
    await page.getByText('No unfinished lessons', { exact: true }).waitFor();
    await page.evaluate(() => window.setDraftUser(undefined));
    await page.waitForFunction(() => !document.querySelector('section'));
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log('Unfinished lessons UI passed: statuses, resume links, completed-unsaved, responsive layout, account switch, late response, retry, empty and sign-out.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
