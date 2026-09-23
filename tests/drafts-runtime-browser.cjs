// Run after a production build. This exercises actual compiled RPCs and durable SQLite stores.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  await fs.mkdir('.local-runtime/drafts-tests', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.local-runtime/drafts-tests/runtime-'));
  let project;
  for (const name of (await fs.readdir('.output/public/assets')).filter(name => name.endsWith('.js'))) {
    const source = await fs.readFile(path.join('.output/public/assets', name), 'utf8');
    project ??= source.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/)?.[1];
    assert.ok(!source.includes('node:sqlite'), 'Server SQLite must not leak into browser modules');
  }
  assert.ok(project, 'Browser Supabase project exists');
  const port = process.env.DRAFTS_RUNTIME_PORT || '3012', origin = `http://127.0.0.1:${port}`;
  let server, serverLog = '', browser;
  const errors = [], blocked = [], checks = [], rpc = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const readJson = async (file, fallback = []) => { try { return JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')); } catch { return fallback; } };
  const calls = async () => { try { return (await fs.readFile(path.join(directory, 'provider.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); } catch { return []; } };
  const saveAttempts = async () => { try { return (await fs.readFile(path.join(directory, 'save-attempts.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).length; } catch { return 0; } };
  async function until(check, label, timeout = 20000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await check()) return; await sleep(100); }
    throw Error('Timed out: ' + label);
  }
  async function startServer() {
    server = spawn(process.execPath, ['--experimental-transform-types', 'tests/drafts-runtime-server.mjs'], {
      cwd: process.cwd(), windowsHide: true, env: { ...process.env, DRAFTS_RUNTIME_FIXTURE: directory, DRAFTS_RUNTIME_PORT: port }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', data => { serverLog += data; }); server.stderr.on('data', data => { serverLog += data; });
    await until(async () => { if (server.exitCode !== null) throw Error('Fixture server exited: ' + serverLog); try { return (await fetch(origin)).ok; } catch { return false; } }, 'production server ready');
  }
  async function stopServer() { if (!server || server.exitCode !== null) return; const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped; }
  function token(user) {
    return Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user, email: user + '@example.test', aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.' + Buffer.from('fixture-signature').toString('base64url');
  }
  async function signedContext(user) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 } });
    context.on('page', page => {
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', async response => { if (response.url().includes('/_serverFn/')) rpc.push({ status: response.status(), url: response.url().split('?')[0], body: await response.text().catch(() => '') }); });
    });
    await context.route('**/*', route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      blocked.push(route.request().url().split('?')[0]); return route.abort();
    });
    await context.addInitScript(({ project, user, token }) => { if (!location.href.startsWith('http')) return; localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({
      access_token: token, refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
      token_type: 'bearer', user: { id: user, email: user + '@example.test', app_metadata: {}, user_metadata: {} },
    })); }, { project, user, token: token(user) });
    return context;
  }
  async function setupLesson(page, topic) {
    await page.goto(origin + '/builder?example=true', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Present Perfect', { exact: true }).fill(topic);
    await page.locator('form').getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: 'Adults', exact: true }).click();
    await page.locator('form').getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'C2', exact: true }).click();
    await until(() => page.getByRole('button', { name: 'Build My Class', exact: true }).isEnabled(), 'active generation allowance');
    assert.equal(await page.locator('form').getByRole('combobox').nth(0).innerText(), 'Adults');
    assert.equal(await page.locator('form').getByRole('combobox').nth(1).innerText(), 'C2');
  }
  async function unfinished(page, topic) {
    await page.goto(origin + '/lessons', { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Unfinished', exact: true }).click();
    const card = page.getByRole('article', { name: topic, exact: true });
    await card.waitFor(); return card;
  }
  function betaState() {
    const db = new DatabaseSync(path.join(directory, 'beta.sqlite'), { readOnly: true });
    try { return JSON.parse(db.prepare('SELECT body FROM beta_state WHERE id=1').get().body); } finally { db.close(); }
  }
  async function sameDocumentNavigate(page, url) {
    await page.evaluate(url => { history.pushState({}, '', url); dispatchEvent(new PopStateEvent('popstate')); }, url);
  }
  try {
    await fs.writeFile(path.join(directory, 'control.json'), JSON.stringify({ delay: { teacherflow_student: 2500 }, failSave: true }));
    await startServer(); browser = await chromium.launch({ headless: true, channel: 'msedge' });
    let context = await signedContext('runtime-teacher'), page = await context.newPage();
    const topic = 'Durable teacher discussion';
    await setupLesson(page, topic);
    // Settings have not generated anything or used a lesson slot yet.
    await sleep(900); await page.goto(origin + '/builder', { waitUntil: 'networkidle' });
    assert.equal(await page.getByPlaceholder('Present Perfect', { exact: true }).inputValue(), topic);
    assert.equal(await page.locator('form').getByRole('combobox').nth(0).innerText(), 'Adults', 'Saved age restored');
    assert.equal(await page.locator('form').getByRole('combobox').nth(1).innerText(), 'C2', 'Saved level restored');
    assert.equal(Object.keys(betaState().teachers['runtime-teacher'].runs).length, 0);
    checks.push('automatic form restore without consuming allowance');
    await page.getByRole('button', { name: 'Build My Class', exact: true }).click();
    await until(async () => (await calls()).some(call => call.name === 'teacherflow_student'), 'student provider request');
    const draftUrl = page.url(); assert.match(draftUrl, /draft=/);
    await page.close();
    await until(() => Object.values(betaState().teachers['runtime-teacher'].runs)[0]?.parts.student?.value !== undefined, 'in-flight stage retained after tab close');
    await context.close();
    // New context has no browser draft cache. Restart proves data comes from durable server storage.
    await stopServer(); await startServer();
    context = await signedContext('runtime-teacher'); page = await context.newPage();
    let card = await unfinished(page, topic);
    await card.getByText('2 of 9 parts completed', { exact: true }).waitFor();
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Unfinished view fits mobile');
    await page.screenshot({ path: path.join(directory, 'unfinished-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1365, height: 1000 });
    await card.getByRole('link', { name: 'Continue unfinished lesson' }).click();
    await page.getByRole('button', { name: 'Continue unfinished lesson', exact: true }).click();
    await page.getByRole('button', { name: 'Retry saving lesson', exact: true }).waitFor();
    assert.equal((await calls()).filter(call => call.name === 'teacherflow_foundation').length, 1);
    assert.equal((await calls()).filter(call => call.name === 'teacherflow_student').length, 1);
    assert.equal(Object.keys(betaState().teachers['runtime-teacher'].runs).length, 1);
    checks.push('tab close, fresh browser, server restart, cached stages, one allowance slot');
    // A second retained lesson lets us change only the search param without remounting the route.
    const secondTopic = 'Second interrupted lesson';
    const secondPage = await context.newPage();
    await setupLesson(secondPage, secondTopic);
    await secondPage.getByRole('button', { name: 'Build My Class', exact: true }).click();
    await until(async () => (await calls()).filter(call => call.name === 'teacherflow_student').length === 2, 'second lesson worksheet started');
    const secondDraftUrl = secondPage.url(); await secondPage.close();
    await until(() => Object.values(betaState().teachers['runtime-teacher'].runs).find(run => run.request.topic === secondTopic)?.parts.student?.value !== undefined, 'second partial draft persisted');
    await page.evaluate(() => window.__sameDocumentDraftMarker = 'kept');
    await sameDocumentNavigate(page, secondDraftUrl);
    await page.getByRole('button', { name: 'Continue unfinished lesson', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Retry saving lesson', exact: true }).count(), 0, 'Partial draft clears the prior complete lesson');
    assert.equal(await page.getByPlaceholder('Present Perfect', { exact: true }).inputValue(), secondTopic);
    assert.equal(await page.evaluate(() => window.__sameDocumentDraftMarker), 'kept');
    await fs.writeFile(path.join(directory, 'control.json'), JSON.stringify({ delay: { teacherflow_teacher: 2000 }, failSave: true }));
    const teacherCalls = (await calls()).filter(call => call.name === 'teacherflow_teacher').length;
    await page.getByRole('button', { name: 'Continue unfinished lesson', exact: true }).click();
    await until(async () => (await calls()).filter(call => call.name === 'teacherflow_teacher').length === teacherCalls + 1, 'second draft answer-key request started');
    await sameDocumentNavigate(page, draftUrl);
    await page.getByRole('button', { name: 'Retry saving lesson', exact: true }).waitFor();
    const callsDuringSwitch = (await calls()).length;
    await until(() => Object.values(betaState().teachers['runtime-teacher'].runs).find(run => run.request.topic === secondTopic)?.parts.teacher?.value !== undefined, 'late old generation persisted');
    await sleep(250);
    assert.equal((await calls()).length, callsDuringSwitch, 'Old workspace cannot start following generation stages');
    assert.equal(Object.values(betaState().teachers['runtime-teacher'].runs).find(run => run.request.topic === secondTopic).parts.studentB, undefined, 'Old workspace cannot advance even an uncharged stage');
    assert.equal(await page.getByRole('button', { name: 'Retry saving lesson', exact: true }).count(), 1, 'Late old generation cannot replace the current lesson');
    await fs.writeFile(path.join(directory, 'control.json'), JSON.stringify({ failSave: true, saveDelayMs: 2000 }));
    const oldSaveCount = await saveAttempts();
    await page.getByRole('button', { name: 'Retry saving lesson', exact: true }).click();
    await until(async () => await saveAttempts() > oldSaveCount, 'delayed save started');
    await sameDocumentNavigate(page, secondDraftUrl);
    await page.getByRole('button', { name: 'Continue unfinished lesson', exact: true }).waitFor();
    await sleep(2300);
    assert.equal(await page.getByRole('button', { name: 'Retry saving lesson', exact: true }).count(), 0, 'Late old save cannot replace the current partial draft');
    assert.equal(await page.getByPlaceholder('Present Perfect', { exact: true }).inputValue(), secondTopic);
    checks.push('same-route draft switch clears old lesson and fences late generation/save responses');
    await fs.writeFile(path.join(directory, 'control.json'), JSON.stringify({ failSave: true }));
    await page.close(); page = await context.newPage();
    card = await unfinished(page, topic);
    await card.getByText('Ready to save', { exact: true }).waitFor();
    const beforeReview = (await calls()).length;
    await fs.writeFile(path.join(directory, 'control.json'), '{}');
    const savedRequest = page.waitForRequest(request => request.url().includes('/_serverFn/') && request.method() === 'POST' && /draftId/.test(request.postData() || ''));
    await card.getByRole('link', { name: 'Finish saving lesson' }).click();
    assert.equal((await calls()).length, beforeReview);
    const request = await savedRequest;
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    assert.equal((await readJson('lessons.json')).length, 1);
    const headers = await request.allHeaders(); delete headers['content-length']; delete headers.host;
    const replay = await page.evaluate(async ({ url, headers, body }) => {
      const response = await fetch(url, { method: 'POST', headers, body }); return { status: response.status, body: await response.text() };
    }, { url: request.url(), headers, body: request.postData() });
    assert.equal(replay.status, 200); assert.equal((await readJson('lessons.json')).length, 1);
    await fs.writeFile(path.join(directory, 'control.json'), JSON.stringify({ editDelayMs: 2000 }));
    const overview = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Overview', exact: true }) });
    await overview.getByRole('button', { name: 'Edit', exact: true }).click();
    await overview.getByRole('textbox').first().fill('Teacher edit retained after switching drafts');
    await overview.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await until(async () => { try { return (await fs.readFile(path.join(directory, 'edit-attempts.jsonl'), 'utf8')).includes('at'); } catch { return false; } }, 'delayed edit update started');
    await sameDocumentNavigate(page, secondDraftUrl);
    await page.getByRole('button', { name: 'Continue unfinished lesson', exact: true }).waitFor();
    await until(async () => (await readJson('lessons.json'))[0]?.content.overview.topic === 'Teacher edit retained after switching drafts', 'late edit legitimately saved to original lesson');
    await sleep(250);
    assert.equal(await page.getByPlaceholder('Present Perfect', { exact: true }).inputValue(), secondTopic);
    assert.equal(await page.getByRole('button', { name: 'Continue unfinished lesson', exact: true }).count(), 1);
    checks.push('late edit save keeps original library update without replacing newly opened draft');
    await fs.writeFile(path.join(directory, 'control.json'), '{}');
    await page.goto(origin + '/lessons', { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Unfinished', exact: true }).click();
    await page.getByRole('article', { name: secondTopic, exact: true }).waitFor();
    assert.equal(await page.getByRole('article', { name: topic, exact: true }).count(), 0);
    checks.push('library outage retains complete draft; automatic saving recovery and idempotent save');
    const firstSaved = (await readJson('lessons.json'))[0];
    const beforeSameRequest = (await calls()).length;
    await setupLesson(page, topic);
    await page.getByRole('button', { name: 'Build My Class', exact: true }).click();
    await page.waitForURL('**/lessons/' + firstSaved.id);
    await sleep(250);
    assert.equal(page.url(), origin + '/lessons/' + firstSaved.id);
    await page.getByText('Teacher edit retained after switching drafts', { exact: true }).first().waitFor();
    assert.equal((await calls()).length, beforeSameRequest);
    assert.equal((await readJson('lessons.json')).length, 1);
    checks.push('building the same saved request opens its saved lesson without AI or duplicate saving');
    const other = await signedContext('runtime-other'), otherPage = await other.newPage();
    await otherPage.goto(origin + '/lessons', { waitUntil: 'networkidle' });
    await otherPage.getByRole('tab', { name: 'Unfinished', exact: true }).click();
    await otherPage.getByText('No unfinished lessons', { exact: true }).waitFor();
    await otherPage.goto(draftUrl, { waitUntil: 'networkidle' });
    await otherPage.getByText('Could not open the latest draft progress', { exact: true }).waitFor();
    assert.equal(await otherPage.getByRole('button', { name: 'Save lesson', exact: true }).count(), 0);
    assert.equal(await otherPage.getByPlaceholder('Present Perfect', { exact: true }).inputValue(), '');
    checks.push('separate-account draft and input isolation');
    await other.close();
    const owner = await signedContext('runtime-owner'), ownerPage = await owner.newPage();
    await setupLesson(ownerPage, 'Owner retained discussion');
    await ownerPage.getByRole('button', { name: 'Build My Class', exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    const ownerCalls = (await calls()).length;
    const stored = await readJson('lessons.json');
    const editedOwner = stored.find(row => row.user_id === 'runtime-owner');
    editedOwner.content.overview.topic = 'Owner edited lesson must be retained';
    await fs.writeFile(path.join(directory, 'lessons.json'), JSON.stringify(stored));
    await ownerPage.reload({ waitUntil: 'networkidle' });
    await ownerPage.waitForURL('**/lessons/' + editedOwner.id);
    await ownerPage.getByText('Owner edited lesson must be retained', { exact: true }).first().waitFor();
    assert.equal((await calls()).length, ownerCalls);
    assert.ok(!betaState().teachers['runtime-owner']);
    checks.push('owner draft reload opens latest saved edits without beta allowance or repeat generation');
    await owner.close(); await context.close();
    assert.deepEqual(errors, []);
    assert.ok(blocked.every(url => url.startsWith('https://fonts.googleapis.com/')), 'No unmocked external app services');
    console.log(JSON.stringify({ passed: true, checks, realProviderCalls: 0, fixtureProviderCalls: (await calls()).length, directory }));
  } catch (error) {
    await fs.writeFile(path.join(directory, 'failure.json'), JSON.stringify({ message: error.message, errors, blocked }, null, 2));
    await fs.writeFile(path.join(directory, 'rpc.json'), JSON.stringify(rpc, null, 2));
    for (const [index, page] of (browser?.contexts().flatMap(context => context.pages()) || []).entries()) {
      await fs.writeFile(path.join(directory, `page-${index}.txt`), await page.locator('body').innerText().catch(() => 'unavailable'));
      await fs.writeFile(path.join(directory, `settings-${index}.json`), JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('teacherflow-builder-settings')))).catch(() => ({})), null, 2));
      await page.screenshot({ path: path.join(directory, `page-${index}.png`), fullPage: true }).catch(() => {});
    }
    throw error;
  } finally {
    await fs.writeFile(path.join(directory, 'server.log'), serverLog);
    await browser?.close(); await stopServer();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
