// Run after a production build. Fail the lazy viewer download once, then reopen saved progress.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  await fs.mkdir('.local-runtime/performance-tests', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.local-runtime/performance-tests/viewer-retry-'));
  const fixture = JSON.parse(await fs.readFile('comparison/budget-lesson.json', 'utf8'));
  fixture.request.topic = 'Saved viewer recovery lesson';
  fixture.lesson.overview.topic = fixture.request.topic;
  const lesson = {
    id: crypto.randomUUID(), user_id: 'runtime-owner', topic: fixture.request.topic,
    inputs: fixture.request, content: fixture.lesson, created_at: new Date().toISOString(),
    level: fixture.request.level, student_age: fixture.request.studentAge,
    duration_minutes: fixture.request.durationMinutes, main_skill: fixture.request.mainSkill,
  };
  const savedContent = JSON.stringify([lesson]);
  await fs.writeFile(path.join(directory, 'lessons.json'), savedContent);
  let project;
  for (const name of await fs.readdir('.output/public/assets')) {
    if (!name.endsWith('.js')) continue;
    const source = await fs.readFile(path.join('.output/public/assets', name), 'utf8');
    project ??= source.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/)?.[1];
  }
  assert.ok(project, 'Production browser Supabase configuration exists');
  const port = process.env.VIEWER_RUNTIME_PORT || '4184', origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['--experimental-transform-types', 'tests/drafts-runtime-server.mjs'], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, DRAFTS_RUNTIME_FIXTURE: directory, DRAFTS_RUNTIME_PORT: port },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '', browser;
  server.stdout.on('data', data => { serverLog += data; });
  server.stderr.on('data', data => { serverLog += data; });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(origin)).ok; } catch {}
      if (ready) break;
      assert.equal(server.exitCode, null, serverLog);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Production fixture server starts');
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext();
    const token = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.'
      + Buffer.from(JSON.stringify({ sub: 'runtime-owner', email: 'runtime-owner@example.test', aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.'
      + Buffer.from('fixture-signature').toString('base64url');
    await context.addInitScript(({ project, token }) => {
      localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({
        access_token: token, refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600, token_type: 'bearer',
        user: { id: 'runtime-owner', email: 'runtime-owner@example.test', app_metadata: {}, user_metadata: {} },
      }));
    }, { project, token });
    let viewerRequests = 0;
    await context.route('**/*', route => {
      const url = route.request().url();
      if (!url.startsWith(origin)) return route.abort();
      if (/\/assets\/LessonPackageView-[^/]+\.js/.test(url)) {
        viewerRequests += 1;
        if (viewerRequests === 1) return route.abort('failed');
      }
      return route.continue();
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/lessons/' + lesson.id, { waitUntil: 'networkidle' });
    const reopen = page.getByRole('link', { name: 'Reopen saved progress', exact: true });
    await reopen.waitFor();
    assert.equal(viewerRequests, 1, 'The initial viewer download failed');
    await page.evaluate(() => { window.viewerRecoveryDocument = 'original'; });
    await reopen.click();
    await page.getByRole('heading', { name: lesson.topic, exact: true }).waitFor();
    assert.equal(viewerRequests, 2, 'Reopening retries the module in a fresh document');
    assert.equal(await page.evaluate(() => window.viewerRecoveryDocument), undefined, 'Recovery performs full document navigation');
    assert.equal(await fs.readFile(path.join(directory, 'lessons.json'), 'utf8'), savedContent, 'Saved lesson content is unchanged');
    const providerCalls = await fs.readFile(path.join(directory, 'provider.jsonl'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    assert.equal(providerCalls.trim(), '', 'Opening saved progress never calls an AI provider');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    const result = { passed: true, viewerRequests, savedContentPreserved: true, realProviderCalls: 0, fixtureProviderCalls: 0, directory };
    await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
