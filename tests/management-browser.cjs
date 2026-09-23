// Isolated owner dashboard. Server functions are mocked before any component loads.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3008';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const errors = [], unexpected = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.route('**/_serverFn/**', route => { unexpected.push(route.request().url()); return route.abort(); });
    await page.route('**/management-test', route => route.fulfill({ contentType: 'text/html', body: '<html><body><script type="module">window.process={env:{NODE_ENV:"development",TSS_SERVER_FN_BASE:"/_serverFn/"}};import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>' }));
    await page.route('**/src/hooks/useAuth.ts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const useAuth=()=>({isAuthenticated:true,loading:false,user:{id:window.owner?"owner":"teacher"}});' }));
    await page.route('**/src/integrations/supabase/client.ts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const supabase={auth:{async signOut(){},async getSession(){return {data:{session:null}};}}};' }));
    await page.route('**/src/lib/beta.functions.ts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const betaStatus=async()=>{if(window.accessFailure)throw Error(window.accessFailure);return {enabled:true,owner:window.owner}};' }));
    await page.route('**/src/lib/beta-admin.functions.ts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const listBetaTeachers=async()=>({seats:[],removed:[]});export const manageBetaTeacher=async()=>{throw Error("Unexpected teacher mutation")};export const createBetaInvitation=manageBetaTeacher;export const resetBetaAllowance=manageBetaTeacher;' }));
    await page.route('**/src/lib/teacher-tools.functions.ts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const listTeacherFeedback=async()=>({entries:[],more:false});' }));
    await page.route('**/src/lib/management.functions.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
      export const loadManagement=async()=>{window.loads++;if(window.managementError)throw Error(window.managementError);return structuredClone(window.managementData)};
      export const manageGeneration=async({data})=>{window.actions.push(data);await new Promise(r=>setTimeout(r,120));if(window.failAction){window.failAction=false;throw Error('Action could not be saved. Try again.');}const row=window.managementData.operations.find(r=>r.id===data.id);if(data.action==='resolve')row.issue='resolved';if(data.action==='restore_slot')window.managementData.lessons.find(l=>l.key===row.lesson).credited=true;window.managementData.audit.push({id:data.action+':'+data.id,actor:'owner',user:row.user,action:data.action,detail:row.part,created:Date.now()});return {ok:true}};
      export const saveSupportNote=async({data})=>{window.notes.push(data);window.managementData.notes=[{...data,updated:Date.now()}];return {ok:true}};
      export const saveManagementNotifications=async({data})=>{window.preferences.push(data);window.managementData.settings=data;return {ok:true}};
    ` }));
    async function mount(owner = true, path = '/beta-management', failures = {}) {
      await page.goto(origin + '/management-test');
      await page.evaluate(async ({ owner, path, failures }) => {
        window.owner = owner; window.loads = 0; window.actions = []; window.notes = []; window.preferences = [];
        window.managementError = failures.managementError || ''; window.accessFailure = failures.accessFailure || '';
        const now = Date.now();
        const request = { subject: 'English', topic: 'Weather', studentAge: '8-9', level: 'A1', durationMinutes: 45, mainSkill: 'Speaking', secondarySkill: 'Reading', learningObjective: 'Describe the weather with complete sentences.', teacherNotes: 'Use simple examples and warm colors.', groupWorkEnabled: true, studentsPerGroup: 4, classroomLimitations: 'No internet in class' };
        const failed = { id: '10000000-0000-4000-8000-000000000001', user: 'ana', lesson: 'weather', part: 'student', detail: 'Worksheet A', target: '', source: 'server', status: 'failed', issue: 'open', started: now - 60000, updated: now - 50000, finished: now - 50000, request, failure: { category: 'content', explanation: 'Generated material did not pass its content checks.', nextAction: 'Review the diagnostic details and allow a targeted retry.', detail: 'One question was missing an answer.' }, providers: [{ model: 'provider/example-model', kind: 'text', status: 200, ms: 900, at: now - 55000, detail: 'Content validation failed.' }] };
        failed.providers.unshift({ model: 'provider/example-model', kind: 'text', event: 'queued', ms: 300, at: now - 56000 });
        failed.providers.push({ model: 'provider/example-model', kind: 'text', event: 'validation', ms: 0, at: now - 54000 });
        const lesson = { user: 'ana', key: 'weather', request, complete: false, credited: false, steps: [{ part: 'foundation', complete: true, attempts: 1, running: false }, { part: 'student', complete: false, attempts: 2, running: false }, { part: 'teacher', complete: false, attempts: 0, running: false }] };
        window.managementData = { operations: [failed,
          { ...failed, id: '10000000-0000-4000-8000-000000000002', lesson: 'interrupted', part: 'foundation', status: 'interrupted', request: { ...request, topic: 'Animals' }, failure: { category: 'unknown', explanation: 'No completion was recorded.', nextAction: 'Review saved progress.', detail: 'Cause unknown.' }, providers: [] },
          { ...failed, id: '10000000-0000-4000-8000-000000000003', lesson: 'browser', source: 'browser', part: 'export', request: { ...request, topic: 'Transport' }, providers: [] },
          { ...failed, id: '10000000-0000-4000-8000-000000000004', lesson: 'billing', part: 'recording', request: { ...request, topic: 'Food' }, failure: { category: 'uncertain_charge', explanation: 'Provider charge could not be confirmed.', nextAction: 'Review the provider charge.', detail: 'Awaiting charge confirmation.' } },
          { ...failed, id: '10000000-0000-4000-8000-000000000005', lesson: 'restored', status: 'recovered', issue: 'recovered', request: { ...request, topic: 'Colors' }, failure: null, providers: [
            { model: 'provider/example-model', kind: 'text', status: 429, ms: 80, at: now - 55000 },
            { model: 'provider/example-model', kind: 'text', event: 'retry', ms: 500, at: now - 54000 },
            { model: 'provider/backup-model', kind: 'text', event: 'fallback', ms: 0, at: now - 53000 },
            { model: 'provider/backup-model', kind: 'text', status: 200, ms: 500, at: now - 52000 }
          ] },
          { ...failed, id: '10000000-0000-4000-8000-000000000006', lesson: 'running', status: 'generating', issue: 'none', request: { ...request, topic: 'Hobbies' }, failure: null },
          { ...failed, id: '10000000-0000-4000-8000-000000000007', lesson: 'running', source: 'browser', status: 'generating', issue: 'none', request: { ...request, topic: 'Hobbies' }, failure: null }
        ], teachers: [{ user: 'ana', name: 'Ana Teacher', email: 'ana@example.test', revoked: false }, { user: 'bea', name: 'Bea Teacher', email: 'bea@example.test', revoked: false }], lessons: [lesson, { ...lesson, user: 'bea', key: 'legacy', complete: true, credited: true, steps: lesson.steps.map(step => ({ ...step, complete: true })), request: { ...request, topic: 'Earlier lesson' } }], notes: [], audit: [], history: [{ action: 'reset-allowance', user: 'ana', actor: 'owner', seat: 1, at: new Date(now).toISOString() }], budget: { limitUsd: 10, accountedUsd: 0.25, reservedUsd: 0.1, remainingUsd: 9.65, paused: false }, spending: [{ user: 'ana', kind: 'text', model: 'provider/example-model', requests: 3, confirmedUsd: 0.25, reservedUsd: 0.1, uncertain: 1 }], settings: { emailEnabled: true, dailySummary: false }, email: { configured: false, from: '', to: 'owner@example.test', missing: ['RESEND_API_KEY', 'TEACHERFLOW_ALERT_FROM'] }, alerts: [{ id: 'a', status: 'accepted', created: now, attempts: 1, error: null }, { id: 'b', status: 'queued', created: now, attempts: 2, error: 'Email delivery was interrupted; waiting to retry.' }] };
        await (await import('/tests/management-fixture.tsx')).mount(path);
      }, { owner, path, failures });
    }
    await mount();
    await page.getByRole('heading', { name: 'Management', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Needs your attention', exact: true }).waitFor();
    const mainNav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    assert.equal(await mainNav.getByRole('link', { name: 'Management', exact: true }).count(), 1, 'Owner has one Management destination');
    assert.equal(await mainNav.getByRole('button', { name: 'Management', exact: true }).count(), 0, 'Management no longer opens an overloaded menu');
    assert.equal(await mainNav.getByRole('link', { name: 'Management', exact: true }).getAttribute('href'), '/beta-management#overview');
    await mainNav.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('menuitem', { name: 'My profile', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('tablist', { name: 'Management sections', exact: true }).waitFor();
    assert.deepEqual(await page.getByRole('tablist', { name: 'Management sections', exact: true }).getByRole('tab').allTextContents(), ['Overview', 'Teachers', 'Generation', 'Budget']);
    assert.equal(await page.getByRole('tab').count(), 4, 'Only the four main sections are shown on Overview');
    assert.equal(await page.locator('section[aria-label="Generation reliability"]').isVisible(), false, 'Reliability details start collapsed');
    assert.equal(await page.locator('section[aria-label="Owner email notifications"]').isVisible(), false, 'Email preferences start collapsed');
    await fs.mkdir('.local-runtime/management-ui', { recursive: true });
    await page.screenshot({ path: '.local-runtime/management-ui/overview-desktop.png', fullPage: true });
    const reliabilityToggle = page.locator('summary').filter({ hasText: /^Generation reliability/ });
    await reliabilityToggle.focus();
    await page.keyboard.press('Enter');
    await page.getByText('Generating now', { exact: true }).locator('../..').getByText('1', { exact: true }).waitFor();
    await page.getByText('2 confirmed server failures · 2 reports needing investigation', { exact: true }).waitFor();
    const reliability = page.getByRole('region', { name: 'Generation reliability', exact: true });
    await reliability.getByText(/Based on 5 server operations in the latest 7 tracked records/).waitFor();
    await reliability.getByText(/5 recorded provider requests/).waitFor();
    assert.match(await reliability.locator('dt').filter({ hasText: /^Rate-limit rejections$/ }).locator('..').locator('dd').innerText(), /^1\b/);
    assert.match(await reliability.locator('dt').filter({ hasText: /^Successful recoveries$/ }).locator('..').locator('dd').innerText(), /^1\b/);
    assert.match(await reliability.locator('dt').filter({ hasText: /^Backup model selections$/ }).locator('..').locator('dd').innerText(), /^1\b/);
    await reliability.getByText('Requests by model (2)', { exact: true }).click();
    await reliability.getByRole('heading', { name: 'provider/backup-model', exact: true }).waitFor();
    await reliability.getByText(/HTTP success means the provider accepted a request/).waitFor();
    await page.evaluate(() => { window.managementError = '<!doctype html><html><head><title>502 Bad Gateway</title></head><body>private-gateway-dump Bearer fixture-secret</body></html>'; });
    await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
    const refreshError = page.getByRole('alert').filter({ hasText: 'Could not refresh Management.' });
    await refreshError.getByText('A server or gateway returned 502. Its underlying cause was not reported.', { exact: true }).waitFor();
    assert.ok((await refreshError.innerText()).includes('The last loaded records are still shown.'));
    assert.doesNotMatch(await page.locator('body').innerText(), /private-gateway-dump|fixture-secret|<!doctype|<html>/);
    await page.getByText('2 confirmed server failures · 2 reports needing investigation', { exact: true }).waitFor();
    await page.evaluate(() => { window.managementError = 'Database temporarily unavailable. Bearer fixture-secret https://private.example.test/diagnostic'; });
    await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
    await refreshError.getByText('Database temporarily unavailable. [credential removed] [address removed]', { exact: true }).waitFor();
    await page.evaluate(() => { window.managementError = ''; });
    await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
    await refreshError.waitFor({ state: 'hidden' });
    await page.locator('summary').filter({ hasText: /^Email preferences/ }).click();
    await page.getByLabel('Include a daily issue summary').click();
    await page.getByRole('button', { name: 'Save email preferences' }).click();
    await page.getByText('Email preferences saved.', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.preferences), [{ emailEnabled: true, dailySummary: true }]);
    await page.getByText('Email setup instructions', { exact: true }).click();
    await page.getByText(/In the hosting service’s server environment settings/).waitFor();
    await page.getByText('Recent email delivery status (2)', { exact: true }).click();
    await page.getByText(/Inbox delivery is not verified/).waitFor();
    await page.getByRole('tab', { name: 'Generation', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: /^Issues/ }).getAttribute('aria-selected'), 'true', 'Generation opens Issues');
    await page.getByRole('tab', { name: 'All activity', exact: true }).click();
    await page.getByRole('heading', { name: 'Generation activity', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Issue status').count(), 0, 'All activity includes ordinary operations');
    await page.getByRole('tab', { name: /^Issues/ }).click();
    await page.getByLabel('Filter by teacher').selectOption('ana');
    await page.getByLabel('Generation status').selectOption('interrupted');
    assert.equal(await page.locator('details[aria-label]').count(), 1);
    await page.getByLabel('Generation status').selectOption('all');
    const failed = page.locator('details[aria-label="Weather — Worksheet A"]');
    await failed.locator('summary').first().click();
    await failed.getByText('Full submitted lesson settings', { exact: true }).click();
    await failed.getByText('No internet in class', { exact: true }).waitFor();
    await failed.getByText('Provider attempts and events (3)', { exact: true }).click();
    await failed.getByText(/Queued for capacity/).waitFor();
    await failed.getByText(/Provider accepted request/).waitFor();
    await failed.getByText('Content validation failed.', { exact: true }).waitFor();
    await failed.getByRole('button', { name: 'Allow one extra attempt' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    assert.equal(await page.evaluate(() => window.actions.length), 0);
    await failed.getByRole('button', { name: 'Allow one extra attempt' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm extra attempt' }).evaluate(button => { button.click(); button.click(); });
    await page.getByRole('status').filter({ hasText: 'One extra attempt allowed for Worksheet A' }).waitFor();
    assert.equal(await page.evaluate(() => window.actions.length), 1, 'Repeated confirmation sends only one mutation');
    assert.equal(await failed.getByRole('button', { name: 'Allow one extra attempt' }).count(), 0, 'Already granted attempt is not offered again');
    await failed.getByRole('button', { name: 'Return unfinished lesson slot' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm slot return' }).click();
    await page.getByRole('status').filter({ hasText: 'unfinished lesson slot for' }).waitFor();
    assert.equal(await failed.getByRole('button', { name: 'Return unfinished lesson slot' }).count(), 0);
    for (const label of ['Animals — Lesson overview and plan', 'Transport — PowerPoint export', 'Food — Listening recording']) {
      const row = page.locator(`details[aria-label="${label}"]`);
      await row.locator('summary').first().click();
      assert.equal(await row.getByRole('button', { name: 'Allow one extra attempt' }).count(), 0, `${label} cannot bypass confirmed-failure protection`);
      assert.equal(await row.getByRole('button', { name: 'Return unfinished lesson slot' }).count(), 0);
    }
    await page.evaluate(() => { window.failAction = true; });
    const browserReport = page.locator('details[aria-label="Transport — PowerPoint export"]');
    await browserReport.getByRole('button', { name: 'Mark resolved' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm resolved' }).click();
    await page.getByRole('alertdialog').getByRole('alert').filter({ hasText: 'Action could not be saved.' }).waitFor();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm resolved' }).click();
    await page.getByRole('status').filter({ hasText: 'Issue marked resolved.' }).waitFor();
    await page.getByText('The exact underlying cause is unknown from the available evidence.', { exact: true }).waitFor();
    await page.getByLabel('Search teacher, topic, or part').fill('Animals');
    assert.equal(await page.locator('details[aria-label]').count(), 1);
    await page.getByLabel('Search teacher, topic, or part').fill('');
    await page.getByLabel('Issue status').selectOption('recovered');
    await page.locator('details[aria-label="Colors — Worksheet A"]').waitFor();
    await page.getByRole('tab', { name: 'Teachers', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: 'Teachers & invitations', exact: true }).getAttribute('aria-selected'), 'true', 'Teachers opens invitation and allowance tools');
    await page.getByLabel('Choose a teacher').selectOption('ana');
    await page.getByLabel('Private support note', { exact: true }).fill('Reviewed the answer check. Ask Ana to retry Worksheet A.');
    await page.getByRole('button', { name: 'Save support note' }).click();
    await page.getByText('Private support note saved.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.notes.length), 1);
    await page.getByLabel('Choose a teacher').selectOption('bea');
    await page.getByText(/Detailed generation history is unavailable for this earlier lesson/).waitFor();
    await page.getByText('This lesson no longer uses a slot in the current allowance.', { exact: true }).waitFor();
    await page.getByLabel('Choose a teacher').selectOption('ana');
    assert.equal(await page.getByLabel('Private support note', { exact: true }).inputValue(), 'Reviewed the answer check. Ask Ana to retry Worksheet A.');
    await page.getByRole('region', { name: 'Beta teacher controls' }).waitFor();
    await page.getByRole('tab', { name: 'Budget', exact: true }).click();
    await page.getByText(/1 request with an unconfirmed charge/).waitFor();
    await page.getByRole('tab', { name: 'Teachers', exact: true }).click();
    await page.getByRole('tab', { name: 'Feedback', exact: true }).click();
    await page.getByRole('region', { name: 'Teacher lesson feedback' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await page.getByRole('heading', { name: 'Needs your attention', exact: true }).waitFor();
    await fs.mkdir('.local-runtime/management-ui', { recursive: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: '.local-runtime/management-ui/overview-mobile.png', fullPage: true, animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Dashboard fits a narrow screen');
    await page.getByRole('tab', { name: 'Budget', exact: true }).click();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
    assert.equal(await mobileNav.getByRole('link', { name: 'Management', exact: true }).count(), 1, 'Mobile owner navigation has one Management destination');
    assert.equal(await mobileNav.getByRole('link', { name: 'Lesson allowances', exact: true }).count(), 0);
    await mobileNav.getByRole('link', { name: 'Management', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.id === 'overview');
    await page.getByRole('tab', { name: 'Generation', exact: true }).click();
    await page.locator('details[aria-label="Weather — Worksheet A"]').locator('summary').first().click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: '.local-runtime/management-ui/issues-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Diagnostics fit a narrow screen');
    await page.getByRole('tab', { name: 'All activity', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'tab' && document.activeElement.textContent.startsWith('Issues'));
    await page.getByRole('tab', { name: 'Teachers', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.activeElement?.textContent === 'Generation');
    for (const [hash, primary, secondary, target] of [
      ['overview', 'Overview', null, 'overview'],
      ['teachers', 'Teachers', 'Teachers & invitations', 'teachers'],
      ['feedback', 'Teachers', 'Feedback', 'feedback'],
      ['issues', 'Generation', 'Issues', 'issues'],
      ['activity', 'Generation', 'All activity', 'activity'],
      ['budget', 'Budget', null, 'budget'],
    ]) {
      await mount(true, '/beta-management#' + hash);
      await page.getByRole('tab', { name: primary, exact: true }).waitFor();
      assert.equal(await page.getByRole('tab', { name: primary, exact: true }).getAttribute('aria-selected'), 'true', hash + ' selects its main section');
      if (secondary) assert.equal(await page.getByRole('tab', { name: secondary === 'Issues' ? /^Issues/ : secondary, exact: secondary !== 'Issues' }).getAttribute('aria-selected'), 'true', hash + ' selects its subsection');
      await page.waitForFunction(id => document.activeElement?.id === id, target);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, hash + ' fits mobile');
    }
    await mount(true, '/beta-management#lesson-allowances');
    await page.getByRole('region', { name: 'Beta teacher controls' }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'lesson-allowances');
    await mount(false);
    await page.getByRole('status').filter({ hasText: 'This page is only available to the beta owner.' }).waitFor();
    assert.equal(await page.locator('nav[aria-label="Main navigation"]').getByRole('link', { name: 'Management', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    assert.equal(await page.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('link', { name: 'Management', exact: true }).count(), 0, 'Teachers do not see Management in mobile navigation');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.loads), 0, 'Teacher visits never request management records');
    assert.equal(await page.getByRole('tab').count(), 0);
    await mount(false, '/beta-management', { accessFailure: 'Private backend diagnostic must not be shown to an unverified account.' });
    await page.getByRole('alert').filter({ hasText: 'Could not verify owner access.' }).waitFor();
    await page.getByText(/your session may have expired/).waitFor();
    assert.doesNotMatch(await page.locator('body').innerText(), /Private backend diagnostic/);
    assert.equal(await page.evaluate(() => window.loads), 0, 'An unverified account never requests Management data');
    await mount(true, '/beta-management', { managementError: '<html><title>503 Service Unavailable</title><body>private-first-load-diagnostic</body></html>' });
    await page.getByRole('alert').getByText('A server or gateway returned 503. Its underlying cause was not reported.', { exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('body').innerText(), /private-first-load-diagnostic|The last loaded records are still shown/);
    await page.evaluate(() => { window.managementError = ''; });
    await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
    await page.getByRole('heading', { name: 'Needs your attention', exact: true }).waitFor();
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log(JSON.stringify({ passed: true, checks: ['four primary sections with contextual subsections', 'collapsed optional Overview details', 'keyboard navigation and disclosures', 'sanitized gateway and credential diagnostics', 'stale-data preservation', 'failed first load and refresh recovery', 'unverified access privacy', 'email preferences and setup', 'delivery status', 'submitted settings', 'provider attempts', 'targeted retry confirmation', 'duplicate action guard', 'unfinished slot return', 'unsafe recovery exclusions', 'filtering', 'private notes', 'legacy history', 'existing invitations and feedback', 'budget', 'mobile layout', 'all legacy hash destinations and focus', 'owner isolation'], paidRequests: 0 }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
