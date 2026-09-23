// Production network check: public pages must not download the lesson editor before a lesson exists.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  await fs.mkdir('.local-runtime/performance-tests', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.local-runtime/performance-tests/browser-'));
  const origin = 'http://127.0.0.1:4182';
  const server = spawn(process.execPath, ['--experimental-transform-types', 'tests/drafts-runtime-server.mjs'], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, DRAFTS_RUNTIME_FIXTURE: directory, DRAFTS_RUNTIME_PORT: '4182' }, stdio: 'ignore',
  });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(origin)).ok; } catch {}
      if (ready) break;
      assert.equal(server.exitCode, null, 'Fixture server must remain running');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Production fixture server starts');
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const reports = [];
    for (const pathname of ['/', '/builder', '/auth']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + pathname, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('navigation', { name: 'Mobile navigation' }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Navigation fits a phone');
      await page.keyboard.press('Escape');
      const assets = await page.evaluate(() => performance.getEntriesByType('resource')
        .filter(item => item.name.includes('/assets/') && item.name.endsWith('.js'))
        .map(item => ({ name: new URL(item.name).pathname.split('/').at(-1), bytes: item.decodedBodySize })));
      assert.ok(!assets.some(item => item.name.startsWith('LessonPackageView-')), 'Lesson viewer is deferred until a lesson is ready');
      assert.deepEqual(errors, [], 'No browser application errors');
      reports.push({ pathname, jsBytes: assets.reduce((sum, item) => sum + item.bytes, 0), assets });
      await context.close();
    }
    await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify(reports, null, 2));
    console.log(JSON.stringify({ passed: true, reports, directory, realProviderCalls: 0 }));
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
