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
    await page.route('**/src/lib/beta.functions.ts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const betaStatus=async()=>({enabled:true,owner:window.owner});' }));
    await page.route('**/src/lib/beta-admin.functions.ts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const listBetaTeachers=async()=>({seats:[],removed:[]});export const manageBetaTeacher=async()=>{throw Error("Unexpected teacher mutation")};export const createBetaInvitation=manageBetaTeacher;export const resetBetaAllowance=manageBetaTeacher;' }));
    await page.route('**/src/lib/teacher-tools.functions.ts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const listTeacherFeedback=async()=>({entries:[],more:false});' }));
    await page.route('**/src/lib/management.functions.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
      export const loadManagement=async()=>{window.loads++;return structuredClone(window.managementData)};
      export const manageGeneration=async({data})=>{window.actions.push(data);await new Promise(r=>setTimeout(r,120));if(window.failAction){window.failAction=false;throw Error('Action could not be saved. Try again.');}const row=window.managementData.operations.find(r=>r.id===data.id);if(data.action==='resolve')row.issue='resolved';if(data.action==='restore_slot')window.managementData.lessons.find(l=>l.key===row.lesson).credited=true;window.managementData.audit.push({id:data.action+':'+data.id,actor:'owner',user:row.user,action:data.action,detail:row.part,created:Date.now()});return {ok:true}};
      export const saveSupportNote=async({data})=>{window.notes.push(data);window.managementData.notes=[{...data,updated:Date.now()}];return {ok:true}};
      export const saveManagementNotifications=async({data})=>{window.preferences.push(data);window.managementData.settings=data;return {ok:true}};
    ` }));
    async function mount(owner = true, path = '/beta-management') {
      await page.goto(origin + '/management-test');
      await page.evaluate(async ({ owner, path }) => {
        window.owner = owner; window.loads = 0; window.actions = []; window.notes = []; window.preferences = [];
        const now = Date.now();
        const request = { subject: 'English', topic: 'Weather', studentAge: '8-9', level: 'A1', durationMinutes: 45, mainSkill: 'Speaking', secondarySkill: 'Reading', learningObjective: 'Describe the weather with complete sentences.', teacherNotes: 'Use simple examples and warm colors.', groupWorkEnabled: true, studentsPerGroup: 4, classroomLimitations: 'No internet in class' };
        const failed = { id: '10000000-0000-4000-8000-000000000001', user: 'ana', lesson: 'weather', part: 'student', detail: 'Worksheet A', target: '', source: 'server', status: 'failed', issue: 'open', started: now - 60000, updated: now - 50000, finished: now - 50000, request, failure: { category: 'content', explanation: 'Generated material did not pass its content checks.', nextAction: 'Review the diagnostic details and allow a targeted retry.', detail: 'One question was missing an answer.' }, providers: [{ model: 'provider/example-model', kind: 'text', status: 200, ms: 900, at: now - 55000, detail: 'Content validation failed.' }] };
        const lesson = { user: 'ana', key: 'weather', request, complete: false, credited: false, steps: [{ part: 'foundation', complete: true, attempts: 1, running: false }, { part: 'student', complete: false, attempts: 2, running: false }, { part: 'teacher', complete: false, attempts: 0, running: false }] };
        window.managementData = { operations: [failed,
          { ...failed, id: '10000000-0000-4000-8000-000000000002', lesson: 'interrupted', part: 'foundation', status: 'interrupted', request: { ...request, topic: 'Animals' }, failure: { category: 'unknown', explanation: 'No completion was recorded.', nextAction: 'Review saved progress.', detail: 'Cause unknown.' }, providers: [] },
          { ...failed, id: '10000000-0000-4000-8000-000000000003', lesson: 'browser', source: 'browser', part: 'export', request: { ...request, topic: 'Transport' }, providers: [] },
          { ...failed, id: '10000000-0000-4000-8000-000000000004', lesson: 'billing', part: 'recording', request: { ...request, topic: 'Food' }, failure: { category: 'uncertain_charge', explanation: 'Provider charge could not be confirmed.', nextAction: 'Review the provider charge.', detail: 'Awaiting charge confirmation.' } },
          { ...failed, id: '10000000-0000-4000-8000-000000000005', lesson: 'restored', status: 'recovered', issue: 'recovered', request: { ...request, topic: 'Colors' }, failure: null },
          { ...failed, id: '10000000-0000-4000-8000-000000000006', lesson: 'running', status: 'generating', issue: 'none', request: { ...request, topic: 'Hobbies' }, failure: null },
          { ...failed, id: '10000000-0000-4000-8000-000000000007', lesson: 'running', source: 'browser', status: 'generating', issue: 'none', request: { ...request, topic: 'Hobbies' }, failure: null }
        ], teachers: [{ user: 'ana', name: 'Ana Teacher', email: 'ana@example.test', revoked: false }, { user: 'bea', name: 'Bea Teacher', email: 'bea@example.test', revoked: false }], lessons: [lesson, { ...lesson, user: 'bea', key: 'legacy', complete: true, credited: true, steps: lesson.steps.map(step => ({ ...step, complete: true })), request: { ...request, topic: 'Earlier lesson' } }], notes: [], audit: [], history: [{ action: 'reset-allowance', user: 'ana', actor: 'owner', seat: 1, at: new Date(now).toISOString() }], budget: { limitUsd: 10, accountedUsd: 0.25, reservedUsd: 0.1, remainingUsd: 9.65, paused: false }, spending: [{ user: 'ana', kind: 'text', model: 'provider/example-model', requests: 3, confirmedUsd: 0.25, reservedUsd: 0.1, uncertain: 1 }], settings: { emailEnabled: true, dailySummary: false }, email: { configured: false, from: '', to: 'owner@example.test', missing: ['RESEND_API_KEY', 'TEACHERFLOW_ALERT_FROM'] }, alerts: [{ id: 'a', status: 'accepted', created: now, attempts: 1, error: null }, { id: 'b', status: 'queued', created: now, attempts: 2, error: 'Email delivery was interrupted; waiting to retry.' }] };
        await (await import('/tests/management-fixture.tsx')).mount(path);
      }, { owner, path });
    }
    await mount();
    await page.getByRole('heading', { name: 'Management', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Needs your attention', exact: true }).waitFor();
    assert.equal(await page.getByRole('tab').count(), 6);
    await page.getByText('Generating now', { exact: true }).locator('../..').getByText('1', { exact: true }).waitFor();
    await page.getByText('2 confirmed server failures · 2 reports needing investigation', { exact: true }).waitFor();
    await page.getByLabel('Include a daily issue summary').click();
    await page.getByRole('button', { name: 'Save email preferences' }).click();
    await page.getByText('Email preferences saved.', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.preferences), [{ emailEnabled: true, dailySummary: true }]);
    await page.getByText('Email setup instructions', { exact: true }).click();
    await page.getByText(/In the hosting service’s server environment settings/).waitFor();
    await page.getByText('Recent email delivery status (2)', { exact: true }).click();
    await page.getByText(/Inbox delivery is not verified/).waitFor();
    await page.getByRole('tab', { name: /^Issues/ }).click();
    await page.getByLabel('Filter by teacher').selectOption('ana');
    await page.getByLabel('Generation status').selectOption('interrupted');
    assert.equal(await page.locator('details[aria-label]').count(), 1);
    await page.getByLabel('Generation status').selectOption('all');
    const failed = page.locator('details[aria-label="Weather — Worksheet A"]');
    await failed.locator('summary').first().click();
    await failed.getByText('Full submitted lesson settings', { exact: true }).click();
    await failed.getByText('No internet in class', { exact: true }).waitFor();
    await failed.getByText('Provider attempts (1)', { exact: true }).click();
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
    await page.getByRole('tab', { name: 'Feedback', exact: true }).click();
    await page.getByRole('region', { name: 'Teacher lesson feedback' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await fs.mkdir('.local-runtime/management-ui', { recursive: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: '.local-runtime/management-ui/overview-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Dashboard fits a narrow screen');
    await page.getByRole('tab', { name: /^Issues/ }).click();
    await page.locator('details[aria-label="Weather — Worksheet A"]').locator('summary').first().click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: '.local-runtime/management-ui/issues-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Diagnostics fit a narrow screen');
    await mount(true, '/beta-management#lesson-allowances');
    await page.getByRole('region', { name: 'Beta teacher controls' }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'lesson-allowances');
    await mount(false);
    await page.getByRole('status').filter({ hasText: 'This page is only available to the beta owner.' }).waitFor();
    assert.equal(await page.evaluate(() => window.loads), 0, 'Teacher visits never request management records');
    assert.equal(await page.getByRole('tab').count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log(JSON.stringify({ passed: true, checks: ['six sections', 'email preferences and setup', 'delivery status', 'submitted settings', 'provider attempts', 'targeted retry confirmation', 'duplicate action guard', 'unfinished slot return', 'unsafe recovery exclusions', 'filtering', 'private notes', 'legacy history', 'existing invitations and feedback', 'budget', 'mobile layout', 'legacy hash navigation', 'owner isolation'], paidRequests: 0 }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
